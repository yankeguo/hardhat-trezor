import { isValidAddress } from "@nomicfoundation/ethereumjs-util";
import { HardhatTrezorError } from "./errors";
import {
  TrezorWireEIP712,
  TrezorWireMessageType,
  TrezorWire,
} from "./trezor-wire";
import { EIP712Message } from "./types";
import {
  base64ToBytes,
  base64ToHex,
  bytesToHex,
  numberToBytes,
} from "./encoding";

export const defaultTrezorBridgeURL = "http://127.0.0.1:21325";

export interface TrezorClientOptions {
  bridgeURL?: string;
  wire: TrezorWire;
}

export class TrezorClient {
  bridgeURL: string;
  wire: TrezorWire;

  private _encodePayload(code: number, data: Uint8Array) {
    // BE, 2 bytes (4 hex chars), message type
    // BE, 4 bytes (8 hex chars), message length
    // message payload
    const bytes = new Uint8Array(6 + data.length);
    const view = new DataView(bytes.buffer);
    view.setUint16(0, code, false);
    view.setUint32(2, data.length, false);
    bytes.set(data, 6);
    return bytesToHex(bytes);
  }

  private _decodePayload(hex: string) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    const view = new DataView(bytes.buffer);
    const code = view.getUint16(0, false);
    const length = view.getUint32(2, false);
    const data = bytes.slice(6);
    if (length !== data.length) {
      throw new HardhatTrezorError("Invalid response message length");
    }
    return { code, data };
  }

  constructor(opts: TrezorClientOptions) {
    let bridgeURL = opts.bridgeURL ?? defaultTrezorBridgeURL;
    if (bridgeURL.endsWith("/")) {
      bridgeURL = bridgeURL.slice(0, -1);
    }
    this.bridgeURL = bridgeURL;
    this.wire = opts.wire;
  }

  private async _invoke(path: string, body: any = {}) {
    if (!path.startsWith("/")) {
      path = `/${path}`;
    }
    try {
      return await fetch(`${this.bridgeURL}${path}`, {
        // all requests are POST
        method: "POST",
        body: typeof body == "string" ? body : JSON.stringify(body),
        headers: {
          ContentType:
            typeof body == "string" ? "text/plain" : "application/json",
          Accept: "*/*",
          // trezor-bridge requires origin from some whitelisted domains
          Origin: "http://localhost:5000",
        },
      });
    } catch (e) {
      if (e instanceof Error) {
        throw new HardhatTrezorError(
          `Failed to invoke Trezor Bridge: ${e.message}`,
          e,
        );
      } else {
        throw new HardhatTrezorError(String(e));
      }
    }
  }

  public async version() {
    const resp = await this._invoke("/");
    return (await resp.json()) as {
      version: string;
    };
  }

  public async enumerate() {
    const resp = await this._invoke("/enumerate");
    return (await resp.json()) as {
      path: string;
      session?: string;
    }[];
  }

  public async acquire(path: string, previous?: string) {
    const resp = await this._invoke(
      `/acquire/${path}/${previous ?? "null"}`,
      {},
    );
    return (await resp.json()) as { session: string };
  }

  public async release(session: string) {
    await this._invoke(`/release/${session}`, {});
  }

  private async _call(
    session: string,
    typeIn: TrezorWireMessageType,
    dataIn: any,
  ): Promise<{ code: number; data: Uint8Array }> {
    const resp = await this._invoke(
      `/call/${session}`,
      this._encodePayload(typeIn.code, typeIn.type.encode(dataIn).finish()),
    );
    return this._decodePayload(await resp.text());
  }

  private async _handlePayload(
    session: string,
    resp: { code: number; data: Uint8Array },
  ) {
    while (true) {
      if (resp.code == this.wire.PinMatrixRequest.code) {
        console.log("Please enter your PIN on the Trezor device");
        await this._write(session, this.wire.PinMatrixAck, { pin: "000000" });
        resp = await this._read(session);
      } else if (resp.code == this.wire.PassphraseRequest.code) {
        console.log("Please enter your passphrase on the Trezor device");
        await this._write(session, this.wire.PassphraseAck, {
          on_device: true,
        });
        resp = await this._read(session);
      } else if (resp.code == this.wire.ButtonRequest.code) {
        const data = this.wire.ButtonRequest.type.decode(resp.data).toJSON();
        console.log("Please confirm action on the Trezor device", data);
        await this._write(session, this.wire.ButtonAck, {});
        resp = await this._read(session);
      } else if (resp.code == this.wire.Failure.code) {
        const error = this.wire.Failure.type.decode(resp.data).toJSON() as {
          code?: number;
          message?: string;
        };
        throw new HardhatTrezorError(
          `Trezor failure: ${error.code}:${error.message}`,
        );
      } else {
        return resp;
      }
    }
  }

  private async _read(
    session: string,
  ): Promise<{ code: number; data: Uint8Array }> {
    const resp = await this._invoke(`/read/${session}`, "");
    return this._decodePayload(await resp.text());
  }

  public async readRaw(session: string) {
    return this._handlePayload(session, await this._read(session));
  }

  private async _write(
    session: string,
    typeIn: TrezorWireMessageType,
    dataIn: any,
  ): Promise<void> {
    await this._invoke(
      `/post/${session}`,
      this._encodePayload(typeIn.code, typeIn.type.encode(dataIn).finish()),
    );
    return;
  }

  public async callRaw(
    session: string,
    typeIn: TrezorWireMessageType,
    dataIn: any,
  ) {
    return this._handlePayload(
      session,
      await this._call(session, typeIn, dataIn),
    );
  }

  public async call(
    session: string,
    typeIn: TrezorWireMessageType,
    typeOut: TrezorWireMessageType,
    dataIn: any,
  ) {
    const { code, data } = await this.callRaw(session, typeIn, dataIn);
    if (code != typeOut.code) {
      throw new HardhatTrezorError(`Unexpected response message type:${code}`);
    }
    return typeOut.type.decode(data).toJSON();
  }

  public async callInitialize(session: string) {
    return this.call(session, this.wire.Initialize, this.wire.Features, {});
  }

  public async callEndSession(session: string) {
    return this.call(session, this.wire.EndSession, this.wire.Success, {});
  }

  public async callEthereumGetAddress(
    session: string,
    args: { addressN: number[]; encodedNetwork: Uint8Array },
  ) {
    const accounts = [];

    const { address: addressBatch } = (await this.call(
      session,
      this.wire.EthereumGetAddress,
      this.wire.EthereumAddress,
      args,
    )) as { address: string };

    for (let address of addressBatch.split("\n")) {
      address = address.trim();
      if (address === "") {
        continue;
      }
      if (!isValidAddress(address)) {
        throw new HardhatTrezorError("Invalid address received from Trezor");
      }
      accounts.push(address.toLowerCase());
    }
    return accounts;
  }

  public async callEthereumSignMessage(
    session: string,
    args: {
      addressN: number[];
      message: Uint8Array;
      encodedNetwork: Uint8Array;
    },
  ) {
    const { signature: signatureBase64 } = (await this.call(
      session,
      this.wire.EthereumSignMessage,
      this.wire.EthereumMessageSignature,
      args,
    )) as { signature: string };
    return base64ToHex(signatureBase64);
  }

  public async callEthereumSignTypedData(
    session: string,
    message: EIP712Message,
    args: {
      addressN: number[];
      definitions: { encodedNetwork: Uint8Array; encodedToken?: Uint8Array };
    },
  ) {
    const converter = new TrezorWireEIP712(message);

    let resp = await this.callRaw(
      session,
      this.wire.EthereumSignTypedData,
      Object.assign(args, { primaryType: message.primaryType }),
    );

    while (true) {
      switch (resp.code) {
        case this.wire.EthereumTypedDataStructRequest.code: {
          const { name } = this.wire.EthereumTypedDataStructRequest.type
            .decode(resp.data)
            .toJSON() as { name: string };
          await this._write(
            session,
            this.wire.EthereumTypedDataStructAck,
            converter.createEthereumTypedDataStructAck(name),
          );
          resp = await this.readRaw(session);
          break;
        }
        case this.wire.EthereumTypedDataValueRequest.code: {
          const { memberPath } = this.wire.EthereumTypedDataValueRequest.type
            .decode(resp.data)
            .toJSON() as { memberPath: number[] };
          await this._write(
            session,
            this.wire.EthereumTypedDataValueAck,
            converter.createEthereumTypedDataValueAck(memberPath),
          );
          resp = await this.readRaw(session);
          break;
        }
        case this.wire.EthereumTypedDataSignature.code: {
          const { signature: signatureBase64 } =
            this.wire.EthereumTypedDataSignature.type
              .decode(resp.data)
              .toJSON() as {
              signature: string;
            };
          return base64ToHex(signatureBase64);
        }
        default: {
          throw new HardhatTrezorError(
            `Unexpected response message type:${resp.code}`,
          );
        }
      }
    }
  }

  public async callEthereumSignTx(
    session: string,
    derivationPath: number[],
    tx: {
      nonce?: Uint8Array;
      gasPrice: Uint8Array;
      gasLimit: Uint8Array;
      to?: string;
      value?: Uint8Array;
      chainId: number;
      data?: Uint8Array;
      definitions?: { encodedNetwork?: Uint8Array; encodedToken?: Uint8Array };
    },
  ) {
    let body: Record<string, any> = {
      addressN: derivationPath,
      nonce: tx.nonce,
      gasPrice: tx.gasPrice,
      gasLimit: tx.gasLimit,
      to: tx.to,
      value: tx.value ?? numberToBytes(0),
      chainId: tx.chainId,
      definitions: tx.definitions,
    };
    let dataPos = 0;
    if (tx.data) {
      const chunk = tx.data.length > 1024 ? tx.data.slice(0, 1024) : tx.data;
      body["dataInitialChunk"] = chunk;
      body["dataLength"] = tx.data.length;
      dataPos = chunk.length;
    }
    let resp = await this.callRaw(session, this.wire.EthereumSignTx, body);
    while (true) {
      switch (resp.code) {
        case this.wire.EthereumTxRequest.code: {
          const { dataLength, signatureV, signatureR, signatureS } =
            this.wire.EthereumTxRequest.type.decode(resp.data).toJSON() as {
              dataLength?: number;
              signatureV?: number;
              signatureR?: string;
              signatureS?: string;
            };
          if (dataLength !== undefined) {
            const chunk = tx.data?.slice(dataPos, dataPos + dataLength);
            dataPos += dataLength;
            await this._write(session, this.wire.EthereumTxAck, {
              dataChunk: chunk,
            });
            resp = await this.readRaw(session);
          } else if (signatureV !== undefined) {
            return {
              v: signatureV,
              r: base64ToBytes(signatureR!),
              s: base64ToBytes(signatureS!),
            };
          } else {
            throw new HardhatTrezorError("Invalid response message");
          }
          break;
        }
        default:
          throw new HardhatTrezorError(
            `Unexpected response message type:${resp.code}`,
          );
      }
    }
  }

  public async callEthereumSignTxEIP1559(
    session: string,
    derivationPath: number[],
    tx: {
      nonce?: Uint8Array;
      gasLimit: Uint8Array;
      maxGasFee: Uint8Array;
      maxPriorityFee: Uint8Array;
      to?: string;
      value?: Uint8Array;
      chainId: number;
      data?: Uint8Array;
      accessList?: Array<{ address: string; storageKeys?: Uint8Array[] }>;
      definitions?: { encodedNetwork?: Uint8Array; encodedToken?: Uint8Array };
    },
  ) {
    let body: Record<string, any> = {
      addressN: derivationPath,
      nonce: tx.nonce,
      gasLimit: tx.gasLimit,
      maxGasFee: tx.maxGasFee,
      maxPriorityFee: tx.maxPriorityFee,
      to: tx.to,
      value: tx.value ?? numberToBytes(0),
      chainId: tx.chainId,
      accessList: tx.accessList,
      definitions: tx.definitions,
    };
    let dataPos = 0;
    if (tx.data) {
      const chunk = tx.data.length > 1024 ? tx.data.slice(0, 1024) : tx.data;
      body["dataInitialChunk"] = chunk;
      body["dataLength"] = tx.data.length;
      dataPos = chunk.length;
    }
    console.debug(body);
    let resp = await this.callRaw(
      session,
      this.wire.EthereumSignTxEIP1559,
      body,
    );
    while (true) {
      switch (resp.code) {
        case this.wire.EthereumTxRequest.code: {
          const { dataLength, signatureV, signatureR, signatureS } =
            this.wire.EthereumTxRequest.type.decode(resp.data).toJSON() as {
              dataLength?: number;
              signatureV?: number;
              signatureR?: string;
              signatureS?: string;
            };
          if (dataLength !== undefined) {
            const chunk = tx.data?.slice(dataPos, dataPos + dataLength);
            dataPos += dataLength;
            await this._write(session, this.wire.EthereumTxAck, {
              dataChunk: chunk,
            });
            resp = await this.readRaw(session);
          } else if (signatureV !== undefined) {
            return {
              v: signatureV,
              r: base64ToBytes(signatureR!),
              s: base64ToBytes(signatureS!),
            };
          } else {
            throw new HardhatTrezorError("Invalid response message");
          }
          break;
        }
        default:
          throw new HardhatTrezorError(
            `Unexpected response message type:${resp.code}`,
          );
      }
    }
  }
}
