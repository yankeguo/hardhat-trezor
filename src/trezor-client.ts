import { HardhatTrezorError } from "./errors";
import { TrezorWire } from "./trezor-wire";

export const defaultTrezorBridgeURL = "http://127.0.0.1:21325";

export interface TrezorClientOptions {
  bridgeURL?: string;
  wire: TrezorWire;
}

export class TrezorClient {
  bridgeURL: string;
  wire: TrezorWire;

  constructor(opts: TrezorClientOptions) {
    let bridgeURL = opts.bridgeURL ?? defaultTrezorBridgeURL;
    if (bridgeURL.endsWith("/")) {
      bridgeURL = bridgeURL.slice(0, -1);
    }
    this.bridgeURL = bridgeURL;
    this.wire = opts.wire;
  }

  async invoke(path: string, body: any = {}) {
    if (!path.startsWith("/")) {
      path = `/${path}`;
    }
    try {
      return await fetch(`${this.bridgeURL}${path}`, {
        // all requests are POST
        method: "POST",
        body: typeof body == "string" ? body : JSON.stringify(body),
        headers: {
          ContentType:
            typeof body == "string" ? "text/plain" : "application/json",
          Accept: "*/*",
          // trezor-bridge requires origin from some whitelisted domains
          Origin: "http://localhost:5000",
        },
      });
    } catch (e) {
      if (e instanceof Error) {
        throw new HardhatTrezorError(
          `Failed to invoke Trezor Bridge: ${e.message}`,
          e,
        );
      } else {
        throw new HardhatTrezorError(String(e));
      }
    }
  }

  async version() {
    const resp = await this.invoke("/");
    return (await resp.json()) as {
      version: string;
    };
  }

  async enumerate() {
    const resp = await this.invoke("/enumerate");
    return (await resp.json()) as {
      path: string;
      session?: string;
    }[];
  }

  async acquire(path: string, previous?: string) {
    const resp = await this.invoke(
      `/acquire/${path}/${previous ?? "null"}`,
      {},
    );
    return (await resp.json()) as { session: string };
  }

  async call(
    session: string,
    type: number,
    data: Uint8Array,
  ): Promise<{ type: number; data: Uint8Array }> {
    // BE, 2 bytes (4 hex chars), message type
    // BE, 4 bytes (8 hex chars), message length
    // message payload
    const reqBytes = new Uint8Array(6 + data.length);
    const reqView = new DataView(reqBytes.buffer);
    reqView.setUint16(0, type, false);
    reqView.setUint32(2, data.length, false);
    reqBytes.set(data, 6);

    // convert message to hex string
    const reqHex = Array.from(reqBytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    const resp = await this.invoke(`/call/${session}`, reqHex);

    const respHex = await resp.text();

    // convert response from hex string to Uint8Array
    const respBytes = new Uint8Array(respHex.length / 2);

    for (let i = 0; i < respHex.length; i += 2) {
      respBytes[i / 2] = parseInt(respHex.slice(i, i + 2), 16);
    }

    // parse response
    const respView = new DataView(respBytes.buffer);
    const respType = respView.getUint16(0, false);
    const respDataLength = respView.getUint32(2, false);
    const respData = respBytes.slice(6);
    if (respDataLength !== respData.length) {
      throw new HardhatTrezorError("Invalid response message length");
    }
    if (respType === this.wire.MessageType_Failure) {
      const { code, message } = this.wire.Failure.decode(respData) as {
        code?: number;
        message?: string;
      };
      throw new HardhatTrezorError(`Trezor failure: ${code} ${message}`);
    }
    return {
      type: respType,
      data: respData,
    };
  }
}
