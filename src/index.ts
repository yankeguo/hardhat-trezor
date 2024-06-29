import { extendConfig, extendProvider } from "hardhat/config";

import "hardhat/types/config";

declare module "hardhat/types/config" {
  interface HardhatNetworkUserConfig {
    trezorAccounts?: string[];
    trezorOptions?: {
      derivationFunction?: (accountNumber: number) => string;
    };
  }
  interface HardhatNetworkConfig {
    trezorAccounts: string[];
    trezorOptions?: {
      derivationFunction?: (accountNumber: number) => string;
    };
  }

  interface HttpNetworkUserConfig {
    trezorAccounts?: string[];
    trezorOptions?: {
      derivationFunction?: (accountNumber: number) => string;
    };
  }
  interface HttpNetworkConfig {
    trezorAccounts: string[];
    trezorOptions?: {
      derivationFunction?: (accountNumber: number) => string;
    };
  }
}

extendConfig((config, userConfig) => {
  for (const networkName of Object.keys(config.networks)) {
    config.networks[networkName].trezorAccounts =
      userConfig.networks?.[networkName]?.trezorAccounts ?? [];
  }
});

extendProvider(async (provider, config, network) => {
  const { createTrezorProvider } = await import("./trezor");

  return createTrezorProvider(provider, config.networks[network]);
});
