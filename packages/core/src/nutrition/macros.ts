/**
 * A bundle of energy and the three tracked macronutrients. `calories` is in
 * kilocalories; `protein`, `carbs`, and `fat` are in grams.
 */
export interface MacroNutrients {
  /** Energy, in kilocalories. */
  calories: number
  /** Protein, in grams. */
  protein: number
  /** Carbohydrates, in grams. */
  carbs: number
  /** Fat, in grams. */
  fat: number
}

/** Kilocalories per gram, by macronutrient (Atwater general factors). */
const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 } as const

/**
 * Estimate calories from macronutrient grams using Atwater factors
 * (`4*protein + 4*carbs + 9*fat`), rounded to the nearest integer kcal.
 */
export function caloriesFromMacros(m: { protein: number; carbs: number; fat: number }): number {
  return Math.round(
    KCAL_PER_GRAM.protein * m.protein + KCAL_PER_GRAM.carbs * m.carbs + KCAL_PER_GRAM.fat * m.fat,
  )
}

/**
 * Element-wise sum of `items`. Returns all-zero {@link MacroNutrients} when
 * `items` is empty.
 */
export function sumMacros(items: MacroNutrients[]): MacroNutrients {
  return items.reduce<MacroNutrients>(
    (total, item) => ({
      calories: total.calories + item.calories,
      protein: total.protein + item.protein,
      carbs: total.carbs + item.carbs,
      fat: total.fat + item.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )
}

/**
 * Remaining allowance toward a `goal` given what has been `consumed`, computed
 * per field. Fields may go negative once the goal is exceeded.
 */
export function remainingMacros(goal: MacroNutrients, consumed: MacroNutrients): MacroNutrients {
  return {
    calories: goal.calories - consumed.calories,
    protein: goal.protein - consumed.protein,
    carbs: goal.carbs - consumed.carbs,
    fat: goal.fat - consumed.fat,
  }
}

/**
 * Share of calories contributed by each macronutrient (`protein*4`, `carbs*4`,
 * `fat*9`) as whole percentages that are 0..100 and rounded. Returns all zeros
 * when the macros contribute no calories.
 */
export function macroCaloriePercentages(m: MacroNutrients): {
  protein: number
  carbs: number
  fat: number
} {
  const proteinKcal = KCAL_PER_GRAM.protein * m.protein
  const carbsKcal = KCAL_PER_GRAM.carbs * m.carbs
  const fatKcal = KCAL_PER_GRAM.fat * m.fat
  const total = proteinKcal + carbsKcal + fatKcal
  if (total <= 0) return { protein: 0, carbs: 0, fat: 0 }
  return {
    protein: Math.round((proteinKcal / total) * 100),
    carbs: Math.round((carbsKcal / total) * 100),
    fat: Math.round((fatKcal / total) * 100),
  }
}
