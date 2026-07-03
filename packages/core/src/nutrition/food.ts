import type { FoodUnit } from './units'

/**
 * Where a food entry's nutrition data originated. `ai_estimate` values carry a
 * {@link EstimatedFoodItem.confidence}; the others are treated as authoritative.
 */
export type FoodSource = 'ai_estimate' | 'barcode' | 'database' | 'manual'

/** The meal a food entry is logged under. */
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

/**
 * A single food item as estimated by the AI vision/text pipeline, before the
 * user confirms it into the diary. Macros are in grams; calories in kcal.
 */
export interface EstimatedFoodItem {
  /** Human-readable food name, e.g. `"Grilled chicken breast"`. */
  name: string
  /** Amount of the food, expressed in {@link EstimatedFoodItem.unit}. */
  quantity: number
  /** Unit the {@link EstimatedFoodItem.quantity} is recorded in. */
  unit: FoodUnit
  /** Energy for the given quantity, in kilocalories. */
  calories: number
  /** Protein for the given quantity, in grams. */
  protein: number
  /** Carbohydrates for the given quantity, in grams. */
  carbs: number
  /** Fat for the given quantity, in grams. */
  fat: number
  /** Model confidence in this estimate, from 0 (none) to 1 (certain). */
  confidence: number
}
