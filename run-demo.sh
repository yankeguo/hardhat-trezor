#!/bin/bash

set -eu

cd "$(dirname "$0")/demo"

#run hardhat compile if command is eth_deploy
if [ "$1" == "eth_deploy" ]; then
    npx hardhat compile
fi

npx hardhat "$1" --show-stack-traces --network sepolia --verbose
