# hardhat-trezor

Hardhat plugin for integration with a Trezor hardware wallet

> [!CAUTION]
>
> This package is in alpha stage and should be used with caution. Use it at your own risk.

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
      url: "https://sepolia.infura.io/v3/" + process.env.INFURA_API_KEY,
      trezorDerivationPaths: [
        [44, 60, 0, 0, 0], // account #0 for ethereum
        [44, 60, 0, 0, 1], // account #1 for ethereum
      ],
    },
  },
};
```

## Credits

GUO YANKE, MIT License
