import { string } from 'hardhat/internal/core/params/argumentTypes';
import { ProviderWrapperWithChainId } from 'hardhat/internal/core/providers/chainId';
import { EIP1193Provider, NetworkConfig, RequestArguments } from 'hardhat/types';

export interface TrezorProviderOptions {
    accounts: string[]
    derivationFunction?: (accountNumber: number) => string
}

export class TrezorProvider extends ProviderWrapperWithChainId {

    constructor(options: TrezorProviderOptions, _wrappedProvider: EIP1193Provider) {
        super(_wrappedProvider)
    }

    request(args: RequestArguments): Promise<unknown> {
        throw new Error('Method not implemented.');
    }

}

export function createTrezorProvider(provider: EIP1193Provider, networkConfig: NetworkConfig) {
    const accounts = networkConfig.trezorAccounts;
    const derivationFunction = networkConfig.trezorOptions?.derivationFunction;

    return new TrezorProvider({ accounts, derivationFunction }, provider)
}