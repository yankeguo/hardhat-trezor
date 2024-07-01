import "@nomicfoundation/hardhat-ethers";
import "../dist/index";
import { HardhatUserConfig } from "hardhat/config";
import { task } from "hardhat/config";

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
