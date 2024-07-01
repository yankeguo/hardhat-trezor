import { extendConfig, extendProvider } from "hardhat/config";

import "hardhat/types/config";

// We need to declare an extension to the HardhatConfig type to add our plugin's config.
declare module "hardhat/types/config" {
  interface HardhatNetworkUserConfig {
    trezorDerivationPaths?: number[][];
  }

  interface HardhatNetworkConfig {
    trezorDerivationPaths?: number[][];
  }

  interface HttpNetworkUserConfig {
    trezorDerivationPaths?: number[][];
  }
  interface HttpNetworkConfig {
    trezorDerivationPaths?: number[][];
  }
}

extendConfig((config, userConfig) => {
  for (const networkName of Object.keys(config.networks)) {
    config.networks[networkName].trezorDerivationPaths =
      userConfig.networks?.[networkName]?.trezorDerivationPaths;
  }
});

extendProvider(async (provider, config, network) => {
  const { createTrezorProvider } = await import("./trezor-provider");
  return createTrezorProvider(provider, config.networks[network]);
});
