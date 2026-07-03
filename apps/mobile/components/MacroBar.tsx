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
}

/** A labeled progress bar showing `consumed` vs `goal` for a single macro. */
export function MacroBar({ label, consumed, goal, unit = 'g', color = '#208AEF' }: MacroBarProps) {
  const ratio = goal > 0 ? Math.min(consumed / goal, 1) : 0
  const remaining = Math.max(goal - consumed, 0)

  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.numbers}>
          {Math.round(consumed)} / {Math.round(goal)}
          {unit} · {Math.round(remaining)}
          {unit} left
        </Text>
      </View>
      <View style={styles.track}>
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
    fontSize: 13,
    fontWeight: '700',
    color: '#111',
  },
  numbers: {
    fontSize: 12,
    color: '#999',
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EEE',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
})
