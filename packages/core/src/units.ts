/**
 * Weight units supported throughout the domain. Internally, volume and other
 * derived metrics normalize to kilograms; `lb` is offered for display/input.
 */
export type WeightUnit = 'kg' | 'lb'

/** Pounds in one kilogram (1 kg = 2.2046226218 lb). */
export const LB_PER_KG = 2.2046226218

/** Kilograms in one pound (the reciprocal of {@link LB_PER_KG}). */
export const KG_PER_LB = 1 / LB_PER_KG

/**
 * Convert a weight `value` from one unit to another.
 * Returns the value unchanged when `from` and `to` are identical.
 */
export function convertWeight(value: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return value
  return from === 'kg' ? value * LB_PER_KG : value * KG_PER_LB
}

/**
 * Round `value` to the nearest multiple of `increment` (e.g. 2.5 kg plates).
 * Returns `value` unchanged when `increment` is not a positive, finite number.
 */
export function roundToIncrement(value: number, increment: number): number {
  if (!Number.isFinite(increment) || increment <= 0) return value
  return Math.round(value / increment) * increment
}
