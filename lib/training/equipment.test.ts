import { describe, expect, it } from "vitest";

import {
  DEFAULT_EQUIPMENT,
  formatPlates,
  ladderFor,
  loadingFor,
  loadings,
  parsePlates,
  snapDown,
  stepDown,
  stepUp,
} from "./equipment";
import type { Equipment } from "./types";

const PAIR_LADDER = [
  2, 4.5, 5, 6, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 15.5,
  16, 17,
];

describe("loadings", () => {
  it("lists every weight a matching pair can make from four of each plate", () => {
    expect(loadings(DEFAULT_EQUIPMENT, "pair").map((l) => l.weight)).toEqual(PAIR_LADDER);
  });

  it("lets a single dumbbell use twice the plates", () => {
    const weights = loadings(DEFAULT_EQUIPMENT, "single").map((l) => l.weight);
    expect(weights[0]).toBe(2);
    // Three plates a side, two of each size available: 3 + 3 + 2.5 per side.
    expect(weights[weights.length - 1]).toBe(19);
    expect(weights).toContain(4.5);
    expect(new Set(weights).size).toBe(weights.length);
  });

  it("picks the simplest loading: fewest plates, then the heaviest ones", () => {
    expect(loadingFor(DEFAULT_EQUIPMENT, "pair", 9.5)?.perSide).toEqual([2.5, 1.25]);
    // 4.5 a side is 3 + 1.5 or 2.5 + 2; both are two plates, so the heavier first plate wins.
    expect(loadingFor(DEFAULT_EQUIPMENT, "pair", 11)?.perSide).toEqual([3, 1.5]);
    expect(loadingFor(DEFAULT_EQUIPMENT, "pair", 2)?.perSide).toEqual([]);
    expect(loadingFor(DEFAULT_EQUIPMENT, "pair", 3)).toBeNull();
  });

  it("respects how many plates fit on the handle", () => {
    const longer: Equipment = { ...DEFAULT_EQUIPMENT, platesPerSide: 4 };
    const weights = loadings(longer, "pair").map((l) => l.weight);
    expect(weights[weights.length - 1]).toBe(20);
  });

  it("treats a pair as a single dumbbell when only one handle is owned", () => {
    const oneHandle: Equipment = { ...DEFAULT_EQUIPMENT, handles: 1 };
    expect(loadings(oneHandle, "pair")).toEqual(loadings(DEFAULT_EQUIPMENT, "single"));
  });

  it("copes with odd handle weights without float drift", () => {
    const odd: Equipment = { ...DEFAULT_EQUIPMENT, handleWeight: 1.8 };
    const weights = loadings(odd, "pair").map((l) => l.weight);
    expect(weights).toContain(4.3);
    expect(weights.every((w) => Number.isInteger(Math.round(w * 1000)))).toBe(true);
  });
});

describe("ladderFor", () => {
  it("starts bodyweight moves at zero", () => {
    expect(ladderFor({ load: "single", bodyweightStart: true }, DEFAULT_EQUIPMENT)[0]).toBe(0);
    expect(ladderFor({ load: "none" }, DEFAULT_EQUIPMENT)).toEqual([0]);
    expect(ladderFor({ load: "pair" }, DEFAULT_EQUIPMENT)).toEqual(PAIR_LADDER);
  });
});

describe("stepping", () => {
  it("moves up by at least 5% when it can", () => {
    expect(stepUp(PAIR_LADDER, 10, 0.05)).toBe(10.5);
    expect(stepUp(PAIR_LADDER, 5, 0.05)).toBe(6);
    expect(stepUp(PAIR_LADDER, 16.5, 0.05)).toBe(17);
    expect(stepUp(PAIR_LADDER, 17, 0.05)).toBeNull();
    expect(stepUp([0, ...PAIR_LADDER], 0, 0.05)).toBe(2);
  });

  it("backs off about 10%, or one step when that is all there is", () => {
    expect(stepDown(PAIR_LADDER, 10, 0.1)).toBe(9);
    expect(stepDown(PAIR_LADDER, 4.5, 0.1)).toBe(2);
    expect(stepDown(PAIR_LADDER, 2, 0.1)).toBe(2);
    expect(stepDown(PAIR_LADDER, 10, 0)).toBe(9.5);
  });

  it("snaps down to an achievable weight", () => {
    expect(snapDown(PAIR_LADDER, 6.9)).toBe(6);
    expect(snapDown(PAIR_LADDER, 1)).toBe(2);
  });
});

describe("plate text", () => {
  it("round-trips the Notion format", () => {
    const text = formatPlates(DEFAULT_EQUIPMENT.plates);
    expect(text).toBe("1.25×4, 1.5×4, 2×4, 2.5×4, 3×4");
    expect(parsePlates(text)).toEqual(DEFAULT_EQUIPMENT.plates);
  });

  it("accepts sloppy input", () => {
    expect(parsePlates("2.5 kg x 2; 1,25x4\nnonsense")).toEqual([
      { size: 1.25, count: 4 },
      { size: 2.5, count: 2 },
    ]);
  });
});
