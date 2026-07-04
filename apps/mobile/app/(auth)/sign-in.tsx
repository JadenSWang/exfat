import * as AppleAuthentication from 'expo-apple-authentication'
import * as Crypto from 'expo-crypto'
import { StatusBar } from 'expo-status-bar'
import { signInWithApple } from '@workout/supabase'
import { useEffect, useState } from 'react'
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/auth'

export default function SignInScreen() {
  const { devSignIn } = useAuth()
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
    <ImageBackground
      source={require('../../assets/images/fuji-tea.webp')}
      resizeMode="cover"
      style={styles.background}
    >
      {/* Darken the photo so the light title and footer stay legible over the
          bright sky and tea fields. */}
      <View style={styles.scrim} />
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>exFat</Text>
            <Text style={styles.subtitle}>Track what you eat. No ads. Ever.</Text>
          </View>

          <View style={styles.footer}>
            {isAppleAvailable ? (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={12}
                style={styles.appleButton}
                onPress={handleSignIn}
              />
            ) : (
              <Text style={styles.unavailable}>
                Apple sign-in is not available on this device.
              </Text>
            )}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {__DEV__ ? (
              <Pressable onPress={devSignIn} style={styles.devSkip}>
                <Text style={styles.devSkipText}>Skip sign-in (dev preview)</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </SafeAreaView>
    </ImageBackground>
  )
}

function isCanceled(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && e.code === 'ERR_REQUEST_CANCELED'
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: '#0B1E2D',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
  },
  safe: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
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
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  subtitle: {
    fontSize: 17,
    color: 'rgba(255, 255, 255, 0.9)',
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  footer: {
    gap: 16,
  },
  appleButton: {
    height: 50,
    width: '100%',
  },
  unavailable: {
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
  },
  error: {
    color: '#FFB4B4',
    textAlign: 'center',
  },
  devSkip: {
    paddingVertical: 8,
  },
  devSkipText: {
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
})
