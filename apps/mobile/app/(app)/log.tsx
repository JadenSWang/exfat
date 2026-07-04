import { useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import { Button } from '@/components/Button'
import { Screen } from '@/components/Screen'
import { parseISODate, todayISODate } from '@/lib/nutrition'
import { submitPendingLog } from '@/lib/pendingLogs'
import { useAuth } from '@/providers/auth'

export default function LogFoodScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  // The diary passes the selected day so food can be logged onto past days.
  const params = useLocalSearchParams<{ date?: string }>()
  const date = params.date ?? todayISODate()
  const isToday = date === todayISODate()

  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Fire and forget: kick off the estimate and go straight back to the diary.
  // The entry appears there when the estimate lands (see lib/pendingLogs.ts).
  function handleLog() {
    if (!text.trim()) return
    if (!user) {
      setError('You need to be signed in to log to your diary.')
      return
    }
    submitPendingLog(text.trim(), user.id, queryClient, date)
    router.back()
  }

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.field}>
            <Text style={styles.label}>
              {isToday
                ? 'What did you eat?'
                : `What did you eat on ${parseISODate(date).toLocaleDateString(undefined, {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                  })}?`}
            </Text>
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
              We estimate calories and macros in the background — your diary updates when it’s
              ready.
            </Text>
          </View>

          <Button label="Log it" onPress={handleLog} disabled={!text.trim()} />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.seams}>
            <Text style={styles.seamsHeading}>More ways to log</Text>
            <Button
              label="Simulate first"
              variant="secondary"
              onPress={() => router.push({ pathname: '/simulate', params: { date } })}
            />
            <Button
              label="Scan barcode"
              variant="secondary"
              onPress={() => router.push({ pathname: '/scan', params: { date } })}
            />
            <DisabledButton label="Search database" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  )
}

function DisabledButton({ label }: { label: string }) {
  return (
    <View style={styles.disabledButton}>
      <Text style={styles.disabledLabel}>{label}</Text>
      <Text style={styles.disabledHint}>Coming soon</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: 0,
  },
  flex: {
    flex: 1,
  },
  content: {
    gap: 20,
    paddingBottom: 40,
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
  seams: {
    gap: 10,
    marginTop: 8,
  },
  seamsHeading: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#999',
    letterSpacing: 0.5,
  },
  disabledButton: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4E4E9',
    backgroundColor: '#F7F7F9',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  disabledLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#AAA',
  },
  disabledHint: {
    fontSize: 12,
    color: '#BBB',
  },
})
