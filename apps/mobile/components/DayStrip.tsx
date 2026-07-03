import { useEffect, useRef, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'

import { parseISODate, shiftISODate, todayISODate } from '@/lib/nutrition'

/** How many trailing days the strip shows, including today. */
export const DAY_STRIP_LENGTH = 14

const MONTH_DAY = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

/** "Today", "Yesterday", or a short date like "Wed, Jul 1". */
function dayLabel(date: string, today: string): string {
  if (date === today) return 'Today'
  if (date === shiftISODate(today, -1)) return 'Yesterday'
  return MONTH_DAY.format(parseISODate(date))
}

/**
 * Oura-style day carousel of plain word labels: the selected day sits
 * centered with its neighbors peeking from the screen edges; swiping snaps
 * day-by-day and selection follows the centered day.
 */
export function DayStrip({
  selected,
  onSelect,
}: {
  selected: string
  onSelect: (date: string) => void
}) {
  const today = todayISODate()
  const days = Array.from({ length: DAY_STRIP_LENGTH }, (_, i) =>
    shiftISODate(today, i - (DAY_STRIP_LENGTH - 1)),
  )
  const scrollRef = useRef<ScrollView>(null)
  const [width, setWidth] = useState(0)

  // Slot geometry: each day occupies half the strip's width, so with the
  // selected day centered, its neighbors' centers land on the screen edges.
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
            <Pressable
              key={date}
              accessibilityRole="button"
              accessibilityLabel={`View ${date}`}
              accessibilityState={{ selected: date === selected }}
              onPress={() => selectDay(index)}
              style={[styles.day, { width: interval }]}
            >
              <Text
                style={[styles.label, date === selected && styles.labelSelected]}
                numberOfLines={1}
              >
                {dayLabel(date, today)}
              </Text>
            </Pressable>
          ))
        : null}
    </ScrollView>
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
    justifyContent: 'center',
    paddingVertical: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#BBB',
    // Box around the day of which only the bottom edge is visible: the
    // underline hugs the word, a little wider via the side padding.
    paddingHorizontal: 10,
    paddingBottom: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  labelSelected: {
    fontWeight: '700',
    color: '#111',
    borderBottomColor: '#111',
  },
})
