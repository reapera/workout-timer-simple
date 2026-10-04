import type { LoadType } from "./exercises";
import type { Equipment } from "./types";

/**
 * Spin-lock dumbbells can only make the weights their plates add up to, and
 * each end of a handle must carry the same plates. Everything here works in
 * grams so that 1.25 + 1.5 never turns into 2.7499999.
 */

export const DEFAULT_EQUIPMENT: Equipment = {
  handles: 2,
  handleWeight: 2,
  plates: [
    { size: 1.25, count: 4 },
    { size: 1.5, count: 4 },
    { size: 2, count: 4 },
    { size: 2.5, count: 4 },
    { size: 3, count: 4 },
  ],
  platesPerSide: 3,
  bench: false,
};

export type Loading = {
  /** kg for one dumbbell. */
  weight: number;
  /** Plates on each end of the handle, heaviest first (kg). */
  perSide: number[];
};

const grams = (kg: number) => Math.round(kg * 1000);
const kilos = (g: number) => Math.round(g) / 1000;

/** Two matching dumbbells share the plate stock, so each gets half of it. */
function endsSharingStock(equipment: Equipment, mode: LoadType): number {
  return mode === "pair" && equipment.handles >= 2 ? 4 : 2;
}

/**
 * Every weight one dumbbell can be loaded to, with the simplest way to load
 * it (fewest plates, then heaviest plates). Sorted lightest first; the empty
 * handle is always included.
 */
export function loadings(equipment: Equipment, mode: LoadType): Loading[] {
  const ends = endsSharingStock(equipment, mode);
  const stock = new Map<number, number>();
  for (const plate of equipment.plates) {
    const size = grams(plate.size);
    if (size <= 0 || !Number.isFinite(size) || plate.count <= 0) continue;
    stock.set(size, (stock.get(size) ?? 0) + Math.floor(plate.count));
  }
  const sizes = [...stock.entries()]
    .map(([size, count]) => ({ size, max: Math.floor(count / ends) }))
    .filter((entry) => entry.max > 0)
    .sort((a, b) => b.size - a.size);

  const perSideLimit = Math.max(0, Math.floor(equipment.platesPerSide));
  const best = new Map<number, number[]>();

  const consider = (plates: number[]) => {
    const total = plates.reduce((sum, plate) => sum + plate, 0);
    const current = best.get(total);
    if (!current || isSimpler(plates, current)) best.set(total, [...plates]);
  };

  const walk = (index: number, room: number, chosen: number[]) => {
    if (index === sizes.length) {
      consider(chosen);
      return;
    }
    const { size, max } = sizes[index];
    for (let count = Math.min(max, room); count >= 0; count -= 1) {
      for (let i = 0; i < count; i += 1) chosen.push(size);
      walk(index + 1, room - count, chosen);
      chosen.length -= count;
    }
  };
  walk(0, perSideLimit, []);

  const handle = grams(Math.max(0, equipment.handleWeight));
  return [...best.entries()]
    .map(([side, plates]) => ({
      weight: kilos(handle + 2 * side),
      perSide: plates.map(kilos),
    }))
    .sort((a, b) => a.weight - b.weight);
}

function isSimpler(candidate: number[], current: number[]): boolean {
  if (candidate.length !== current.length) return candidate.length < current.length;
  for (let i = 0; i < candidate.length; i += 1) {
    if (candidate[i] !== current[i]) return candidate[i] > current[i];
  }
  return false;
}

/**
 * The weights an exercise can progress through. Bodyweight moves that take a
 * dumbbell later start the ladder at 0.
 */
export function ladderFor(
  exercise: { load: LoadType; bodyweightStart?: boolean },
  equipment: Equipment,
): number[] {
  if (exercise.load === "none") return [0];
  const weights = loadings(equipment, exercise.load).map((loading) => loading.weight);
  return exercise.bodyweightStart ? [0, ...weights] : weights;
}

export function loadingFor(
  equipment: Equipment,
  mode: LoadType,
  weight: number,
): Loading | null {
  if (mode === "none" || weight <= 0) return null;
  const target = grams(weight);
  return loadings(equipment, mode).find((loading) => grams(loading.weight) === target) ?? null;
}

const EPSILON = 1e-6;

/** Heaviest weight on the ladder at or below `kg` (the lightest if none). */
export function snapDown(ladder: number[], kg: number): number {
  let result = ladder[0] ?? 0;
  for (const weight of ladder) if (weight <= kg + EPSILON) result = weight;
  return result;
}

/** Closest weight on the ladder, preferring the lighter one on a tie. */
export function snapNearest(ladder: number[], kg: number): number {
  let result = ladder[0] ?? 0;
  for (const weight of ladder) {
    if (Math.abs(weight - kg) < Math.abs(result - kg) - EPSILON) result = weight;
  }
  return result;
}

/**
 * The next weight up worth moving to: the lightest one at least `minStep`
 * heavier (as a fraction), or failing that the heaviest available. `null`
 * when `kg` is already the top of the ladder.
 */
export function stepUp(ladder: number[], kg: number, minStep: number): number | null {
  const heavier = ladder.filter((weight) => weight > kg + EPSILON);
  if (!heavier.length) return null;
  if (kg <= 0) return heavier[0];
  return heavier.find((weight) => weight >= kg * (1 + minStep) - EPSILON) ?? heavier[heavier.length - 1];
}

/**
 * A lighter weight to rebuild from: the heaviest at least `fraction` lighter,
 * or failing that the next one down. Stays put at the bottom of the ladder.
 */
export function stepDown(ladder: number[], kg: number, fraction: number): number {
  const lighter = ladder.filter((weight) => weight < kg - EPSILON);
  if (!lighter.length) return kg;
  const target = kg * (1 - fraction);
  const far = lighter.filter((weight) => weight <= target + EPSILON);
  return far.length ? far[far.length - 1] : lighter[lighter.length - 1];
}

/** "1.25×4, 1.5×4" ⇄ PlateStock[], the format stored in Notion. */
export function formatPlates(plates: Equipment["plates"]): string {
  return plates
    .filter((plate) => plate.count > 0)
    .sort((a, b) => a.size - b.size)
    .map((plate) => `${trimNumber(plate.size)}×${plate.count}`)
    .join(", ");
}

export function parsePlates(text: string): Equipment["plates"] {
  const plates: Equipment["plates"] = [];
  // Token by token rather than splitting on commas, so "1,25×4" still reads as 1.25 kg.
  for (const match of text.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:kg)?\s*[x×*]\s*(\d+)/gi)) {
    const size = Number(match[1].replace(",", "."));
    const count = Number(match[2]);
    if (size > 0 && count > 0) plates.push({ size, count });
  }
  return plates.sort((a, b) => a.size - b.size);
}

export function trimNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}
