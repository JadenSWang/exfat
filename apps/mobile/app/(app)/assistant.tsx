import { useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import { Screen } from '@/components/Screen'
import { sendChat, type ChatMessage } from '@/lib/assistant'
import { todayISODate } from '@/lib/nutrition'
import { useAuth } from '@/providers/auth'

const GREETING: ChatMessage = {
  role: 'assistant',
  content:
    "Hi! I'm your nutrition coach. Ask me anything — what to eat to hit your protein, whether a meal fits your goals, or healthy swaps for something you're craving.",
}

const SUGGESTIONS = [
  'What should I eat to hit my protein today?',
  'What can I make from my pantry?',
  'High-protein snack ideas?',
  'Is it okay to eat late at night?',
]

export default function AssistantScreen() {
  const { user } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<ScrollView>(null)

  // Other screens can open the assistant with a question already asked (e.g.
  // the pantry's "Plan meals with AI"). Send it once, on first mount only.
  const { seed } = useLocalSearchParams<{ seed?: string }>()
  const seededRef = useRef(false)
  useEffect(() => {
    if (seed && !seededRef.current) {
      seededRef.current = true
      void send(seed)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed])

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setInput('')
    setError(null)
    const next = [...messages, { role: 'user' as const, content: trimmed }]
    setMessages(next)
    setSending(true)
    try {
      const reply = await sendChat(next, user?.id ?? '', todayISODate())
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The assistant could not respond.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.thread}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.map((message, i) => (
            <Bubble key={i} message={message} />
          ))}

          {messages.length === 1 ? (
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <Pressable
                  key={s}
                  accessibilityRole="button"
                  onPress={() => send(s)}
                  style={({ pressed }) => [styles.suggestion, pressed && styles.dimmed]}
                >
                  <Text style={styles.suggestionText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {sending ? (
            <View style={[styles.bubble, styles.assistantBubble, styles.typing]}>
              <ActivityIndicator size="small" color="#8E5BEF" />
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask your nutrition coach…"
            placeholderTextColor="#AAA"
            multiline
            onSubmitEditing={() => send(input)}
            blurOnSubmit={false}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            disabled={!input.trim() || sending}
            onPress={() => send(input)}
            style={({ pressed }) => [
              styles.sendButton,
              (!input.trim() || sending) && styles.sendDisabled,
              pressed && styles.dimmed,
            ]}
          >
            <Text style={styles.sendIcon}>↑</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  )
}

function Bubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
      <Text style={[styles.bubbleText, isUser && styles.userText]}>{message.content}</Text>
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
  thread: {
    gap: 10,
    paddingVertical: 8,
    paddingBottom: 16,
  },
  bubble: {
    maxWidth: '85%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#208AEF',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#F0EEF9',
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 16,
    lineHeight: 22,
    color: '#111',
  },
  userText: {
    color: '#fff',
  },
  typing: {
    paddingVertical: 14,
  },
  suggestions: {
    gap: 8,
    marginTop: 4,
    alignItems: 'flex-start',
  },
  suggestion: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D9D2F2',
    backgroundColor: '#FAF9FE',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  suggestionText: {
    fontSize: 14,
    color: '#6B4FD8',
    fontWeight: '600',
  },
  error: {
    color: '#d00',
    fontSize: 14,
    lineHeight: 20,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingTop: 8,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: '#EEE',
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E4E4E9',
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 16,
    color: '#111',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#8E5BEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: {
    backgroundColor: '#C9BCEC',
  },
  sendIcon: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 24,
  },
  dimmed: {
    opacity: 0.7,
  },
})
