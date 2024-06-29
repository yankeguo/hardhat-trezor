import { NomicLabsHardhatPluginError } from "hardhat/plugins";

export class HardhatTrezorError extends NomicLabsHardhatPluginError {
  constructor(message: string, parent?: Error) {
    super("@yankeguo/hardhat-trezor", message, parent);
  }
}
