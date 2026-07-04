import { useEffect, useRef, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
// gesture-handler's ScrollView participates in the gesture arena, so swipes
// that land on the strip are claimed here rather than by the page-wide swipe.
import { ScrollView } from 'react-native-gesture-handler'

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
  const clampIndex = (i: number) => Math.min(Math.max(i, 0), days.length - 1)
  const selectedIndex = Math.max(days.indexOf(selected), 0)

  const scrollRef = useRef<ScrollView>(null)
  const [width, setWidth] = useState(0)
  // The day currently centered in the strip. Tracking it lets the follow effect
  // skip selections the strip already shows, and lets a scroll commit only once
  // it settles — so following the pager never bounces the selection back.
  const centeredIndex = useRef(selectedIndex)
  // Highlighted day, updated live as the strip scrolls; the committed selection
  // is lifted up only when the scroll settles, so mid-scroll frames never do.
  const [liveIndex, setLiveIndex] = useState(selectedIndex)
  // Set while the user is physically dragging the strip, so only a real drag
  // commits a day — a programmatic follow-scroll (even if interrupted) never does.
  const dragging = useRef(false)

  // Slot geometry: each day occupies a third of the strip's width, so with the
  // selected day centered, its neighbors sit well inside the screen edges
  // (fully legible) rather than half-clipped at the very edges.
  const interval = width / 3
  const sidePadding = (width - interval) / 2

  // Center the selected day once we know our width (initial mount / remount).
  useEffect(() => {
    if (width === 0) return
    centeredIndex.current = selectedIndex
    setLiveIndex(selectedIndex)
    scrollRef.current?.scrollTo({ x: selectedIndex * interval, animated: false })
    // Only re-run on layout; scrolling to follow selection is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width])

  // Follow selection changes that came from outside the strip (e.g. the day
  // pager) by animating that day back to center. Skip days already centered,
  // which the strip itself just moved to.
  useEffect(() => {
    if (width === 0 || centeredIndex.current === selectedIndex) return
    centeredIndex.current = selectedIndex
    setLiveIndex(selectedIndex)
    scrollRef.current?.scrollTo({ x: selectedIndex * interval, animated: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex])

  // Live highlight tracks the nearest day as the user drags; the selection isn't
  // committed until the scroll settles, so a follow-animation's passing frames
  // stay purely cosmetic.
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (interval === 0) return
    const index = clampIndex(Math.round(event.nativeEvent.contentOffset.x / interval))
    if (index !== liveIndex) setLiveIndex(index)
  }

  // Commit the centered day once a *drag* settles. Programmatic follow-scrolls
  // are ignored here, so they can't loop with the pager.
  const handleSettle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (interval === 0 || !dragging.current) return
    dragging.current = false
    const index = clampIndex(Math.round(event.nativeEvent.contentOffset.x / interval))
    centeredIndex.current = index
    setLiveIndex(index)
    if (days[index] !== selected) onSelect(days[index])
  }

  const selectDay = (index: number) => {
    centeredIndex.current = index
    setLiveIndex(index)
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
      onScrollBeginDrag={() => {
        dragging.current = true
      }}
      onScroll={handleScroll}
      onMomentumScrollEnd={handleSettle}
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
                style={[styles.label, index === liveIndex && styles.labelSelected]}
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
    // react-native-web's ScrollView base style is flexGrow:1/flexShrink:1, so a
    // horizontal strip would otherwise expand vertically and split the leftover
    // space with the flex:1 pager — leaving a screen-tall gap above the labels.
    // Pin it to its content height instead.
    flexGrow: 0,
    flexShrink: 0,
  },
  day: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.6)',
    // Box around the day of which only the bottom edge is visible: the
    // underline hugs the word, a little wider via the side padding.
    paddingHorizontal: 10,
    paddingBottom: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    // The strip floats directly on the photo (no glass behind it), so a soft
    // shadow keeps the day labels legible against the bright sky.
    textShadowColor: 'rgba(0, 0, 0, 0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  labelSelected: {
    fontWeight: '700',
    color: '#fff',
    borderBottomColor: '#fff',
  },
})
