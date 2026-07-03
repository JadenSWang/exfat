import {
  groupByMeal,
  macroCaloriePercentages,
  remainingMacros,
  sumMacros,
  type DiaryItem,
  type MealType,
} from '@workout/core'
import { deleteDiaryEntry, getDiaryEntries, getNutritionGoals } from '@workout/supabase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'

import { DAY_STRIP_LENGTH, DayStrip } from '@/components/DayStrip'
import { EstimateTag } from '@/components/EstimateTag'
import { MacroBar } from '@/components/MacroBar'
import { Screen } from '@/components/Screen'
import {
  DEFAULT_GOALS,
  MEAL_LABELS,
  MEAL_ORDER,
  rowToDiaryItem,
  shiftISODate,
  todayISODate,
} from '@/lib/nutrition'
import { dismissPendingLog, usePendingLogs, type PendingLog } from '@/lib/pendingLogs'
import { supabase } from '@/lib/supabase'

/** Load goals + entries for a given day. Resilient: any failure falls back to defaults. */
function useDiaryDay(date: string) {
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
  const today = todayISODate()
  const [date, setDate] = useState(today)
  const pendingLogs = usePendingLogs()

  // The trailing window of days the strip and pager share, oldest → newest
  // (today is the last page); both index into this identically.
  const days = useMemo(
    () =>
      Array.from({ length: DAY_STRIP_LENGTH }, (_, i) =>
        shiftISODate(today, i - (DAY_STRIP_LENGTH - 1)),
      ),
    [today],
  )
  const selectedIndex = Math.max(days.indexOf(date), 0)

  const pagerRef = useRef<FlatList<string>>(null)
  const [pagerWidth, setPagerWidth] = useState(0)
  // Which page the pager is currently showing. Tracking it lets the follow
  // effect skip pages the pager already sits on (a swipe it just made), so the
  // pager's own motion never bounces the selection back — the source of the
  // flip-flopping.
  const pagerIndex = useRef(selectedIndex)
  // Set while the user is physically dragging the pager, so only a real swipe
  // commits a day — a programmatic follow-scroll (even if interrupted) never does.
  const pagerDragging = useRef(false)

  // Follow selection changes that came from outside the pager (a DayStrip tap or
  // swipe) by sliding to that day's page. No-op when we're already there.
  useEffect(() => {
    if (pagerWidth === 0 || pagerIndex.current === selectedIndex) return
    pagerIndex.current = selectedIndex
    pagerRef.current?.scrollToIndex({ index: selectedIndex, animated: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex, pagerWidth])

  // Selection follows whichever day page a *swipe* settles on. Programmatic
  // follow-scrolls are ignored here, so they can't loop with the strip.
  const onPagerSettle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pagerWidth === 0 || !pagerDragging.current) return
    pagerDragging.current = false
    const index = Math.min(
      Math.max(Math.round(e.nativeEvent.contentOffset.x / pagerWidth), 0),
      days.length - 1,
    )
    pagerIndex.current = index
    if (days[index] !== date) setDate(days[index])
  }

  return (
    <Screen style={styles.screen}>
      <View style={styles.headerRow}>
        <Link href="/settings" asChild>
          <Pressable accessibilityRole="button" hitSlop={8}>
            <Text style={styles.settingsLink}>Settings</Text>
          </Pressable>
        </Link>
      </View>

      <DayStrip selected={date} onSelect={setDate} />

      {/* Each day is its own full-width page, so a swipe slides the next day's
          screen in rather than swapping content in place. */}
      <View style={styles.pager} onLayout={(e) => setPagerWidth(e.nativeEvent.layout.width)}>
        {pagerWidth > 0 ? (
          <FlatList
            ref={pagerRef}
            data={days}
            keyExtractor={(d) => d}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={selectedIndex}
            getItemLayout={(_, index) => ({
              length: pagerWidth,
              offset: pagerWidth * index,
              index,
            })}
            onScrollBeginDrag={() => {
              pagerDragging.current = true
            }}
            onMomentumScrollEnd={onPagerSettle}
            renderItem={({ item }) => (
              <DayPage date={item} today={today} width={pagerWidth} pendingLogs={pendingLogs} />
            )}
          />
        ) : null}
      </View>

      <Link href={{ pathname: '/log', params: { date } }} asChild>
        <Pressable accessibilityRole="button" style={styles.logButton}>
          <Text style={styles.logButtonLabel}>+ Log food</Text>
        </Pressable>
      </Link>
    </Screen>
  )
}

/** One swipeable day: its own scroll view of that day's summary and meals. */
function DayPage({
  date,
  today,
  width,
  pendingLogs,
}: {
  date: string
  today: string
  width: number
  pendingLogs: PendingLog[]
}) {
  const { goals, items } = useDiaryDay(date)
  const isToday = date === today
  // In-flight logs render on the day they'll land on, not just today.
  const dayPendingLogs = pendingLogs.filter((log) => log.entryDate === date)

  const consumed = sumMacros(items)
  const remaining = remainingMacros(goals, consumed)
  const macroSplit = macroCaloriePercentages(consumed)
  const caloriePct = goals.calories > 0 ? Math.min(consumed.calories / goals.calories, 1) : 0
  const byMeal = groupByMeal(items)
  const hasEntries = items.length > 0

  return (
    <ScrollView
      style={{ width }}
      contentContainerStyle={styles.pageContent}
      showsVerticalScrollIndicator={false}
    >
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

      {dayPendingLogs.length > 0 ? (
        <View style={styles.pendingList}>
          {dayPendingLogs.map((log) => (
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
          <Text style={styles.emptyTitle}>
            {isToday ? 'Nothing logged yet' : 'Nothing logged this day'}
          </Text>
          <Text style={styles.emptyBody}>
            Tap “+ Log food” and describe what you ate — we’ll estimate the calories and macros.
          </Text>
        </View>
      )}
    </ScrollView>
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
  const queryClient = useQueryClient()
  const deleteMutation = useMutation({
    mutationFn: (entryId: string) => deleteDiaryEntry(supabase, entryId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['diary'] }),
    onError: () => Alert.alert('Couldn’t delete', 'Something went wrong. Please try again.'),
  })

  if (items.length === 0) return null
  const total = sumMacros(items)

  const confirmDelete = (item: DiaryItem) => {
    Alert.alert('Delete this entry?', item.name, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(item.id) },
    ])
  }

  return (
    <View style={styles.mealSection}>
      <View style={styles.mealHeader}>
        <Text style={styles.mealTitle}>{MEAL_LABELS[meal]}</Text>
        <Text style={styles.mealCalories}>{Math.round(total.calories)} kcal</Text>
      </View>
      {items.map((item) => (
        <View key={item.id} style={styles.entryRow}>
          <View style={styles.entryMain}>
            <Text style={styles.entryName} numberOfLines={1}>
              {item.name}
            </Text>
            <View style={styles.entryMeta}>
              <Text style={styles.entryQty}>
                {formatQuantity(item.quantity)} {item.unit}
              </Text>
              {item.source === 'ai_estimate' ? (
                <>
                  <EstimateTag />
                  <Link
                    href={{
                      pathname: '/scan',
                      params: {
                        refineEntryId: item.id,
                        refineQty: String(item.quantity),
                        refineUnit: item.unit,
                      },
                    }}
                    asChild
                  >
                    <Pressable accessibilityRole="button" hitSlop={8}>
                      <Text style={styles.entryScan}>Scan</Text>
                    </Pressable>
                  </Link>
                </>
              ) : null}
            </View>
          </View>
          <View style={styles.entryNumbers}>
            <Text style={styles.entryCalories}>{Math.round(item.calories)}</Text>
            <Text style={styles.entryProtein}>{Math.round(item.protein)}g protein</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Delete ${item.name}`}
            onPress={() => confirmDelete(item)}
            hitSlop={8}
            style={styles.entryDelete}
          >
            <Text style={styles.entryDeleteLabel}>✕</Text>
          </Pressable>
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
    // The safe-area inset already clears the status bar; keep only a little
    // breathing room above the header instead of the default 24.
    paddingTop: 8,
    paddingBottom: 0,
  },
  pager: {
    // Full-bleed so each day page slides edge-to-edge; the page's own content
    // keeps the 24px inset the rest of the screen uses.
    flex: 1,
    marginHorizontal: -24,
  },
  pageContent: {
    gap: 20,
    paddingHorizontal: 24,
    paddingBottom: 96,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
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
  entryScan: {
    fontSize: 13,
    color: '#208AEF',
    fontWeight: '600',
  },
  entryNumbers: {
    alignItems: 'flex-end',
    gap: 2,
  },
  entryCalories: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  entryProtein: {
    fontSize: 12,
    color: '#999',
  },
  entryDelete: {
    paddingLeft: 4,
  },
  entryDeleteLabel: {
    fontSize: 15,
    color: '#C7C7CC',
    fontWeight: '600',
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
