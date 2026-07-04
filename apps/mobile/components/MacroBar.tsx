import { StyleSheet, Text, View } from 'react-native'

interface MacroBarProps {
  label: string
  /** Amount consumed so far, in the macro's unit (kcal or grams). */
  consumed: number
  /** Daily goal for this macro. */
  goal: number
  /** Short unit suffix rendered after the numbers, e.g. `g` or `kcal`. */
  unit?: string
  /** Bar fill color. */
  color?: string
  /**
   * Visual weight. `primary` is a focus macro (protein) — larger label, thicker
   * bar; `secondary` is a supporting macro (carbs, fat) — smaller and dimmer.
   */
  emphasis?: 'primary' | 'secondary'
}

/** A labeled progress bar showing `consumed` vs `goal` for a single macro. */
export function MacroBar({
  label,
  consumed,
  goal,
  unit = 'g',
  color = '#208AEF',
  emphasis = 'primary',
}: MacroBarProps) {
  const ratio = goal > 0 ? Math.min(consumed / goal, 1) : 0
  const remaining = Math.max(goal - consumed, 0)
  const secondary = emphasis === 'secondary'

  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <Text style={[styles.label, secondary && styles.labelSecondary]}>{label}</Text>
        <Text style={[styles.numbers, secondary && styles.numbersSecondary]}>
          {Math.round(consumed)} / {Math.round(goal)}
          {unit} · {Math.round(remaining)}
          {unit} left
        </Text>
      </View>
      <View style={[styles.track, secondary && styles.trackSecondary]}>
        <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  label: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
  },
  labelSecondary: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.72)',
  },
  numbers: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  numbersSecondary: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  track: {
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    overflow: 'hidden',
  },
  trackSecondary: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  fill: {
    height: '100%',
    borderRadius: 5,
  },
})
