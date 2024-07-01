import path from "node:path";
import * as protobuf from "protobufjs";
import { HardhatTrezorError } from "./errors";

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

export interface TrezorMessageType {
  code: number;
  name: string;
  type: protobuf.Type;
}

export async function createTrezorWire() {
  const roots = [
    {
      prefix: "hw.trezor.messages.ethereum.",
      root: await loadProtobufFile("messages-ethereum"),
    },
    {
      prefix: "hw.trezor.messages.management.",
      root: await loadProtobufFile("messages-management"),
    },
    {
      prefix: "hw.trezor.messages.common.",
      root: await loadProtobufFile("messages-common"),
    },
    {
      prefix: "hw.trezor.messages.",
      root: await loadProtobufFile("messages"),
    },
  ];

  const lookupEnum = (name: string) => {
    for (const root of roots) {
      if (name.startsWith(root.prefix)) {
        const result = root.root.lookupEnum(name);
        if (result) {
          return result;
        }
      }
    }
    throw new HardhatTrezorError(`Enum not found: ${name}`);
  };

  const messageTypes = lookupEnum("hw.trezor.messages.MessageType")!;

  const lookupType = (name: string) => {
    for (const root of roots) {
      if (name.startsWith(root.prefix)) {
        const result = root.root.lookupType(name);
        if (result) {
          return result;
        }
      }
    }
    throw new HardhatTrezorError(`Type not found: ${name}`);
  };

  const lookupMessageType = (name: string): TrezorMessageType => {
    const basename = name.split(".").pop()!;
    const type = lookupType(name);
    const code = messageTypes.values["MessageType_" + basename];
    if (code === undefined) {
      throw new HardhatTrezorError(`Message type not found: ${name}`);
    }
    return { code: code, type: type, name: basename };
  };

  return {
    // common
    Success: lookupMessageType("hw.trezor.messages.common.Success"),
    ButtonRequest: lookupMessageType("hw.trezor.messages.common.ButtonRequest"),
    ButtonAck: lookupMessageType("hw.trezor.messages.common.ButtonAck"),
    PinMatrixRequest: lookupMessageType(
      "hw.trezor.messages.common.PinMatrixRequest",
    ),
    PinMatrixAck: lookupMessageType("hw.trezor.messages.common.PinMatrixAck"),
    PassphraseRequest: lookupMessageType(
      "hw.trezor.messages.common.PassphraseRequest",
    ),
    PassphraseAck: lookupMessageType("hw.trezor.messages.common.PassphraseAck"),
    Failure: lookupMessageType("hw.trezor.messages.common.Failure"),
    // ethereum
    EthereumGetAddress: lookupMessageType(
      "hw.trezor.messages.ethereum.EthereumGetAddress",
    ),
    EthereumAddress: lookupMessageType(
      "hw.trezor.messages.ethereum.EthereumAddress",
    ),
    // management
    Initialize: lookupMessageType("hw.trezor.messages.management.Initialize"),
    EndSession: lookupMessageType("hw.trezor.messages.management.EndSession"),
    GetFeatures: lookupMessageType("hw.trezor.messages.management.GetFeatures"),
    Features: lookupMessageType("hw.trezor.messages.management.Features"),
  };
}

export type TrezorWire = Awaited<ReturnType<typeof createTrezorWire>>;

export function hardenDerivationPath(values: number[]): number[] {
  return values.map((value, i) => {
    if (i < 3) return value | (1 << 31);
    return value;
  });
}
