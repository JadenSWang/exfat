import { useEffect, useRef, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import Svg, { Circle } from 'react-native-svg'

import { parseISODate, shiftISODate, todayISODate } from '@/lib/nutrition'

/** How many trailing days the strip shows, including today. */
export const DAY_STRIP_LENGTH = 14

const RING_SIZE = 64
const RING_STROKE = 4
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

const MONTH_DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

/** "Today", "Yesterday", or a short date like "Jun 30". */
function dayLabel(date: string, today: string): string {
  if (date === today) return 'Today'
  if (date === shiftISODate(today, -1)) return 'Yesterday'
  return MONTH_DAY.format(parseISODate(date))
}

/**
 * Oura-style day carousel: the selected day sits centered with its neighbors
 * half-peeking from the screen edges; swiping snaps day-by-day and selection
 * follows the centered day. Each day is a ring filled by that day's calories
 * vs. goal.
 */
export function DayStrip({
  selected,
  onSelect,
  calorieTotals,
  calorieGoal,
}: {
  selected: string
  onSelect: (date: string) => void
  /** Map of `YYYY-MM-DD` → calories consumed that day. */
  calorieTotals: Record<string, number>
  calorieGoal: number
}) {
  const today = todayISODate()
  const days = Array.from({ length: DAY_STRIP_LENGTH }, (_, i) =>
    shiftISODate(today, i - (DAY_STRIP_LENGTH - 1)),
  )
  const scrollRef = useRef<ScrollView>(null)
  const [width, setWidth] = useState(0)

  // Slot geometry: each day occupies half the strip's width, so with the
  // selected day centered, its neighbors' centers land exactly on the screen
  // edges (half showing) — matching Oura's carousel.
  const interval = width / 2
  const sidePadding = width / 4

  const selectedIndex = Math.max(days.indexOf(selected), 0)

  // Center the selected day once we know our width (initial mount / remount).
  useEffect(() => {
    if (width === 0) return
    scrollRef.current?.scrollTo({ x: selectedIndex * interval, animated: false })
    // Only re-run on layout; scrolling to follow selection is handled by taps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width])

  // Selection tracks whichever day is nearest the center as the user swipes.
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (interval === 0) return
    const index = Math.round(event.nativeEvent.contentOffset.x / interval)
    const date = days[Math.min(Math.max(index, 0), days.length - 1)]
    if (date !== selected) onSelect(date)
  }

  const selectDay = (index: number) => {
    onSelect(days[index])
    scrollRef.current?.scrollTo({ x: index * interval, animated: true })
  }

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.strip}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      contentContainerStyle={{ paddingHorizontal: sidePadding }}
      snapToInterval={interval || undefined}
      decelerationRate="fast"
      onScroll={handleScroll}
      scrollEventThrottle={32}
    >
      {width > 0
        ? days.map((date, index) => (
            <DayRing
              key={date}
              date={date}
              label={dayLabel(date, today)}
              slotWidth={interval}
              isSelected={date === selected}
              isToday={date === today}
              progress={
                calorieGoal > 0 ? Math.min((calorieTotals[date] ?? 0) / calorieGoal, 1) : 0
              }
              onPress={() => selectDay(index)}
            />
          ))
        : null}
    </ScrollView>
  )
}

function DayRing({
  date,
  label,
  slotWidth,
  isSelected,
  isToday,
  progress,
  onPress,
}: {
  date: string
  label: string
  slotWidth: number
  isSelected: boolean
  isToday: boolean
  progress: number
  onPress: () => void
}) {
  const day = parseISODate(date)
  const ringColor = progress > 0 ? '#208AEF' : 'transparent'

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${date}`}
      accessibilityState={{ selected: isSelected }}
      onPress={onPress}
      style={[styles.day, { width: slotWidth }]}
    >
      <Text style={[styles.weekday, isSelected && styles.weekdaySelected]} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.ringWrap}>
        <Svg width={RING_SIZE} height={RING_SIZE}>
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            stroke="#E4E4E9"
            strokeWidth={RING_STROKE}
            fill={isSelected ? '#208AEF' : 'transparent'}
          />
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            stroke={ringColor}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            fill="transparent"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
          />
        </Svg>
        <Text
          style={[
            styles.dayNumber,
            isToday && !isSelected && styles.dayNumberToday,
            isSelected && styles.dayNumberSelected,
          ]}
        >
          {day.getDate()}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  strip: {
    // Bleed past the Screen's 24px padding so edge days peek from the true
    // screen edges.
    marginHorizontal: -24,
  },
  day: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  weekday: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
  },
  weekdaySelected: {
    color: '#208AEF',
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumber: {
    position: 'absolute',
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
  },
  dayNumberToday: {
    color: '#208AEF',
  },
  dayNumberSelected: {
    color: '#fff',
  },
})
