export function numberToByteArray(
  v: number | bigint | boolean | string,
  size: number = 0,
): number[] {
  // big endian
  const bytes: number[] = [];

  let bv = BigInt(v);
  while (true) {
    bytes.unshift(Number(bv & BigInt(0xff)));
    bv = bv >> BigInt(8);
    if (size === 0) {
      if (bv == BigInt(0)) {
        break;
      }
    } else {
      if (bytes.length >= size) {
        break;
      }
    }
  }

  return bytes;
}

export function numberToHex(
  v: number | bigint | boolean | string,
  size: number = 0,
  addPrefix?: boolean,
): string {
  return bytesToHex(numberToByteArray(v, size), addPrefix);
}

export function numberToBytes(
  v: number | bigint | boolean | string,
  size?: number,
): Uint8Array;

export function numberToBytes(
  v: number | bigint | boolean | string | null | undefined,
  size?: number,
): Uint8Array | undefined;

export function numberToBytes(
  v: number | bigint | boolean | string | null | undefined,
  size: number = 0,
): Uint8Array | undefined {
  if (v == null) {
    return undefined;
  }
  return new Uint8Array(numberToByteArray(v, size));
}

export function bufferToBytes(buf: Buffer): Uint8Array;

export function bufferToBytes(
  buf: Buffer | null | undefined,
): Uint8Array | undefined;

export function bufferToBytes(
  buf: Buffer | null | undefined,
): Uint8Array | undefined {
  if (!buf) {
    return undefined;
  }
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

export function hexToBytes(data: string): Uint8Array {
  if (data.startsWith("0x")) {
    data = data.slice(2);
  }
  return bufferToBytes(Buffer.from(data, "hex"));
}

export function stringToBytes(data: string): Uint8Array {
  return bufferToBytes(Buffer.from(data));
}

export function bytesToHex(
  bytes: ArrayLike<number>,
  addPrefix: boolean = false,
): string {
  return (
    (addPrefix ? "0x" : "") +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

export function base64ToBytes(data: string): Uint8Array {
  return bufferToBytes(Buffer.from(data, "base64"));
}

export function base64ToHex(data: string, addPrefix?: boolean): string {
  return bytesToHex(base64ToBytes(data), addPrefix);
}
