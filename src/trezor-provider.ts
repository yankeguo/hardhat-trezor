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
  derivationPaths?: number[][];
  client: TrezorClient;
  wire: TrezorWire;
};

export class TrezorProvider extends ProviderWrapperWithChainId {
  wrappedProvider: EIP1193Provider;

  derivationPaths: number[][];
  client: TrezorClient;
  wire: TrezorWire;

  session?: string;
  accounts?: string[];

  constructor(opts: TrezorProviderOptions, wrappedProvider: EIP1193Provider) {
    super(wrappedProvider);
    this.wrappedProvider = wrappedProvider;

    let derivationPaths = opts.derivationPaths;
    if (!derivationPaths || derivationPaths.length === 0) {
      derivationPaths = [defaultDerivationPath];
    }
    this.derivationPaths = derivationPaths.map((p) => hardenDerivationPath(p));
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

    process.on("exit", async () => {
      if (this.session) {
        await this.client.callEndSession(this.session);
        await this.client.release(this.session);
      }
    });

    await this.client.callInitialize(this.session);
  }

  async _initializeAccounts() {
    const accounts = [];
    for (const derivationPath of this.derivationPaths) {
      const addresses = await this.client.callEthereumGetAddress(
        this.session!,
        derivationPath,
      );
      accounts.push(...addresses);
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
