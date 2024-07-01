import "@nomicfoundation/hardhat-ethers";
import "../dist/index";
import { HardhatUserConfig } from "hardhat/config";
import { task } from "hardhat/config";

task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = (await hre.network.provider.request({
    method: "eth_accounts",
  })) as string[];
  for (const account of accounts) {
    console.log(account);
  }
});

module.exports = {
  solidity: "0.8.24",
  networks: {
    sepolia: {
      url: "https://sepolia.infura.io/v3/" + process.env.INFURA_API_KEY,
      trezorAccountIndexes: [[44, 60, 0, 0, 0]],
    },
  },
} as HardhatUserConfig;
