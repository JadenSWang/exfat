/**
 * @workout/core — framework-agnostic domain model and pure logic for strength
 * training and nutrition tracking. Zero runtime dependencies; safe to import
 * from any environment.
 */

// Strength training (set aside for the nutrition pivot, retained as-is).
export * from './units'
export * from './exercise'
export * from './set'
export * from './workout'
export * from './metrics'

// Nutrition / calorie tracking.
export * from './nutrition/units'
export * from './nutrition/food'
export * from './nutrition/macros'
export * from './nutrition/diary'
