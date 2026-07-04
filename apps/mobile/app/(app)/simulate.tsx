import { useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import { Button } from '@/components/Button'
import { EstimateCard } from '@/components/EstimateCard'
import { Screen } from '@/components/Screen'
import { todayISODate } from '@/lib/nutrition'
import { saveEstimateToDiary, simulateMeal } from '@/lib/pendingLogs'
import {
  addSimulation,
  clearSimHistory,
  removeSimulation,
  useSimHistory,
  type SimEntry,
} from '@/lib/simHistory'
import { useAuth } from '@/providers/auth'

export default function SimulateScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  // The diary passes the selected day so a simulation can be added to a past day.
  const params = useLocalSearchParams<{ date?: string }>()
  const date = params.date ?? todayISODate()

  const history = useSimHistory()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSimulating, setIsSimulating] = useState(false)
  // Which history card is expanded, and which is mid-save to the diary.
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [addingId, setAddingId] = useState<string | null>(null)

  // Estimate the meal and record it to history — nothing is logged to the diary
  // until the user taps "Add to diary" on a card.
  async function handleSimulate() {
    const meal = text.trim()
    if (!meal || isSimulating) return
    setError(null)
    setIsSimulating(true)
    try {
      const estimate = await simulateMeal(meal, user?.id ?? '')
      const entry = addSimulation(meal, estimate)
      setExpandedId(entry.id)
      setText('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not estimate that meal.')
    } finally {
      setIsSimulating(false)
    }
  }

  // Commit a saved simulation's exact numbers to the diary — no re-estimate.
  async function handleAdd(entry: SimEntry) {
    if (!user) {
      setError('You need to be signed in to add to your diary.')
      return
    }
    setError(null)
    setAddingId(entry.id)
    try {
      await saveEstimateToDiary(entry.estimate, user.id, queryClient, date)
      router.back()
    } catch {
      setError('Could not add that to your diary — is the backend running?')
    } finally {
      setAddingId(null)
    }
  }

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          data={history}
          keyExtractor={(entry) => entry.id}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.field}>
                <Text style={styles.label}>Simulate a meal</Text>
                <TextInput
                  style={styles.input}
                  value={text}
                  onChangeText={setText}
                  placeholder="e.g. 3 tbsp egg white, 68g avocado, 2 eggs, 89g cottage cheese"
                  placeholderTextColor="#AAA"
                  multiline
                  autoFocus
                />
                <Text style={styles.hint}>
                  Preview calories and macros without logging. Every simulation is saved below —
                  add any to your diary later.
                </Text>
              </View>

              <Button
                label="Simulate"
                onPress={handleSimulate}
                loading={isSimulating}
                disabled={!text.trim()}
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              {history.length > 0 ? (
                <View style={styles.historyHeader}>
                  <Text style={styles.historyTitle}>Recent simulations</Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      clearSimHistory()
                      setExpandedId(null)
                    }}
                    hitSlop={8}
                  >
                    <Text style={styles.clear}>Clear</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No simulations yet</Text>
              <Text style={styles.emptyBody}>
                Describe a meal and tap “Simulate” to preview its calories and macros. Results
                collect here so you can compare and log them anytime.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <HistoryCard
              entry={item}
              expanded={expandedId === item.id}
              adding={addingId === item.id}
              onToggle={() => setExpandedId((id) => (id === item.id ? null : item.id))}
              onAdd={() => handleAdd(item)}
              onDelete={() => {
                removeSimulation(item.id)
                if (expandedId === item.id) setExpandedId(null)
              }}
            />
          )}
        />
      </KeyboardAvoidingView>
    </Screen>
  )
}

function HistoryCard({
  entry,
  expanded,
  adding,
  onToggle,
  onAdd,
  onDelete,
}: {
  entry: SimEntry
  expanded: boolean
  adding: boolean
  onToggle: () => void
  onAdd: () => void
  onDelete: () => void
}) {
  const { totals } = entry.estimate
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onToggle}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.cardHead}>
        <View style={styles.cardMain}>
          <Text style={styles.cardText} numberOfLines={expanded ? undefined : 2}>
            {entry.text}
          </Text>
          <Text style={styles.cardSummary}>
            {Math.round(totals.calories)} kcal · {Math.round(totals.protein)}P /{' '}
            {Math.round(totals.carbs)}C / {Math.round(totals.fat)}F
          </Text>
        </View>
        <Text style={styles.cardTime}>{timeAgo(entry.createdAt)}</Text>
      </View>

      {expanded ? (
        <View style={styles.cardBody}>
          <EstimateCard estimate={entry.estimate} />
          <Button label="Add to diary" onPress={onAdd} loading={adding} />
          <Button label="Delete" variant="secondary" onPress={onDelete} />
        </View>
      ) : null}
    </Pressable>
  )
}

function timeAgo(ts: number): string {
  const secs = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: 0,
  },
  flex: {
    flex: 1,
  },
  content: {
    gap: 12,
    paddingBottom: 40,
  },
  header: {
    gap: 20,
    marginBottom: 8,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#999',
    letterSpacing: 0.5,
  },
  input: {
    minHeight: 96,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4E4E9',
    padding: 12,
    fontSize: 16,
    color: '#111',
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: 13,
    color: '#999',
    lineHeight: 18,
  },
  error: {
    color: '#d00',
    fontSize: 14,
    lineHeight: 20,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#999',
    letterSpacing: 0.5,
  },
  clear: {
    fontSize: 13,
    color: '#208AEF',
    fontWeight: '600',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E4E4E9',
    backgroundColor: '#F7F7F9',
    padding: 16,
    gap: 12,
  },
  cardPressed: {
    opacity: 0.85,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  cardMain: {
    flex: 1,
    gap: 4,
  },
  cardText: {
    fontSize: 16,
    color: '#111',
  },
  cardSummary: {
    fontSize: 14,
    fontWeight: '600',
    color: '#208AEF',
  },
  cardTime: {
    fontSize: 12,
    color: '#999',
  },
  cardBody: {
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#E4E4E9',
    paddingTop: 12,
  },
  empty: {
    paddingVertical: 32,
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
})
