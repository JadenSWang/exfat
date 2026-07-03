import type { DailyGoals, DiaryItem, MealType } from '@workout/core'
import type { Tables, WeightUnit } from '@workout/supabase'

/**
 * Sensible fallback targets used when the user has no saved goals yet or the
 * backend is unreachable (calories 2000 / protein 150 / carbs 200 / fat 65).
 */
export const DEFAULT_GOALS: DailyGoals = {
  calories: 2000,
  protein: 150,
  carbs: 200,
  fat: 65,
}

/** What the user wants out of their calorie target. */
export type Goal = 'lose' | 'recomp' | 'bulk'

/** kcal per lb of body weight, per goal (~14 kcal/lb is maintenance). */
const GOAL_MULTIPLIER: Record<Goal, number> = {
  lose: 10, // aggressive deficit
  recomp: 14, // maintenance
  bulk: 18, // aggressive surplus
}

/**
 * Suggest a daily calorie target from body weight and goal: the goal picks a
 * kcal-per-lb multiplier around the ~14 kcal/lb maintenance rule of thumb,
 * rounded to the nearest 50.
 */
export function suggestCalorieTarget(weight: number, unit: WeightUnit, goal: Goal = 'recomp'): number {
  const lbs = unit === 'kg' ? weight * 2.20462 : weight
  return Math.max(Math.round((lbs * GOAL_MULTIPLIER[goal]) / 50) * 50, 1200)
}

/**
 * Derive macro goals from a calorie target and body weight: protein is 1g per
 * lb of body weight, and the remaining calories split between carbs and fat
 * in the same 4:3 ratio as the old 40%/30% split (4/4/9 kcal per gram).
 */
export function goalsFromCalories(calories: number, weight: number, unit: WeightUnit): DailyGoals {
  const lbs = unit === 'kg' ? weight * 2.20462 : weight
  const protein = Math.round(lbs)
  const remaining = Math.max(calories - protein * 4, 0)
  return {
    calories,
    protein,
    carbs: Math.round((remaining * (4 / 7)) / 4),
    fat: Math.round((remaining * (3 / 7)) / 9),
  }
}

/** The four meals in display order. */
export const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

/** Human-readable label for a meal key. */
export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

/** Today's date as a `YYYY-MM-DD` string in the device's local time zone. */
export function todayISODate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Shift a `YYYY-MM-DD` date string by a number of days. */
export function shiftISODate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const shifted = new Date(year, month - 1, day + days)
  const m = String(shifted.getMonth() + 1).padStart(2, '0')
  const d = String(shifted.getDate()).padStart(2, '0')
  return `${shifted.getFullYear()}-${m}-${d}`
}

/** Parse a `YYYY-MM-DD` string as a local-time Date (avoids the UTC shift of `new Date(string)`). */
export function parseISODate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** Guess a default meal from the current hour of day. */
export function defaultMealForNow(date = new Date()): MealType {
  const hour = date.getHours()
  if (hour < 11) return 'breakfast'
  if (hour < 15) return 'lunch'
  if (hour < 21) return 'dinner'
  return 'snack'
}

/**
 * Map a persisted `diary_entries` row into the framework-agnostic
 * {@link DiaryItem} shape consumed by `@workout/core` helpers.
 */
export function rowToDiaryItem(row: Tables<'diary_entries'>): DiaryItem {
  return {
    id: row.id,
    name: row.description,
    meal: row.meal,
    quantity: row.quantity,
    unit: row.unit,
    calories: row.calories,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    source: row.source,
  }
}
