import type { ReactNode } from 'react'
import { StyleSheet, View, type ViewStyle } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

/** A simple safe-area padded screen container with sensible defaults. */
export function Screen({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.container, style]}>{children}</View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 24,
    gap: 16,
  },
})
