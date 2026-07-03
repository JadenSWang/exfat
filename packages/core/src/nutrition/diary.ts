import type { FoodSource, MealType } from './food'
import type { FoodUnit } from './units'
import { type MacroNutrients, sumMacros } from './macros'

/**
 * A daily nutrition target: the calories and macros the user aims to hit. A
 * distinct interface (rather than an alias) so goals read as their own domain
 * concept and can grow independent fields later.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface DailyGoals extends MacroNutrients {}

/** A confirmed food entry in the user's daily diary. Macros are in grams. */
export interface DiaryItem {
  /** Human-readable food name. */
  name: string
  /** Meal this entry is logged under. */
  meal: MealType
  /** Amount of the food, expressed in {@link DiaryItem.unit}. */
  quantity: number
  /** Unit the {@link DiaryItem.quantity} is recorded in. */
  unit: FoodUnit
  /** Energy for the logged quantity, in kilocalories. */
  calories: number
  /** Protein for the logged quantity, in grams. */
  protein: number
  /** Carbohydrates for the logged quantity, in grams. */
  carbs: number
  /** Fat for the logged quantity, in grams. */
  fat: number
  /** Where this entry's nutrition data came from. */
  source: FoodSource
}

/**
 * Group `items` by meal, always returning all four meal keys (breakfast,
 * lunch, dinner, snack). Empty meals map to an empty array; item order within
 * each meal is preserved.
 */
export function groupByMeal(items: DiaryItem[]): Record<MealType, DiaryItem[]> {
  const grouped: Record<MealType, DiaryItem[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  }
  for (const item of items) {
    grouped[item.meal].push(item)
  }
  return grouped
}

/** Sum the calories and macros of all diary `items` into one total. */
export function diaryTotals(items: DiaryItem[]): MacroNutrients {
  return sumMacros(items)
}
