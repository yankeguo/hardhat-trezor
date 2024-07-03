import "@nomicfoundation/hardhat-ethers";
import "../src/index";
import { HardhatUserConfig } from "hardhat/config";
import { task } from "hardhat/config";
import { ethers } from "ethers";

function createTypedMessageExample(from: string, to: string) {
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

task("eth_accounts", "list of accounts", async (taskArgs, hre) => {
  const signers = await hre.ethers.getSigners();
  for (const signer of signers) {
    console.log(signer.address);
  }
});

task("eth_sign", "sign a arbitrary message", async (taskArgs, hre) => {
  const [signer] = await hre.ethers.getSigners();
  const signature = await signer.signMessage("Hello world!");
  console.log(signature);
});

task("eth_sign_typed_data", "sign a typed data", async (taskArgs, hre) => {
  const [signer1, signer2] = await hre.ethers.getSigners();
  const message = createTypedMessageExample(signer1.address, signer2.address);
  const signature = await signer1.signTypedData(
    message.domain,
    message.types,
    message.message,
  );
  console.log(signature);
});

task("eth_send", "send some eth", async (taskArgs, hre) => {
  const [signer1, signer2] = await hre.ethers.getSigners();
  console.log("from:", signer1.address);
  console.log("to:", signer2.address);
  const balance = await hre.ethers.provider.getBalance(signer1.address);
  console.log("balance:", ethers.formatEther(balance), "ETH");
  console.log("will send 0.005");
  const result = await signer1.sendTransaction({
    to: signer2.address,
    value: ethers.parseEther("0.005"),
  });
  console.debug(result);
});

task("eth_deploy", "deploy a contract", async (taskArgs, hre) => {
  const [signer] = await hre.ethers.getSigners();
  console.log("deploying contracts with the account:", signer.address);
  const balance = await hre.ethers.provider.getBalance(signer.address);
  console.log("balance:", ethers.formatEther(balance), "ETH");
  const HelloWorld = await hre.ethers.getContractFactory("HelloWorld");
  const contract = await HelloWorld.deploy();
  console.log("contract address:", contract.address);
});

module.exports = {
  solidity: "0.8.24",
  networks: {
    sepolia: {
      url: "https://sepolia.infura.io/v3/" + process.env.INFURA_API_KEY,
      trezorDerivationPaths: [
        [44, 60, 0, 0, 0],
        [44, 60, 0, 0, 1],
      ],
      trezorInsecureDerivation: true,
    },
  },
} as HardhatUserConfig;
