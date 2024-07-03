# hardhat-trezor

![NPM Version](https://img.shields.io/npm/v/%40yankeguo%2Fhardhat-trezor)
![NPM Downloads](https://img.shields.io/npm/dw/%40yankeguo%2Fhardhat-trezor)

Hardhat plugin for integration with a Trezor hardware wallet

> [!CAUTION]
>
> This package comes with no warranty, use at your own risk

## Requirements

- A [Trezor](https://trezor.io/) hardware wallet
- [Trezor Bridge](https://trezor.io/learn/a/what-is-trezor-bridge) installed and running

## Usage

1. install the plugin

```bash
npm install --save @yankeguo/hardhat-trezor
```

2. import the plugin in your `hardhat.config.js`

```js
import "@yankeguo/hardhat-trezor";
```

3. add the plugin configuration in your `hardhat.config.js`

```js
module.exports = {
  solidity: "0.8.24",
  networks: {
    sepolia: {
      url: "https://sepolia.base.org",
      // standard ethereum derivation paths
      trezorDerivationPaths: [
        [44, 60, 0, 0, 0],
        [44, 60, 0, 0, 1],
      ],
      // this will bypass trezor derivation path validation, makes mainnet addresses usable on testnet
      // see https://github.com/trezor/trezor-firmware/blob/main/docs/common/ethereum-definitions.md
      trezorInsecureDerivation: true,
    },
  },
};
```

## Example

See [demo/hardhat.config.ts](./demo/hardhat.config.ts) for a complete example.

## Donation

Send me some ETH or tokens to [`yankeguo.eth`](https://app.ens.domains/yankeguo.eth).

## Credits

GUO YANKE, MIT License
