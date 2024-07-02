import { assert } from "chai";
import { numberToByteArray, numberToHex } from "../src/encoding";

describe("encoding", () => {
  it("should convert number to bytes", () => {
    let bytes = numberToByteArray(0x114514, 4);
    assert.deepEqual([0x00, 0x11, 0x45, 0x14], bytes);

    bytes = numberToByteArray(0x114514, 0);
    assert.deepEqual([0x11, 0x45, 0x14], bytes);
  });
  it("should convert number to hex", () => {
    let hex = numberToHex(0x114514, 4, true);
    assert.equal("0x00114514", hex);

    hex = numberToHex(0x114514, 0);
    assert.equal("114514", hex);
  });
});
