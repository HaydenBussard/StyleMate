import { describe, expect, it } from "vitest";
import { soundForSan } from "../src/ui/sound";

describe("soundForSan", () => {
  it("classifies quiet moves, captures, checks and mates", () => {
    expect(soundForSan("e4")).toBe("move");
    expect(soundForSan("O-O")).toBe("move");
    expect(soundForSan("exd5")).toBe("capture");
    expect(soundForSan("Bb5+")).toBe("check");
    expect(soundForSan("Qxf7+")).toBe("check"); // check wins over capture
    expect(soundForSan("Qxg7#")).toBe("end");
  });
});
