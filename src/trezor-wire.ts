import path from "node:path";
import * as protobuf from "protobufjs";

export const defaultDerivationPath = [44, 60, 0, 0, 0];

async function loadProtobufFile(name: string): Promise<protobuf.Root> {
  return new Promise((resolve, reject) => {
    protobuf.load(
      path.join(__dirname, "..", "proto", `${name}.proto`),
      (err, root) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(root!);
      },
    );
  });
}

export async function createTrezorWire() {
  const rootMessages = await loadProtobufFile("messages");
  const rootMessagesEthereum = await loadProtobufFile("messages-ethereum");
  const rootMessagesCommon = await loadProtobufFile("messages-common");
  const enumMessageType = rootMessages.lookupEnum(
    "hw.trezor.messages.MessageType",
  )!;

  const {
    MessageType_Failure,
    MessageType_EthereumGetAddress,
    MessageType_EthereumAddress,
  } = enumMessageType.values;

  const Failure = rootMessagesCommon.lookupType(
    "hw.trezor.messages.common.Failure",
  )!;
  const EthereumGetAddress = rootMessagesEthereum.lookupType(
    "hw.trezor.messages.ethereum.EthereumGetAddress",
  )!;
  const EthereumAddress = rootMessagesEthereum.lookupType(
    "hw.trezor.messages.ethereum.EthereumAddress",
  )!;

  return {
    MessageType_Failure,
    MessageType_EthereumGetAddress,
    MessageType_EthereumAddress,
    Failure,
    EthereumGetAddress,
    EthereumAddress,
  };
}

export type TrezorWire = Awaited<ReturnType<typeof createTrezorWire>>;

export function hardenDerivationPath(values: number[]): number[] {
  return values.map((value, i) => {
    if (i < 3) return value | (1 << 31);
    return value;
  });
}
