import { useRouter, type Href } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'

interface FabAction {
  key: string
  label: string
  icon: string
  color: string
  href: Href
}

const FAB_SIZE = 60
const ACTION_SIZE = 52
const ACTION_GAP = 14
// Vertical inset that centers the smaller action circle against the FAB.
const ACTION_INSET = (FAB_SIZE - ACTION_SIZE) / 2
// Distance from the FAB baseline up to the first action, then between actions.
const FIRST_OFFSET = FAB_SIZE + 10
const STEP = ACTION_SIZE + ACTION_GAP

/**
 * A circular floating action button that fans out a vertical stack of circular
 * quick actions when tapped. Replaces the old full-width "Log food" bar: the
 * primary action (Log food) sits closest to the thumb, with Scan, Simulate, and
 * the AI helper stacked above it. Tapping the scrim or the FAB collapses it.
 */
export function LogFab({ date }: { date: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const progress = useRef(new Animated.Value(0)).current

  // Ordered bottom → top, so Log food (index 0) ends up nearest the FAB.
  const actions: FabAction[] = [
    {
      key: 'log',
      label: 'Log food',
      icon: '🍽️',
      color: '#208AEF',
      href: { pathname: '/log', params: { date } },
    },
    {
      key: 'scan',
      label: 'Scan barcode',
      icon: '📷',
      color: '#34C759',
      href: { pathname: '/scan', params: { date } },
    },
    {
      key: 'simulate',
      label: 'Simulate',
      icon: '📊',
      color: '#FF9500',
      href: { pathname: '/simulate', params: { date } },
    },
    {
      key: 'pantry',
      label: 'My Pantry',
      icon: '🧺',
      color: '#5AC8B0',
      href: { pathname: '/pantry' },
    },
    {
      key: 'ai',
      label: 'AI helper',
      icon: '✨',
      color: '#8E5BEF',
      href: { pathname: '/assistant' },
    },
  ]

  useEffect(() => {
    Animated.spring(progress, {
      toValue: open ? 1 : 0,
      useNativeDriver: true,
      friction: 7,
      tension: 90,
    }).start()
  }, [open, progress])

  const onAction = (action: FabAction) => {
    setOpen(false)
    router.push(action.href)
  }

  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] })
  const scrimOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.28] })
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] })

  // The zone must be tall enough to hold the fully-expanded stack: on Android a
  // child rendered past its parent's bounds can't be tapped, so a short zone
  // would leave the raised action buttons dead.
  const zoneHeight = ACTION_INSET + FIRST_OFFSET + (actions.length - 1) * STEP + ACTION_SIZE

  return (
    <>
      {/* Dim + tap-to-close backdrop. Sits above the diary, below the FAB. */}
      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        style={[styles.scrim, { opacity: scrimOpacity }]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => setOpen(false)}
          accessibilityLabel="Close menu"
        />
      </Animated.View>

      <View style={[styles.zone, { height: zoneHeight }]} pointerEvents="box-none">
        {actions.map((action, i) => {
          const translateY = progress.interpolate({
            inputRange: [0, 1],
            outputRange: [0, -(FIRST_OFFSET + i * STEP)],
          })
          return (
            <Animated.View
              key={action.key}
              pointerEvents={open ? 'auto' : 'none'}
              style={[styles.actionRow, { opacity: progress, transform: [{ translateY }] }]}
            >
              {/* The button is centered in a fixed FAB-width box so its position
                  never depends on the label width; the label floats absolutely to
                  its left. Scale each around its own center so the button never
                  drifts horizontally as it pops in. */}
              <Animated.View
                pointerEvents="none"
                style={[styles.labelWrap, { transform: [{ scale }] }]}
              >
                <View style={styles.labelPill}>
                  <Text style={styles.labelText} numberOfLines={1}>
                    {action.label}
                  </Text>
                </View>
              </Animated.View>
              <Animated.View style={[styles.actionButtonWrap, { transform: [{ scale }] }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  onPress={() => onAction(action)}
                  style={({ pressed }) => [
                    styles.actionButton,
                    { backgroundColor: action.color },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.actionIcon}>{action.icon}</Text>
                </Pressable>
              </Animated.View>
            </Animated.View>
          )
        })}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={open ? 'Close log menu' : 'Open log menu'}
          onPress={() => setOpen((v) => !v)}
          style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
        >
          <Animated.Text style={[styles.fabIcon, { transform: [{ rotate }] }]}>+</Animated.Text>
        </Pressable>
      </View>
    </>
  )
}

const shadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.18,
  shadowRadius: 10,
  elevation: 5,
} as const

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: -100,
    left: -40,
    right: -40,
    bottom: -40,
    backgroundColor: '#000',
  },
  zone: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: '#208AEF',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  fabIcon: {
    color: '#fff',
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '300',
  },
  actionRow: {
    // A fixed FAB-width box, right-anchored under the FAB. The single button is
    // centered in it, so its x is identical for every action.
    position: 'absolute',
    right: 0,
    bottom: ACTION_INSET,
    width: FAB_SIZE,
    height: ACTION_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButton: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    borderRadius: ACTION_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  actionIcon: {
    fontSize: 22,
  },
  labelWrap: {
    // Floats to the left of the button, vertically centered. A fixed width (with
    // the pill right-aligned inside) keeps the label on one line — a shrink-to-fit
    // box would be clamped by the narrow FAB-width row and wrap the text.
    position: 'absolute',
    right: FAB_SIZE + 8,
    top: 0,
    bottom: 0,
    width: 220,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  labelPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#fff',
    ...shadow,
  },
  labelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
  },
  pressed: {
    opacity: 0.85,
  },
})
