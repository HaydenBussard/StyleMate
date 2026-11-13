import { describe, expect, it } from "vitest";
import { arrowPoints, center, colorFor, toggle, type Annotation } from "../src/ui/annotations";

const a = (from: string, to: string, color: Annotation["color"] = "green") => ({ from, to, color }) as Annotation;
const mods = (shiftKey = false, altKey = false, ctrlKey = false) => ({ shiftKey, altKey, ctrlKey });

describe("annotations", () => {
  it("toggles: add, recolour, remove", () => {
    let list = toggle([], a("e2", "e4"));
    expect(list).toEqual([a("e2", "e4")]);
    list = toggle(list, a("e2", "e4", "red"));
    expect(list).toEqual([a("e2", "e4", "red")]);
    list = toggle(list, a("e2", "e4", "red"));
    expect(list).toEqual([]);
  });

  it("keeps arrows and circles on the same square separate", () => {
    const list = toggle(toggle([], a("e4", "e4")), a("e2", "e4"));
    expect(list).toHaveLength(2);
  });

  it("picks colours from modifier keys like Lichess", () => {
    expect(colorFor(mods())).toBe("green");
    expect(colorFor(mods(true))).toBe("red");
    expect(colorFor(mods(false, true))).toBe("blue");
    expect(colorFor(mods(false, false, true))).toBe("blue");
    expect(colorFor(mods(true, true))).toBe("yellow");
  });

  it("maps squares to board coordinates, including when flipped", () => {
    expect(center("a8", false)).toEqual([0.5, 0.5]);
    expect(center("h1", false)).toEqual([7.5, 7.5]);
    expect(center("a8", true)).toEqual([7.5, 7.5]);
    expect(center("e2", true)).toEqual([3.5, 1.5]);
  });

  it("bends knight arrows in an L and keeps other arrows straight", () => {
    expect(arrowPoints("e2", "e4", false)).toHaveLength(2);
    expect(arrowPoints("a1", "h8", false)).toHaveLength(2);
    // g1-f3: long leg (two ranks) first, then one file across
    expect(arrowPoints("g1", "f3", false)).toEqual([[6.5, 7.5], [6.5, 5.5], [5.5, 5.5]]);
    // b1-d2: long leg (two files) first
    expect(arrowPoints("b1", "d2", false)).toEqual([[1.5, 7.5], [3.5, 7.5], [3.5, 6.5]]);
  });
});
