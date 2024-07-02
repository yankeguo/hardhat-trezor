import * as t from "io-ts";
import { validateParams } from "hardhat/internal/core/jsonrpc/types/input/validation";
import {
  rpcAddress,
  rpcData,
} from "hardhat/internal/core/jsonrpc/types/base-types";
import { rpcQuantityToBigInt } from "hardhat/internal/core/jsonrpc/types/base-types";

import { rpcTransactionRequest } from "hardhat/internal/core/jsonrpc/types/input/transactionRequest";
import { ERRORS } from "hardhat/internal/core/errors-list";
import { ProviderWrapperWithChainId } from "hardhat/internal/core/providers/chainId";
import {
  EIP1193Provider,
  NetworkConfig,
  RequestArguments,
} from "hardhat/types";
import {
  HardhatTrezorAccountNotManagedError,
  HardhatTrezorError,
} from "./errors";
import {
  createTrezorWire,
  TrezorWire,
  trezorWireDefaultDerivationPath,
  trezorWireHardenDerivationPath,
} from "./trezor-wire";
import { TrezorClient } from "./trezor-client";
import { HardhatError } from "hardhat/internal/core/errors";
import { EIP712Message, isEIP712Message } from "./types";
import { ethers } from "ethers";
import {
  bufferToBytes,
  bytesToHex,
  numberToBytes,
  numberToHex,
} from "./encoding";

type TrezorProviderOptions = {
  derivationPaths?: number[][];
  client: TrezorClient;
  wire: TrezorWire;
};

interface TrezorAccount {
  address: string;
  derivationPath: number[];
}

export class TrezorProvider extends ProviderWrapperWithChainId {
  wrappedProvider: EIP1193Provider;

  derivationPaths: number[][];
  client: TrezorClient;
  wire: TrezorWire;

  session: string;
  accounts: TrezorAccount[];

  constructor(opts: TrezorProviderOptions, wrappedProvider: EIP1193Provider) {
    super(wrappedProvider);
    this.wrappedProvider = wrappedProvider;

    let derivationPaths = opts.derivationPaths;
    if (!derivationPaths || derivationPaths.length === 0) {
      derivationPaths = [trezorWireDefaultDerivationPath];
    }
    this.derivationPaths = derivationPaths.map((p) =>
      trezorWireHardenDerivationPath(p),
    );
    this.client = opts.client;
    this.wire = opts.wire;

    this.session = "";
    this.accounts = [];
  }

  private async _initializeSession() {
    const { version } = await this.client.version();

    if (!version) {
      throw new HardhatTrezorError("Trezor Bridge is not running");
    }

    const devices = await this.client.enumerate();

    if (devices.length === 0) {
      throw new HardhatTrezorError("No Trezor devices found");
    }

    const device = devices[0];

    const { session } = await this.client.acquire(device.path, device.session);

    if (!session) {
      throw new HardhatTrezorError("Failed to acquire Trezor device");
    }

    this.session = session;

    process.on("exit", async () => {
      if (this.session) {
        await this.client.callEndSession(this.session);
        await this.client.release(this.session);
        this.session = "";
      }
    });

    await this.client.callInitialize(this.session);
  }

  private async _initializeAccounts() {
    const accounts: TrezorAccount[] = [];
    for (const derivationPath of this.derivationPaths) {
      const addresses = await this.client.callEthereumGetAddress(
        this.session,
        derivationPath,
      );
      for (const address of addresses) {
        accounts.push({ address, derivationPath });
      }
    }
    this.accounts = accounts;
  }

  public async initialize() {
    await this._initializeSession();
    await this._initializeAccounts();
  }

  private _resolveManagedAccount(addrBuf: ArrayLike<number>): TrezorAccount {
    const address = bytesToHex(addrBuf, true).toLowerCase();
    for (const acc of this.accounts) {
      if (acc.address === address) {
        return acc;
      }
    }
    throw new HardhatTrezorAccountNotManagedError(address);
  }

  private async _ethSign(params: any[]) {
    if (params.length == 0) {
      return;
    }

    const [address, data] = validateParams(params, rpcAddress, rpcData);

    if (!address) {
      return;
    }

    if (!data) {
      throw new HardhatError(ERRORS.NETWORK.ETHSIGN_MISSING_DATA_PARAM);
    }

    const account = this._resolveManagedAccount(address);

    return this.client.callEthereumSignMessage(
      this.session,
      account.derivationPath,
      data,
    );
  }

  private async _personalSign(params: any[]) {
    if (params.length == 0) {
      return;
    }

    const [data, address] = validateParams(params, rpcData, rpcAddress);

    if (!data) {
      return;
    }

    if (!address) {
      throw new HardhatError(ERRORS.NETWORK.PERSONALSIGN_MISSING_ADDRESS_PARAM);
    }

    const account = this._resolveManagedAccount(address);

    return this.client.callEthereumSignMessage(
      this.session,
      account.derivationPath,
      data,
    );
  }

  private async _ethSignTypedDataV4(params: any[]) {
    if (params.length == 0) {
      return;
    }
    const [address, data] = validateParams(params, rpcAddress, t.any as any);

    if (!data) {
      throw new HardhatError(ERRORS.NETWORK.ETHSIGN_MISSING_DATA_PARAM);
    }

    let typedMessage: EIP712Message;
    try {
      typedMessage = typeof data === "string" ? JSON.parse(data) : data;

      if (!isEIP712Message(typedMessage)) {
        throw new HardhatError(
          ERRORS.NETWORK.ETHSIGN_TYPED_DATA_V4_INVALID_DATA_PARAM,
        );
      }
    } catch {
      throw new HardhatError(
        ERRORS.NETWORK.ETHSIGN_TYPED_DATA_V4_INVALID_DATA_PARAM,
      );
    }

    const account = this._resolveManagedAccount(address);

    return this.client.callEthereumSignTypedData(
      this.session,
      account.derivationPath,
      typedMessage,
    );
  }
  private async _getNonce(address: Buffer): Promise<bigint> {
    const { bytesToHex } = await import("@nomicfoundation/ethereumjs-util");

    const response = (await this._wrappedProvider.request({
      method: "eth_getTransactionCount",
      params: [bytesToHex(address), "pending"],
    })) as string;

    return rpcQuantityToBigInt(response);
  }

  private async _ethSendTransaction(params: any[]) {
    const [txRequest] = validateParams(params, rpcTransactionRequest);

    if (txRequest.gas === undefined) {
      throw new HardhatError(ERRORS.NETWORK.MISSING_TX_PARAM_TO_SIGN_LOCALLY, {
        param: "gas",
      });
    }

    const hasGasPrice = txRequest.gasPrice !== undefined;
    const hasEip1559Fields =
      txRequest.maxFeePerGas !== undefined ||
      txRequest.maxPriorityFeePerGas !== undefined;

    if (!hasGasPrice && !hasEip1559Fields) {
      throw new HardhatError(ERRORS.NETWORK.MISSING_FEE_PRICE_FIELDS);
    }

    if (hasGasPrice && hasEip1559Fields) {
      throw new HardhatError(ERRORS.NETWORK.INCOMPATIBLE_FEE_PRICE_FIELDS);
    }

    if (hasEip1559Fields && txRequest.maxFeePerGas === undefined) {
      throw new HardhatError(ERRORS.NETWORK.MISSING_TX_PARAM_TO_SIGN_LOCALLY, {
        param: "maxFeePerGas",
      });
    }

    if (hasEip1559Fields && txRequest.maxPriorityFeePerGas === undefined) {
      throw new HardhatError(ERRORS.NETWORK.MISSING_TX_PARAM_TO_SIGN_LOCALLY, {
        param: "maxPriorityFeePerGas",
      });
    }

    if (txRequest.nonce === undefined) {
      txRequest.nonce = await this._getNonce(txRequest.from);
    }

    const chainId = await this._getChainId();

    const account = this._resolveManagedAccount(txRequest.from);

    const baseTx: ethers.TransactionLike = {
      chainId,
      gasLimit: txRequest.gas,
      gasPrice: txRequest.gasPrice,
      maxFeePerGas: txRequest.maxFeePerGas,
      maxPriorityFeePerGas: txRequest.maxPriorityFeePerGas,
      nonce: Number(txRequest.nonce),
      value: txRequest.value,
    };
    if (txRequest.to !== undefined) {
      baseTx.to = bytesToHex(txRequest.to, true);
    }
    if (txRequest.data !== undefined) {
      baseTx.data = bytesToHex(txRequest.data, true);
    }

    let resp: { v: number; r: Uint8Array; s: Uint8Array };

    if (hasEip1559Fields) {
      resp = await this.client.callEthereumSignTxEIP1559(
        this.session,
        account.derivationPath,
        {
          nonce: numberToBytes(baseTx.nonce!),
          gasLimit: numberToBytes(baseTx.gasLimit!),
          maxGasFee: numberToBytes(baseTx.maxFeePerGas!),
          maxPriorityFee: numberToBytes(baseTx.maxPriorityFeePerGas!),
          value: baseTx.value ? numberToBytes(baseTx.value) : undefined,
          chainId: chainId,
          to: baseTx.to ?? undefined,
          data: txRequest.data ? bufferToBytes(txRequest.data) : undefined,
          accessList: txRequest.accessList?.map((al) => ({
            address: bytesToHex(al.address, true).toLowerCase(),
            storageKeys: al.storageKeys?.map((sk) => bufferToBytes(sk)),
          })),
        },
      );
    } else {
      resp = await this.client.callEthereumSignTx(
        this.session,
        account.derivationPath,
        {
          nonce: numberToBytes(baseTx.nonce!),
          gasLimit: numberToBytes(baseTx.gasLimit!),
          gasPrice: numberToBytes(baseTx.gasPrice!),
          value: baseTx.value ? numberToBytes(baseTx.value) : undefined,
          chainId: chainId,
          to: baseTx.to ?? undefined,
          data: txRequest.data ? bufferToBytes(txRequest.data) : undefined,
        },
      );
    }

    const rawTransaction = ethers.Transaction.from({
      ...baseTx,
      signature: {
        v: numberToHex(resp.v, 4, true),
        r: bytesToHex(resp.r, true),
        s: bytesToHex(resp.s, true),
      },
    }).serialized;

    return this._wrappedProvider.request({
      method: "eth_sendRawTransaction",
      params: [rawTransaction],
    });
  }

  public async request(args: RequestArguments): Promise<unknown> {
    if (args.method === "eth_accounts") {
      const accounts = (await this.wrappedProvider.request(args)) as string[];
      return [...this.accounts.map((a) => a.address), ...accounts];
    }

    const params = this._getParams(args);

    try {
      if (args.method === "eth_sign") {
        return this._ethSign(params);
      } else if (args.method === "personal_sign") {
        return this._personalSign(params);
      } else if (args.method === "eth_signTypedData_v4") {
        return this._ethSignTypedDataV4(params);
      } else if (args.method === "eth_sendTransaction") {
        return this._ethSendTransaction(params);
      }
    } catch (error) {
      if (!HardhatTrezorAccountNotManagedError.isInstance(error)) {
        throw error;
      }
    }

    return this.wrappedProvider.request(args);
  }
}

export async function createTrezorProvider(
  provider: EIP1193Provider,
  { trezorDerivationPaths }: NetworkConfig,
) {
  const trezorWire = await createTrezorWire();
  const trezorClient = new TrezorClient({ wire: trezorWire });
  const trezorProvider = new TrezorProvider(
    {
      derivationPaths: trezorDerivationPaths,
      client: trezorClient,
      wire: trezorWire,
    },
    provider,
  );
  await trezorProvider.initialize();
  return trezorProvider;
}
