import { extendConfig, extendProvider } from 'hardhat/config'

import './type-extensions'

extendConfig((config, userConfig) => {
    for (const networkName of Object.keys(config.networks)) {
        config.networks[networkName].trezorAccounts =
            userConfig.networks?.[networkName]?.trezorAccounts ?? []
    }
})

extendProvider(async (provider, config, network) => {
    const { createTrezorProvider } = await import('./trezor')

    return createTrezorProvider(provider, config.networks[network])
})