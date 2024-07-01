import path from "node:path";
import * as protobuf from "protobufjs";
import { HardhatTrezorError } from "./errors";
import { EIP712MessageTypesEntry } from "./types";

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
      prefix: "hw.trezor.messages.ethereum_eip712.",
      root: await loadProtobufFile("messages-ethereum-eip712"),
    },
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
    EthereumSignMessage: lookupMessageType(
      "hw.trezor.messages.ethereum.EthereumSignMessage",
    ),
    EthereumMessageSignature: lookupMessageType(
      "hw.trezor.messages.ethereum.EthereumMessageSignature",
    ),
    EthereumSignTypedHash: lookupMessageType(
      "hw.trezor.messages.ethereum.EthereumSignTypedHash",
    ),
    EthereumTypedDataSignature: lookupMessageType(
      "hw.trezor.messages.ethereum.EthereumTypedDataSignature",
    ),
    // ethereum_eip712
    EthereumSignTypedData: lookupMessageType(
      "hw.trezor.messages.ethereum_eip712.EthereumSignTypedData",
    ),
    EthereumTypedDataStructRequest: lookupMessageType(
      "hw.trezor.messages.ethereum_eip712.EthereumTypedDataStructRequest",
    ),
    EthereumTypedDataStructAck: lookupMessageType(
      "hw.trezor.messages.ethereum_eip712.EthereumTypedDataStructAck",
    ),
    EthereumTypedDataValueRequest: lookupMessageType(
      "hw.trezor.messages.ethereum_eip712.EthereumTypedDataValueRequest",
    ),
    EthereumTypedDataValueAck: lookupMessageType(
      "hw.trezor.messages.ethereum_eip712.EthereumTypedDataValueAck",
    ),
    // management
    Initialize: lookupMessageType("hw.trezor.messages.management.Initialize"),
    EndSession: lookupMessageType("hw.trezor.messages.management.EndSession"),
    GetFeatures: lookupMessageType("hw.trezor.messages.management.GetFeatures"),
    Features: lookupMessageType("hw.trezor.messages.management.Features"),
    Cancel: lookupMessageType("hw.trezor.messages.management.Cancel"),
  };
}

export type TrezorWire = Awaited<ReturnType<typeof createTrezorWire>>;

export enum TrezorEIP712DataType {
  UINT = 1,
  INT = 2,
  BYTES = 3,
  STRING = 4,
  BOOL = 5,
  ADDRESS = 6,
  ARRAY = 7,
  STRUCT = 8,
}

export interface TrezorEIP712Type {
  dataType: TrezorEIP712DataType;
  size?: number;
  entryType?: TrezorEIP712Type;
  structName?: string;
}

export function wireConvertTrezorEIP712Type(
  type: string,
  lookupStructLen: (name: string) => number,
): TrezorEIP712Type {
  // check array
  if (type.endsWith("]")) {
    const out: TrezorEIP712Type = {
      dataType: TrezorEIP712DataType.ARRAY,
    };
    const idxL = type.indexOf("[");
    if (idxL === -1) {
      throw new HardhatTrezorError(`Invalid array type: ${type}`);
    }
    out.entryType = wireConvertTrezorEIP712Type(
      type.slice(0, idxL),
      lookupStructLen,
    );
    if (idxL + 1 !== type.length - 1) {
      out.size = parseInt(type.slice(idxL + 1, type.length - 1));
    }
    return out;
  }
  // check uint
  if (type.startsWith("uint")) {
    const out: TrezorEIP712Type = {
      dataType: TrezorEIP712DataType.UINT,
    };
    if (type.length > 4) {
      out.size = parseInt(type.slice(4)) / 8;
    }
    return out;
  }
  // check int
  if (type.startsWith("int")) {
    const out: TrezorEIP712Type = {
      dataType: TrezorEIP712DataType.INT,
    };
    if (type.length > 3) {
      out.size = parseInt(type.slice(3)) / 8;
    }
    return out;
  }
  // check bytes
  if (type.startsWith("bytes")) {
    const out: TrezorEIP712Type = {
      dataType: TrezorEIP712DataType.BYTES,
    };
    if (type.length > 5) {
      out.size = parseInt(type.slice(5));
    }
    return out;
  }
  // check string, bool, address
  if (type === "string") {
    return {
      dataType: TrezorEIP712DataType.STRING,
    };
  }
  if (type === "bool") {
    return {
      dataType: TrezorEIP712DataType.BOOL,
    };
  }
  if (type === "address") {
    return {
      dataType: TrezorEIP712DataType.ADDRESS,
    };
  }
  // check struct
  return {
    dataType: TrezorEIP712DataType.STRUCT,
    structName: type,
  };
}

export function wireConvertTrezorEIP712Entries(
  members: EIP712MessageTypesEntry[],
  lookupStructLen: (name: string) => number,
) {
  return {
    members: members.map((m) => {
      return {
        name: m.name,
        type: wireConvertTrezorEIP712Type(m.type, lookupStructLen),
      };
    }),
  };
}

export function hardenDerivationPath(values: number[]): number[] {
  return values.map((value, i) => {
    if (i < 3) return value | (1 << 31);
    return value;
  });
}
