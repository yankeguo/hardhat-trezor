import { NomicLabsHardhatPluginError } from "hardhat/plugins";

export class HardhatTrezorError extends NomicLabsHardhatPluginError {
  constructor(message: string, parent?: Error) {
    super("@yankeguo/hardhat-trezor", message, parent);
  }
}
export class HardhatTrezorAccountNotManagedError extends HardhatTrezorError {
  static isInstance(err: any): err is HardhatTrezorAccountNotManagedError {
    return err && err._isHardhatTrezorAccountNotManagedError === true;
  }

  readonly _isHardhatTrezorAccountNotManagedError = true;

  constructor(account: string) {
    super(
      "The account you are trying to use is not managed by the Trezor plugin: " +
        account,
    );
  }
}
