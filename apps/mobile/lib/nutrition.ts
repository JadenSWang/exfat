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

/**
 * Suggest a daily calorie target from body weight: ~14 kcal per lb of body
 * weight (a common maintenance rule of thumb), rounded to the nearest 50.
 */
export function suggestCalorieTarget(weight: number, unit: WeightUnit): number {
  const lbs = unit === 'kg' ? weight * 2.20462 : weight
  return Math.max(Math.round((lbs * 14) / 50) * 50, 1200)
}

/**
 * Derive macro goals from a calorie target using a 30% protein / 40% carbs /
 * 30% fat calorie split (4/4/9 kcal per gram).
 */
export function goalsFromCalories(calories: number): DailyGoals {
  return {
    calories,
    protein: Math.round((calories * 0.3) / 4),
    carbs: Math.round((calories * 0.4) / 4),
    fat: Math.round((calories * 0.3) / 9),
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
