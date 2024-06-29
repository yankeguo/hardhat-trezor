import { extendConfig, extendProvider } from "hardhat/config";

import "hardhat/types/config";

// We need to declare an extension to the HardhatConfig type to add our plugin's config.
declare module "hardhat/types/config" {
  interface HardhatNetworkUserConfig {
    trezorDerivationPath?: number[];
  }

  interface HardhatNetworkConfig {
    trezorDerivationPath?: number[];
  }

  interface HttpNetworkUserConfig {
    trezorDerivationPath?: number[];
  }
  interface HttpNetworkConfig {
    trezorDerivationPath?: number[];
  }
}

extendConfig((config, userConfig) => {
  for (const networkName of Object.keys(config.networks)) {
    config.networks[networkName].trezorDerivationPath =
      userConfig.networks?.[networkName]?.trezorDerivationPath;
  }
});

extendProvider(async (provider, config, network) => {
  const { createTrezorProvider } = await import("./trezor-provider");
  return createTrezorProvider(provider, config.networks[network]);
});
