// SPDX-License-Identifier: MIT
// helloworld.sol

pragma solidity ^0.8.9;
contract HelloWorld {

    string public message;

    constructor() {
        message = "Hello Blockchain World!";
    }
}