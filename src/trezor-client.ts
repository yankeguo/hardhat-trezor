import { isValidAddress } from "@nomicfoundation/ethereumjs-util";
import { HardhatTrezorError } from "./errors";
import { TrezorMessageType, TrezorWire } from "./trezor-wire";

export const defaultTrezorBridgeURL = "http://127.0.0.1:21325";

export interface TrezorClientOptions {
  bridgeURL?: string;
  wire: TrezorWire;
}

export class TrezorClient {
  bridgeURL: string;
  wire: TrezorWire;

  static encodePayload(code: number, data: Uint8Array) {
    // BE, 2 bytes (4 hex chars), message type
    // BE, 4 bytes (8 hex chars), message length
    // message payload
    const bytes = new Uint8Array(6 + data.length);
    const view = new DataView(bytes.buffer);
    view.setUint16(0, code, false);
    view.setUint32(2, data.length, false);
    bytes.set(data, 6);
    return Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  static decodePayload(hex: string) {
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

  async _invoke(path: string, body: any = {}) {
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

  async version() {
    const resp = await this._invoke("/");
    return (await resp.json()) as {
      version: string;
    };
  }

  async enumerate() {
    const resp = await this._invoke("/enumerate");
    return (await resp.json()) as {
      path: string;
      session?: string;
    }[];
  }

  async acquire(path: string, previous?: string) {
    const resp = await this._invoke(
      `/acquire/${path}/${previous ?? "null"}`,
      {},
    );
    return (await resp.json()) as { session: string };
  }

  async release(session: string) {
    await this._invoke(`/release/${session}`, {});
  }

  async call(
    session: string,
    typeIn: TrezorMessageType,
    typeOut: TrezorMessageType,
    dataIn: any,
  ) {
    let resp = await this._call(session, typeIn, dataIn);
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
        if (resp.code != typeOut.code) {
          throw new HardhatTrezorError(
            `Unexpected response message type:${resp.code}`,
          );
        }
        return typeOut.type.decode(resp.data).toJSON();
      }
    }
  }

  async _call(
    session: string,
    typeIn: TrezorMessageType,
    dataIn: any,
  ): Promise<{ code: number; data: Uint8Array }> {
    const resp = await this._invoke(
      `/call/${session}`,
      TrezorClient.encodePayload(
        typeIn.code,
        typeIn.type.encode(dataIn).finish(),
      ),
    );
    return TrezorClient.decodePayload(await resp.text());
  }

  async _write(
    session: string,
    typeIn: TrezorMessageType,
    dataIn: any,
  ): Promise<void> {
    await this._invoke(
      `/post/${session}`,
      TrezorClient.encodePayload(
        typeIn.code,
        typeIn.type.encode(dataIn).finish(),
      ),
    );
    return;
  }

  async _read(session: string): Promise<{ code: number; data: Uint8Array }> {
    const resp = await this._invoke(`/read/${session}`, "");
    const { code, data } = TrezorClient.decodePayload(await resp.text());
    return { code, data };
  }

  async callInitialize(session: string) {
    return this.call(session, this.wire.Initialize, this.wire.Features, {});
  }

  async callEndSession(session: string) {
    return this.call(session, this.wire.EndSession, this.wire.Success, {});
  }

  async callEthereumGetAddress(session: string, derivationPath: number[]) {
    const accounts = [];

    const { address: addressBatch } = (await this.call(
      session,
      this.wire.EthereumGetAddress,
      this.wire.EthereumAddress,
      { addressN: derivationPath },
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
}
