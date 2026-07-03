/**
 * Units a food quantity can be recorded in. Mass (`g`, `oz`) and volume
 * (`ml`, `tbsp`, `tsp`, `cup`) units sit alongside count-based units
 * (`piece`, `serving`) for foods without a natural weight or volume.
 */
export type FoodUnit = 'g' | 'oz' | 'ml' | 'tbsp' | 'tsp' | 'cup' | 'piece' | 'serving'
