import * as AppleAuthentication from 'expo-apple-authentication'
import * as Crypto from 'expo-crypto'
import { signInWithApple } from '@workout/supabase'
import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { Screen } from '@/components/Screen'
import { supabase } from '@/lib/supabase'

export default function SignInScreen() {
  const [isAppleAvailable, setIsAppleAvailable] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    AppleAuthentication.isAvailableAsync().then((available) => {
      if (mounted) setIsAppleAvailable(available)
    })
    return () => {
      mounted = false
    }
  }, [])

  async function handleSignIn() {
    setError(null)
    try {
      // 1. Generate a raw, single-use nonce.
      const rawNonce = Crypto.randomUUID()
      // 2. Apple receives the SHA-256 *hex* of the raw nonce.
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
      )

      // 3. Prompt the native Apple sign-in sheet.
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      })

      if (!credential.identityToken) {
        setError('Apple did not return an identity token.')
        return
      }

      // 4. Supabase receives the *raw* nonce to verify against the token.
      const { error: signInError } = await signInWithApple(supabase, {
        identityToken: credential.identityToken,
        nonce: rawNonce,
      })

      if (signInError) {
        setError(signInError.message)
      }
    } catch (e) {
      // The user dismissing the Apple sheet is expected, not an error.
      if (isCanceled(e)) return
      setError(e instanceof Error ? e.message : 'Sign in failed. Please try again.')
    }
  }

  return (
    <Screen style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Workout</Text>
        <Text style={styles.subtitle}>Track your lifts. No ads. Ever.</Text>
      </View>

      <View style={styles.footer}>
        {isAppleAvailable ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={12}
            style={styles.appleButton}
            onPress={handleSignIn}
          />
        ) : (
          <Text style={styles.unavailable}>Apple sign-in is not available on this device.</Text>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </Screen>
  )
}

function isCanceled(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && e.code === 'ERR_REQUEST_CANCELED'
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'space-between',
    paddingVertical: 64,
  },
  header: {
    flex: 1,
    justifyContent: 'center',
    gap: 8,
  },
  title: {
    fontSize: 40,
    fontWeight: '800',
    color: '#111',
  },
  subtitle: {
    fontSize: 17,
    color: '#666',
  },
  footer: {
    gap: 16,
  },
  appleButton: {
    height: 50,
    width: '100%',
  },
  unavailable: {
    color: '#666',
    textAlign: 'center',
  },
  error: {
    color: '#d00',
    textAlign: 'center',
  },
})
