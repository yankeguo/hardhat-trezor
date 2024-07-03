import { extendConfig, extendProvider } from "hardhat/config";

import "hardhat/types/config";

// We need to declare an extension to the HardhatConfig type to add our plugin's config.
declare module "hardhat/types/config" {
  interface HardhatNetworkUserConfig {
    trezorDerivationPaths?: number[][];
    trezorInsecureDerivation: boolean;
  }

  interface HardhatNetworkConfig {
    trezorDerivationPaths?: number[][];
    trezorInsecureDerivation: boolean;
  }

  interface HttpNetworkUserConfig {
    trezorDerivationPaths?: number[][];
    trezorInsecureDerivation?: boolean;
  }
  interface HttpNetworkConfig {
    trezorDerivationPaths?: number[][];
    trezorInsecureDerivation?: boolean;
  }
}

extendConfig((config, userConfig) => {
  for (const networkName of Object.keys(config.networks)) {
    config.networks[networkName].trezorDerivationPaths =
      userConfig.networks?.[networkName]?.trezorDerivationPaths;
    config.networks[networkName].trezorInsecureDerivation =
      userConfig.networks?.[networkName]?.trezorInsecureDerivation;
  }
});

extendProvider(async (provider, config, network) => {
  const { createTrezorProvider } = await import("./trezor-provider");
  return createTrezorProvider(provider, config.networks[network]);
});
