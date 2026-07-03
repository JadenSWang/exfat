import {
  groupByMeal,
  macroCaloriePercentages,
  remainingMacros,
  sumMacros,
  type DiaryItem,
  type MealType,
} from '@workout/core'
import { getDiaryEntries, getNutritionGoals } from '@workout/supabase'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'expo-router'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { EstimateTag } from '@/components/EstimateTag'
import { MacroBar } from '@/components/MacroBar'
import { Screen } from '@/components/Screen'
import {
  DEFAULT_GOALS,
  MEAL_LABELS,
  MEAL_ORDER,
  rowToDiaryItem,
  todayISODate,
} from '@/lib/nutrition'
import { dismissPendingLog, usePendingLogs, type PendingLog } from '@/lib/pendingLogs'
import { supabase } from '@/lib/supabase'

const PRETTY_DATE = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
})

/** Load today's goals + entries. Resilient: any failure falls back to defaults. */
function useToday() {
  const date = todayISODate()

  const goalsQuery = useQuery({
    queryKey: ['nutrition-goals'],
    queryFn: async () => {
      try {
        const row = await getNutritionGoals(supabase)
        if (!row) return DEFAULT_GOALS
        return {
          calories: row.calories,
          protein: row.protein,
          carbs: row.carbs,
          fat: row.fat,
        }
      } catch {
        // No backend / no project yet — degrade gracefully to defaults.
        return DEFAULT_GOALS
      }
    },
  })

  const entriesQuery = useQuery({
    queryKey: ['diary', date],
    queryFn: async (): Promise<DiaryItem[]> => {
      try {
        const rows = await getDiaryEntries(supabase, date)
        return rows.map(rowToDiaryItem)
      } catch {
        // Query can fail against a placeholder client; render the empty state.
        return []
      }
    },
  })

  return {
    goals: goalsQuery.data ?? DEFAULT_GOALS,
    items: entriesQuery.data ?? [],
    isLoading: entriesQuery.isLoading || goalsQuery.isLoading,
  }
}

export default function DiaryScreen() {
  const { goals, items } = useToday()
  const pendingLogs = usePendingLogs()

  const consumed = sumMacros(items)
  const remaining = remainingMacros(goals, consumed)
  const macroSplit = macroCaloriePercentages(consumed)
  const caloriePct = goals.calories > 0 ? Math.min(consumed.calories / goals.calories, 1) : 0
  const byMeal = groupByMeal(items)
  const hasEntries = items.length > 0

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.today}>Today</Text>
            <Text style={styles.date}>{PRETTY_DATE.format(new Date())}</Text>
          </View>
          <Link href="/settings" asChild>
            <Pressable accessibilityRole="button" hitSlop={8}>
              <Text style={styles.settingsLink}>Settings</Text>
            </Pressable>
          </Link>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.calorieHeader}>
            <Text style={styles.calorieValue}>{Math.round(consumed.calories)}</Text>
            <Text style={styles.calorieUnit}>/ {Math.round(goals.calories)} kcal</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${caloriePct * 100}%` }]} />
          </View>
          <Text style={styles.calorieRemaining}>
            {Math.round(Math.max(remaining.calories, 0))} kcal left
            {consumed.calories > 0
              ? ` · ${macroSplit.protein}P / ${macroSplit.carbs}C / ${macroSplit.fat}F`
              : ''}
          </Text>

          <View style={styles.macros}>
            <MacroBar
              label="Protein"
              consumed={consumed.protein}
              goal={goals.protein}
              color="#208AEF"
            />
            <MacroBar label="Carbs" consumed={consumed.carbs} goal={goals.carbs} color="#34C759" />
            <MacroBar label="Fat" consumed={consumed.fat} goal={goals.fat} color="#FF9500" />
          </View>
        </View>

        {pendingLogs.length > 0 ? (
          <View style={styles.pendingList}>
            {pendingLogs.map((log) => (
              <PendingRow key={log.id} log={log} />
            ))}
          </View>
        ) : null}

        {hasEntries ? (
          <View style={styles.meals}>
            {MEAL_ORDER.map((meal) => (
              <MealSection key={meal} meal={meal} items={byMeal[meal]} />
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing logged yet</Text>
            <Text style={styles.emptyBody}>
              Tap “+ Log food” and describe what you ate — we’ll estimate the calories and macros.
            </Text>
          </View>
        )}
      </ScrollView>

      <Link href="/log" asChild>
        <Pressable accessibilityRole="button" style={styles.logButton}>
          <Text style={styles.logButtonLabel}>+ Log food</Text>
        </Pressable>
      </Link>
    </Screen>
  )
}

function PendingRow({ log }: { log: PendingLog }) {
  const failed = log.status === 'error'
  return (
    <View style={[styles.pendingCard, failed && styles.pendingCardError]}>
      <View style={styles.entryMain}>
        <Text style={styles.entryName} numberOfLines={1}>
          {log.text}
        </Text>
        <Text style={failed ? styles.pendingError : styles.pendingStatus}>
          {failed ? log.error : log.status === 'saving' ? 'Saving…' : 'Estimating…'}
        </Text>
      </View>
      {failed ? (
        <Pressable accessibilityRole="button" onPress={() => dismissPendingLog(log.id)} hitSlop={8}>
          <Text style={styles.pendingDismiss}>Dismiss</Text>
        </Pressable>
      ) : (
        <ActivityIndicator size="small" color="#208AEF" />
      )}
    </View>
  )
}

function MealSection({ meal, items }: { meal: MealType; items: DiaryItem[] }) {
  if (items.length === 0) return null
  const total = sumMacros(items)

  return (
    <View style={styles.mealSection}>
      <View style={styles.mealHeader}>
        <Text style={styles.mealTitle}>{MEAL_LABELS[meal]}</Text>
        <Text style={styles.mealCalories}>{Math.round(total.calories)} kcal</Text>
      </View>
      {items.map((item, index) => (
        <View key={`${meal}-${index}`} style={styles.entryRow}>
          <View style={styles.entryMain}>
            <Text style={styles.entryName} numberOfLines={1}>
              {item.name}
            </Text>
            <View style={styles.entryMeta}>
              <Text style={styles.entryQty}>
                {formatQuantity(item.quantity)} {item.unit}
              </Text>
              {item.source === 'ai_estimate' ? <EstimateTag /> : null}
            </View>
          </View>
          <Text style={styles.entryCalories}>{Math.round(item.calories)}</Text>
        </View>
      ))}
    </View>
  )
}

function formatQuantity(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(1)
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: 0,
  },
  content: {
    gap: 20,
    paddingBottom: 96,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  today: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111',
  },
  date: {
    fontSize: 15,
    color: '#999',
  },
  settingsLink: {
    fontSize: 15,
    color: '#208AEF',
    fontWeight: '600',
  },
  summaryCard: {
    backgroundColor: '#F7F7F9',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  calorieHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  calorieValue: {
    fontSize: 34,
    fontWeight: '800',
    color: '#111',
  },
  calorieUnit: {
    fontSize: 15,
    color: '#999',
  },
  track: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E4E4E9',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: '#208AEF',
  },
  calorieRemaining: {
    fontSize: 13,
    color: '#666',
  },
  macros: {
    gap: 12,
    marginTop: 4,
  },
  meals: {
    gap: 20,
  },
  pendingList: {
    gap: 8,
  },
  pendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4E4E9',
    backgroundColor: '#F7F7F9',
    padding: 12,
  },
  pendingCardError: {
    borderColor: '#F3C2C2',
    backgroundColor: '#FDF3F3',
  },
  pendingStatus: {
    fontSize: 13,
    color: '#999',
  },
  pendingError: {
    fontSize: 13,
    color: '#d00',
    lineHeight: 18,
  },
  pendingDismiss: {
    fontSize: 13,
    color: '#d00',
    fontWeight: '600',
  },
  mealSection: {
    gap: 8,
  },
  mealHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  mealTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#999',
    letterSpacing: 0.5,
  },
  mealCalories: {
    fontSize: 13,
    color: '#999',
    fontWeight: '600',
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 4,
  },
  entryMain: {
    flex: 1,
    gap: 4,
  },
  entryName: {
    fontSize: 16,
    color: '#111',
  },
  entryMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  entryQty: {
    fontSize: 13,
    color: '#999',
  },
  entryCalories: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  empty: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
  },
  emptyBody: {
    fontSize: 15,
    color: '#999',
    textAlign: 'center',
    lineHeight: 21,
  },
  logButton: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 24,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#208AEF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  logButtonLabel: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
})
