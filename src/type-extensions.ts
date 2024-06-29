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
