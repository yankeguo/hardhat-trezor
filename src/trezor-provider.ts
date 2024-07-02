import * as t from "io-ts";
import { validateParams } from "hardhat/internal/core/jsonrpc/types/input/validation";
import {
  rpcAddress,
  rpcData,
} from "hardhat/internal/core/jsonrpc/types/base-types";
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

  private _resolveManagedAccount(addrBuf: Buffer): TrezorAccount {
    const address = "0x" + addrBuf.toString("hex").toLowerCase();
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

  private async _ethSendTransaction(params: any[]) {}

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
