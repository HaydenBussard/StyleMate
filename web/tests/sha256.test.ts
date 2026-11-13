import { createHash } from "node:crypto";
import { sha256Hex, sha256HexJs } from "../src/core/sha256";

const ref = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

describe("sha256", () => {
  it("matches known vectors", () => {
    expect(sha256HexJs(new Uint8Array())).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256HexJs(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("matches node:crypto across padding boundaries", () => {
    for (const n of [1, 55, 56, 63, 64, 65, 119, 120, 1000, 100_003]) {
      const b = new Uint8Array(n).map((_, i) => (i * 31 + n) & 0xff);
      expect(sha256HexJs(b)).toBe(ref(b));
    }
  });

  it("Web Crypto path agrees with the JS fallback", async () => {
    const b = new Uint8Array(5000).map((_, i) => i & 0xff);
    expect(await sha256Hex(b.buffer)).toBe(sha256HexJs(b));
  });
});
