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
import { StatusBar } from 'expo-status-bar'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { DAY_STRIP_LENGTH, DayStrip } from '@/components/DayStrip'
import { EstimateTag } from '@/components/EstimateTag'
import { LogFab } from '@/components/LogFab'
import { MacroBar } from '@/components/MacroBar'
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
    <View style={styles.background}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <View style={styles.headerRow}>
            <Link href="/settings" asChild>
              <Pressable accessibilityRole="button" hitSlop={8}>
                <Text style={styles.settingsLink}>Settings</Text>
              </Pressable>
            </Link>
          </View>

          <DayStrip selected={date} onSelect={setDate} />

          {/* Each day is its own full-width page, so a swipe slides the next
              day's screen in rather than swapping content in place. */}
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

          <LogFab date={date} />
        </View>
      </SafeAreaView>
    </View>
  )
}

// TEMP preview seed — remove before commit.
const PREVIEW_ITEMS = [
  { id: 'p1', name: 'Scrambled eggs', meal: 'breakfast', quantity: 2, unit: 'egg', calories: 180, protein: 12, carbs: 2, fat: 13, source: 'manual' },
  { id: 'p2', name: 'Greek yogurt', meal: 'breakfast', quantity: 1, unit: 'cup', calories: 150, protein: 17, carbs: 9, fat: 4, source: 'barcode' },
  { id: 'p3', name: 'Grilled chicken breast', meal: 'lunch', quantity: 6, unit: 'oz', calories: 280, protein: 52, carbs: 0, fat: 6, source: 'ai_estimate' },
  { id: 'p4', name: 'Brown rice', meal: 'lunch', quantity: 1, unit: 'cup', calories: 216, protein: 5, carbs: 45, fat: 2, source: 'ai_estimate' },
  { id: 'p5', name: 'Salmon fillet', meal: 'dinner', quantity: 5, unit: 'oz', calories: 300, protein: 40, carbs: 0, fat: 15, source: 'ai_estimate' },
  { id: 'p6', name: 'Almonds', meal: 'snack', quantity: 1, unit: 'oz', calories: 164, protein: 6, carbs: 6, fat: 14, source: 'manual' },
] as DiaryItem[]

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
  const { goals, items: fetchedItems } = useDiaryDay(date)
  const items = date === today && fetchedItems.length === 0 ? PREVIEW_ITEMS : fetchedItems
  const { height: windowHeight } = useWindowDimensions()
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
      {/* The photo lives inside the scroll content (not pinned), so it scrolls
          up together with the summary and food cards. Its Oura-style gradient
          overlay keeps the summary legible where it sits on the photo. */}
      <Image
        source={require('../../assets/images/fuji-tea.webp')}
        resizeMode="cover"
        style={[styles.pageBackdrop, { height: windowHeight }]}
      />
      <Image
        source={require('../../assets/images/scrim-gradient.png')}
        resizeMode="stretch"
        style={[styles.pageBackdrop, { height: windowHeight }]}
      />

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
          {/* Protein is a focus metric alongside calories: it shares the bright
              calorie-ring blue and gets the primary (larger, thicker) treatment. */}
          <MacroBar
            label="Protein"
            consumed={consumed.protein}
            goal={goals.protein}
            color="#4AA3FF"
            emphasis="primary"
          />
          {/* Carbs and fat still matter, but sit a notch below in the hierarchy. */}
          <View style={styles.macroDivider} />
          <View style={styles.macrosSecondary}>
            <MacroBar
              label="Carbs"
              consumed={consumed.carbs}
              goal={goals.carbs}
              color="#34C759"
              emphasis="secondary"
            />
            <MacroBar
              label="Fat"
              consumed={consumed.fat}
              goal={goals.fat}
              color="#FF9500"
              emphasis="secondary"
            />
          </View>
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
            Tap the “+” button and describe what you ate — we’ll estimate the calories and macros.
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
  if (items.length === 0) return null
  const total = sumMacros(items)

  return (
    <View style={styles.mealSection}>
      <View style={styles.mealHeader}>
        <Text style={styles.mealTitle}>{MEAL_LABELS[meal]}</Text>
        <Text style={styles.mealCalories}>{Math.round(total.calories)} kcal</Text>
      </View>
      {items.map((item) => (
        <EntryCard key={item.id} item={item} />
      ))}
    </View>
  )
}

/** One logged food, as a solid card with its full macro breakdown. */
function EntryCard({ item }: { item: DiaryItem }) {
  return (
    <View style={styles.entryCard}>
      <View style={styles.entryTop}>
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
        <View style={styles.entryCalorieBlock}>
          <Text style={styles.entryCalories}>{Math.round(item.calories)}</Text>
          <Text style={styles.entryCaloriesUnit}>kcal</Text>
        </View>
        <Link
          href={{
            pathname: '/edit',
            params: {
              id: item.id,
              name: item.name,
              quantity: String(item.quantity),
              unit: item.unit,
              calories: String(item.calories),
              protein: String(item.protein),
              carbs: String(item.carbs),
              fat: String(item.fat),
            },
          }}
          asChild
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Edit ${item.name}`}
            hitSlop={8}
            style={styles.entryEdit}
          >
            <Text style={styles.entryEditLabel}>✎</Text>
          </Pressable>
        </Link>
      </View>

      {/* Full macro breakdown; protein leads and is emphasized per the app focus. */}
      <View style={styles.entryMacros}>
        <Text style={styles.macroProtein}>{Math.round(item.protein)}g protein</Text>
        <Text style={styles.macroSep}>·</Text>
        <Text style={styles.macroMinor}>{Math.round(item.carbs)}g carbs</Text>
        <Text style={styles.macroSep}>·</Text>
        <Text style={styles.macroMinor}>{Math.round(item.fat)}g fat</Text>
      </View>
    </View>
  )
}

function formatQuantity(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(1)
}

// The diary sits over the tea-field photo, so the palette flips to light text on
// dark translucent "glass" panels — the Oura-style ambient-background look. The
// panels are dark (not a light frost) so white text keeps strong contrast even
// where the photo behind them is bright.
const GLASS = 'rgba(12, 18, 28, 0.52)'
const GLASS_BORDER = 'rgba(255, 255, 255, 0.14)'
// Food entries are solid (opaque) cards on the scrolling background — not glass.
const CARD = '#141C28'
const CARD_BORDER = 'rgba(255, 255, 255, 0.07)'

const styles = StyleSheet.create({
  background: {
    flex: 1,
    // Solid base: the photo now lives inside the scroll content, so below it (and
    // behind the fixed header/day strip) this dark tint shows through.
    backgroundColor: '#0B1E2D',
  },
  pageBackdrop: {
    // Photo + gradient pinned to the top of the scroll content (height set inline
    // from the window height), so they scroll up together with the cards. The
    // negative insets bleed past the page's 24px padding to the screen edges.
    position: 'absolute',
    top: 0,
    left: -24,
    right: -24,
  },
  safe: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    // The safe-area inset already clears the status bar; keep only a little
    // breathing room above the header instead of the default 24.
    paddingTop: 8,
    gap: 16,
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
    color: '#EAF3FF',
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  summaryCard: {
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
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
    color: '#fff',
  },
  calorieUnit: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  track: {
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: '#4AA3FF',
  },
  calorieRemaining: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  macros: {
    gap: 14,
    marginTop: 4,
  },
  macroDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginTop: 2,
  },
  macrosSecondary: {
    gap: 10,
  },
  meals: {
    gap: 22,
  },
  pendingList: {
    gap: 10,
  },
  pendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD,
    padding: 14,
  },
  pendingCardError: {
    borderColor: 'rgba(255, 120, 120, 0.55)',
    backgroundColor: 'rgba(120, 30, 30, 0.35)',
  },
  pendingStatus: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.65)',
  },
  pendingError: {
    fontSize: 13,
    color: '#FFB4B4',
    lineHeight: 18,
  },
  pendingDismiss: {
    fontSize: 13,
    color: '#FF9A9A',
    fontWeight: '600',
  },
  mealSection: {
    gap: 10,
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
    color: 'rgba(255, 255, 255, 0.6)',
    letterSpacing: 0.5,
  },
  mealCalories: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '600',
  },
  entryCard: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  entryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  entryMain: {
    flex: 1,
    gap: 4,
  },
  entryName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  entryMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  entryQty: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  entryScan: {
    fontSize: 13,
    color: '#4AA3FF',
    fontWeight: '600',
  },
  entryCalorieBlock: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  entryCalories: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  entryCaloriesUnit: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  entryEdit: {
    paddingLeft: 2,
  },
  entryEditLabel: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '600',
  },
  entryMacros: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    // Separate the macro row from the name/calories with a hairline.
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    paddingTop: 10,
  },
  macroProtein: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4AA3FF',
  },
  macroSep: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.28)',
  },
  macroMinor: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  empty: {
    // Its own glass panel so the empty-state copy stays legible over the photo.
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 16,
    paddingVertical: 40,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  emptyBody: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.72)',
    textAlign: 'center',
    lineHeight: 21,
  },
})
