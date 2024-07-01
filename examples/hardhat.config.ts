import "@nomicfoundation/hardhat-ethers";
import "../dist/index";
import { HardhatUserConfig } from "hardhat/config";
import { task } from "hardhat/config";

function createExampleTypedMessage(from: string, to: string) {
  return {
    types: {
      EIP712Domain: [
        {
          name: "name",
          type: "string",
        },
        {
          name: "version",
          type: "string",
        },
        {
          name: "chainId",
          type: "uint256",
        },
        {
          name: "verifyingContract",
          type: "address",
        },
        {
          name: "salt",
          type: "bytes32",
        },
      ],
      ExampleMessage: [
        { name: "message", type: "string" },
        { name: "value", type: "uint256" },
        { name: "from", type: "address" },
        { name: "to", type: "address" },
      ],
    },
    domain: {
      name: "EIP712Example",
      version: "1",
      chainId: 5,
      verifyingContract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      salt: "0x70736575646f2d72616e646f6d2076616c756500000000000000000000000000",
    },
    primaryType: "ExampleMessage",
    message: {
      message: "Test message",
      value: 10000,
      from,
      to,
    },
  };
}

task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const addresses = (await hre.network.provider.request({
    method: "eth_accounts",
  })) as string[];
  for (const address of addresses) {
    console.log(address);
  }
});

task("eth_sign", "Sign a data", async (taskArgs, hre) => {
  const addresses = (await hre.network.provider.request({
    method: "eth_accounts",
  })) as string[];
  const address = addresses[0];
  const result = await hre.network.provider.request({
    method: "eth_sign",
    params: [address, "0x" + Buffer.from("Hello, world!").toString("hex")],
  });
  console.log(result);
});

task("personal_sign", "Sign a personal data", async (taskArgs, hre) => {
  const addresses = (await hre.network.provider.request({
    method: "eth_accounts",
  })) as string[];
  const address = addresses[0];
  const result = await hre.network.provider.request({
    method: "personal_sign",
    params: ["0x" + Buffer.from("Hello, world!").toString("hex"), address],
  });
  console.log(result);
});

task(
  "eth_sign_typed_data_v4",
  "Sign a personal data",
  async (taskArgs, hre) => {
    const addresses = (await hre.network.provider.request({
      method: "eth_accounts",
    })) as string[];
    const address = addresses[0];
    const result = await hre.network.provider.request({
      method: "eth_signTypedData_v4",
      params: [address, createExampleTypedMessage(addresses[0], addresses[1])],
    });
    console.log(result);
  },
);

module.exports = {
  solidity: "0.8.24",
  networks: {
    sepolia: {
      url: "https://sepolia.infura.io/v3/" + process.env.INFURA_API_KEY,
      trezorDerivationPaths: [
        [44, 60, 0, 0, 0],
        [44, 60, 0, 0, 1],
      ],
    },
  },
} as HardhatUserConfig;
