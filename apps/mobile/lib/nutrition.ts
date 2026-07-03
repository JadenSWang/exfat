import type { DailyGoals, DiaryItem, MealType } from '@workout/core'
import type { BiologicalSex, Tables, WeightUnit } from '@workout/supabase'

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

const LB_PER_KG = 2.20462

/** kcal per lb of body weight, per goal (~14 kcal/lb is maintenance). Used as a
 *  fallback when we lack the height/sex/age needed for a real BMR estimate. */
const GOAL_MULTIPLIER: Record<Goal, number> = {
  lose: 10, // aggressive deficit
  recomp: 14, // maintenance
  bulk: 18, // aggressive surplus
}

/**
 * Maintenance (TDEE) multiplier applied to resting BMR. We don't ask for an
 * activity level (one fewer onboarding question), so we assume "lightly
 * active" — a reasonable middle for most people.
 */
const ACTIVITY_FACTOR = 1.45

/**
 * How each goal shifts maintenance (TDEE) calories. Tuned to be aggressive on
 * the cut: `lose` is a hard deficit and `recomp` a mild one, while `bulk` stays
 * a modest surplus. Calibrated against a 6'2"/205lb reference (~2000 lose /
 * ~2500 recomp / ~3250 bulk around age 30).
 */
const GOAL_FACTOR: Record<Goal, number> = {
  lose: 0.7, // hard deficit
  recomp: 0.88, // mild deficit — a slight cut, not pure maintenance
  bulk: 1.15, // modest surplus
}

/** Round a raw kcal figure to the nearest 50, with a sane 1200 kcal floor. */
function clampTarget(calories: number): number {
  return Math.max(Math.round(calories / 50) * 50, 1200)
}

/**
 * Approximate age in whole years from a birth year/month. We only store month
 * granularity, so the result can be off by up to a year — fine for BMR. Clamped
 * to a plausible adult range so a fat-fingered year can't wreck the estimate.
 */
export function ageFromBirth(birthYear: number, birthMonth: number, now = new Date()): number {
  let age = now.getFullYear() - birthYear
  // getMonth() is 0-based; birthMonth is 1-based. If this year's birth month
  // hasn't arrived yet, they're a year younger than the raw difference.
  if (now.getMonth() + 1 < birthMonth) age -= 1
  return Math.min(Math.max(age, 14), 100)
}

/** Inputs to a calorie-target suggestion. Height/sex/age are optional; without
 *  the full set we fall back to a simpler weight-only heuristic. */
export interface CalorieTargetInput {
  weight: number
  unit: WeightUnit
  goal: Goal
  heightCm?: number | null
  sex?: BiologicalSex | null
  age?: number | null
}

/**
 * Suggest a daily calorie target. With height, sex, and age we use the
 * Mifflin–St Jeor equation (resting BMR × an assumed activity factor, then
 * nudged by the goal). Missing any of those, we fall back to the older
 * kcal-per-lb heuristic so pre-height profiles still get a number.
 */
export function suggestCalorieTarget(input: CalorieTargetInput): number {
  const { weight, unit, goal, heightCm, sex, age } = input
  const kg = unit === 'kg' ? weight : weight / LB_PER_KG

  if (heightCm && heightCm > 0 && sex && age) {
    // Mifflin–St Jeor resting metabolic rate (kcal/day).
    const bmr = 10 * kg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161)
    return clampTarget(bmr * ACTIVITY_FACTOR * GOAL_FACTOR[goal])
  }

  const lbs = kg * LB_PER_KG
  return clampTarget(lbs * GOAL_MULTIPLIER[goal])
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
