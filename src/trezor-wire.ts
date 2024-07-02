import path from "node:path";
import * as protobuf from "protobufjs";
import { HardhatTrezorError } from "./errors";
import {
  EIP712Message,
  EIP712MessageTypesEntry,
  uint8ArrayFromHex,
  uint8ArrayFromString,
} from "./types";

export const trezorWireDefaultDerivationPath = [44, 60, 0, 0, 0];

export function trezorWireHardenDerivationPath(values: number[]): number[] {
  return values.map((value, i) => {
    if (i < 3) return value | (1 << 31);
    return value;
  });
}

async function _loadProtobufFile(name: string): Promise<protobuf.Root> {
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

export interface TrezorWireMessageType {
  code: number;
  name: string;
  type: protobuf.Type;
}

export async function createTrezorWire() {
  const roots = [
    {
      prefix: "hw.trezor.messages.ethereum_eip712.",
      root: await _loadProtobufFile("messages-ethereum-eip712"),
    },
    {
      prefix: "hw.trezor.messages.ethereum.",
      root: await _loadProtobufFile("messages-ethereum"),
    },
    {
      prefix: "hw.trezor.messages.management.",
      root: await _loadProtobufFile("messages-management"),
    },
    {
      prefix: "hw.trezor.messages.common.",
      root: await _loadProtobufFile("messages-common"),
    },
    {
      prefix: "hw.trezor.messages.",
      root: await _loadProtobufFile("messages"),
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

  const lookupMessageType = (name: string): TrezorWireMessageType => {
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

enum TrezorWireEIP712ValueType {
  UINT = 1,
  INT = 2,
  BYTES = 3,
  STRING = 4,
  BOOL = 5,
  ADDRESS = 6,
  ARRAY = 7,
  STRUCT = 8,
}

interface TrezorWireEIP712Type {
  dataType: TrezorWireEIP712ValueType;
  size?: number;
  entryType?: TrezorWireEIP712Type;
  structName?: string;
}

interface TrezorWireEIP712PathEntry {
  type: string;
  value: any;
  children?: TrezorWireEIP712PathEntry[];
}

export class TrezorWireEIP712 {
  types: Record<string, EIP712MessageTypesEntry[]>;
  pathEntries: TrezorWireEIP712PathEntry[];

  constructor(message: EIP712Message) {
    this.types = message.types;
    this.pathEntries = this._convertTypedValues([
      {
        type: "EIP712Domain",
        value: message.domain,
      },
      {
        type: message.primaryType,
        value: message.message,
      },
    ]);
  }

  private _encodeNumber(value: number | string, size: number): Uint8Array {
    if (typeof value === "string") {
      return uint8ArrayFromHex(value);
    }

    if (size <= 0) {
      return new Uint8Array(0);
    }

    const data = new Uint8Array(size);

    for (let i = 0; i < size; i++) {
      // big endian
      const byte = value & 0xff;
      data[size - i - 1] = byte;
      value = value >> 8;
    }

    return data;
  }

  private _encodeTypedValue(type: string, value: any): Uint8Array {
    if (type.endsWith("]")) {
      // array length is encoded as uint16
      return this._encodeNumber(value.length, 2);
    }
    if (type.startsWith("uint")) {
      const size = parseInt(type.slice(4)) / 8;
      return this._encodeNumber(value, size);
    }
    if (type.startsWith("int")) {
      const size = parseInt(type.slice(4)) / 8;
      return this._encodeNumber(value, size);
    }
    if (type.startsWith("bytes")) {
      return uint8ArrayFromHex(value);
    }
    if (type.startsWith("string")) {
      return uint8ArrayFromString(value);
    }
    if (type.startsWith("bool")) {
      return this._encodeNumber(value ? 1 : 0, 1);
    }
    if (type.startsWith("address")) {
      return uint8ArrayFromHex(value);
    }
    throw new HardhatTrezorError(
      `Unsupported type while encoding value: ${type}`,
    );
  }

  private _convertTypedValues(
    values: { type: string; value: any }[],
  ): TrezorWireEIP712PathEntry[] {
    const results: TrezorWireEIP712PathEntry[] = [];

    for (const value of values) {
      const result: TrezorWireEIP712PathEntry = {
        type: value.type,
        value: value.value,
      };

      if (value.type.endsWith("]")) {
        // array
        const entryType = value.type.slice(0, value.type.indexOf("["));
        result.children = this._convertTypedValues(
          (value.value as any[]).map((v) => {
            return { type: entryType, value: v };
          }),
        );
      } else if (
        // primitive types
        value.type.startsWith("uint") ||
        value.type.startsWith("int") ||
        value.type.startsWith("bytes") ||
        value.type.startsWith("string") ||
        value.type.startsWith("bool") ||
        value.type.startsWith("address")
      ) {
        // nothing to do
      } else {
        // custom struct
        const types = this.types[value.type];
        result.children = this._convertTypedValues(
          types.map((t) => {
            return { type: t.type, value: value.value[t.name] };
          }),
        );
      }

      results.push(result);
    }

    return results;
  }

  private _extractTypedValue(
    entry: TrezorWireEIP712PathEntry,
    memberPath: number[],
  ): Uint8Array {
    if (memberPath.length == 0) {
      return this._encodeTypedValue(entry.type, entry.value);
    }
    if (!entry.children || entry.children.length <= memberPath[0]) {
      throw new HardhatTrezorError(`Invalid member path: ${memberPath}`);
    }
    return this._extractTypedValue(
      entry.children![memberPath[0]],
      memberPath.slice(1),
    );
  }

  public createEthereumTypedDataValueAck(memberPath: number[]): any {
    return {
      value: this._extractTypedValue(
        {
          type: "virtual",
          value: "virtual",
          children: this.pathEntries,
        },
        memberPath,
      ),
    };
  }

  private _convertType(type: string): TrezorWireEIP712Type {
    // check array
    if (type.endsWith("]")) {
      const out: TrezorWireEIP712Type = {
        dataType: TrezorWireEIP712ValueType.ARRAY,
      };
      const idxL = type.indexOf("[");
      if (idxL === -1) {
        throw new HardhatTrezorError(`Invalid array type: ${type}`);
      }
      out.entryType = this._convertType(type.slice(0, idxL));
      if (idxL + 1 !== type.length - 1) {
        out.size = parseInt(type.slice(idxL + 1, type.length - 1));
      }
      return out;
    }
    // check uint
    if (type.startsWith("uint")) {
      const out: TrezorWireEIP712Type = {
        dataType: TrezorWireEIP712ValueType.UINT,
      };
      if (type.length > 4) {
        out.size = parseInt(type.slice(4)) / 8;
      }
      return out;
    }
    // check int
    if (type.startsWith("int")) {
      const out: TrezorWireEIP712Type = {
        dataType: TrezorWireEIP712ValueType.INT,
      };
      if (type.length > 3) {
        out.size = parseInt(type.slice(3)) / 8;
      }
      return out;
    }
    // check bytes
    if (type.startsWith("bytes")) {
      const out: TrezorWireEIP712Type = {
        dataType: TrezorWireEIP712ValueType.BYTES,
      };
      if (type.length > 5) {
        out.size = parseInt(type.slice(5));
      }
      return out;
    }
    // check string, bool, address
    if (type === "string") {
      return {
        dataType: TrezorWireEIP712ValueType.STRING,
      };
    }
    if (type === "bool") {
      return {
        dataType: TrezorWireEIP712ValueType.BOOL,
      };
    }
    if (type === "address") {
      return {
        dataType: TrezorWireEIP712ValueType.ADDRESS,
      };
    }
    // check struct
    return {
      dataType: TrezorWireEIP712ValueType.STRUCT,
      size: this.types[type].length,
      structName: type,
    };
  }
  public createEthereumTypedDataStructAck(name: string): {
    members: unknown[];
  } {
    return {
      members: this.types[name].map((m) => {
        return {
          name: m.name,
          type: this._convertType(m.type),
        };
      }),
    };
  }
}
