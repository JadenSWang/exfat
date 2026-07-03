import { StyleSheet, Text, View } from 'react-native'

/** A small pill marking a value as an AI estimate rather than an exact figure. */
export function EstimateTag({ label = 'estimate' }: { label?: string }) {
  return (
    <View style={styles.tag}>
      <Text style={styles.text}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    backgroundColor: '#FDF0D5',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B26A00',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
})
