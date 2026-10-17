import { describe, expect, it } from "vitest";

import { getExercise } from "./exercises";
import { formatNextStep } from "./format";

const goblet = getExercise("goblet-squat");
const floorPress = getExercise("floor-press");
const carry = getExercise("farmer-carry");
const sidePlank = getExercise("side-plank");

describe("formatNextStep", () => {
  it("fits a list row", () => {
    expect(formatNextStep({ kind: "weight", target: 15, weight: 8.5, seconds: null }, goblet)).toBe("15 reps every set → 8.5 kg");
    expect(formatNextStep({ kind: "reps", target: 15, reps: 18 }, goblet)).toBe("15 reps every set → aim for 18");
    expect(formatNextStep({ kind: "seconds", target: 20, seconds: 25 }, carry)).toBe("20 s every set → 25 s");
    expect(formatNextStep({ kind: "weight", target: 45, weight: 8.5, seconds: 20 }, carry)).toBe("45 s every set → 8.5 kg");
  });

  it("spells it out on the workout screen", () => {
    expect(formatNextStep({ kind: "weight", target: 15, weight: 8.5, seconds: null }, goblet, { long: true })).toBe(
      "Get 15 reps on every set and next time goes up to 8.5 kg.",
    );
    expect(formatNextStep({ kind: "weight", target: 15, weight: 6, seconds: null }, floorPress, { long: true })).toBe(
      "Get 15 reps on every set and next time goes up to 6 kg each.",
    );
    expect(formatNextStep({ kind: "weight", target: 45, weight: 8.5, seconds: 20 }, carry, { long: true })).toBe(
      "Carry for 45 s on every set and next time goes up to 8.5 kg each (for 20 s).",
    );
    expect(formatNextStep({ kind: "seconds", target: 20, seconds: 25 }, sidePlank, { long: true })).toBe(
      "Hold for 20 s on every set and next time is 25 s.",
    );
    expect(formatNextStep({ kind: "reps", target: 15, reps: 18 }, goblet, { long: true })).toBe(
      "Get 15 reps on every set and next time aims for 18 — the next dumbbell up is a big jump.",
    );
  });
});
