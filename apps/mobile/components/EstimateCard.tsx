import { StyleSheet, Text, View } from 'react-native'

import type { NutritionEstimate } from '@/lib/estimate'

/**
 * The totals + per-item breakdown of a nutrition estimate, with no actions of
 * its own. Shared by the Simulate screen for both a fresh preview and expanded
 * history entries.
 */
export function EstimateCard({ estimate }: { estimate: NutritionEstimate }) {
  const { totals, items } = estimate
  return (
    <View style={styles.wrap}>
      <Text style={styles.totals}>
        {Math.round(totals.calories)} kcal · {Math.round(totals.protein)}P /{' '}
        {Math.round(totals.carbs)}C / {Math.round(totals.fat)}F
      </Text>

      <View style={styles.items}>
        {items.map((item, index) => (
          <View key={`${item.name}-${index}`} style={styles.itemRow}>
            <View style={styles.itemMain}>
              <Text style={styles.itemName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.itemQty}>
                {formatQuantity(item.quantity)} {item.unit}
              </Text>
            </View>
            <View style={styles.itemNumbers}>
              <Text style={styles.itemCalories}>{Math.round(item.calories)}</Text>
              <Text style={styles.itemProtein}>{Math.round(item.protein)}g protein</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

function formatQuantity(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(1)
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  totals: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111',
  },
  items: {
    gap: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  itemMain: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    fontSize: 15,
    color: '#111',
  },
  itemQty: {
    fontSize: 13,
    color: '#999',
  },
  itemNumbers: {
    alignItems: 'flex-end',
    gap: 2,
  },
  itemCalories: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
  },
  itemProtein: {
    fontSize: 12,
    color: '#999',
  },
})
