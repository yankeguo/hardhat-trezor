import { isValidAddress } from "@nomicfoundation/ethereumjs-util";
import { ProviderWrapperWithChainId } from "hardhat/internal/core/providers/chainId";
import {
  EIP1193Provider,
  NetworkConfig,
  RequestArguments,
} from "hardhat/types";
import { HardhatTrezorError } from "./errors";
import {
  createTrezorWire,
  TrezorWire,
  defaultDerivationPath,
  hardenDerivationPath,
} from "./trezor-wire";
import { TrezorClient } from "./trezor-client";

type TrezorProviderOptions = {
  derivationPath?: number[];
  client: TrezorClient;
  wire: TrezorWire;
};

export class TrezorProvider extends ProviderWrapperWithChainId {
  wrappedProvider: EIP1193Provider;

  derivationPath: number[];
  client: TrezorClient;
  wire: TrezorWire;

  session?: string;
  accounts?: string[];

  constructor(opts: TrezorProviderOptions, wrappedProvider: EIP1193Provider) {
    super(wrappedProvider);
    this.wrappedProvider = wrappedProvider;

    let derivationPath = opts.derivationPath;
    if (!derivationPath || derivationPath.length === 0) {
      derivationPath = defaultDerivationPath;
    }
    this.derivationPath = hardenDerivationPath(derivationPath);
    this.client = opts.client;
    this.wire = opts.wire;
  }

  async _initializeSession() {
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
  }

  async _initializeAccounts() {
    const accounts = [];
    const { type, data } = await this.client.call(
      this.session!,
      this.wire.MessageType_EthereumGetAddress,
      this.wire.EthereumGetAddress.encode({
        addressN: this.derivationPath,
      }).finish(),
    );
    if (type !== this.wire.MessageType_EthereumAddress) {
      throw new HardhatTrezorError(`Unexpected response message type:${type}`);
    }
    const { address: addressBatch } = this.wire.EthereumAddress.decode(
      data,
    ).toJSON() as { address: string };
    if (!addressBatch) {
      throw new HardhatTrezorError("No address received from Trezor");
    }
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
    this.accounts = accounts;
  }

  async initialize() {
    await this._initializeSession();
    await this._initializeAccounts();
  }

  public async request(args: RequestArguments): Promise<unknown> {
    if (args.method === "eth_accounts") {
      const accounts = (await this.wrappedProvider.request(args)) as string[];
      return [...this.accounts!, ...accounts];
    }
    return this.wrappedProvider.request(args);
  }
}

export async function createTrezorProvider(
  provider: EIP1193Provider,
  { trezorDerivationPath }: NetworkConfig,
) {
  const trezorWire = await createTrezorWire();
  const trezorClient = new TrezorClient({ wire: trezorWire });
  const trezorProvider = new TrezorProvider(
    {
      derivationPath: trezorDerivationPath,
      client: trezorClient,
      wire: trezorWire,
    },
    provider,
  );
  await trezorProvider.initialize();
  return trezorProvider;
}
