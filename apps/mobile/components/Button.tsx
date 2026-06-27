import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native'

interface ButtonProps {
  label: string
  onPress: () => void
  loading?: boolean
  disabled?: boolean
  variant?: 'primary' | 'secondary'
}

/** A minimal pressable button with primary/secondary variants. */
export function Button({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
}: ButtonProps) {
  const isDisabled = disabled || loading
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' ? styles.primary : styles.secondary,
        (pressed || isDisabled) && styles.dimmed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : '#208AEF'} />
      ) : (
        <Text style={[styles.label, variant === 'secondary' && styles.labelSecondary]}>
          {label}
        </Text>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primary: {
    backgroundColor: '#208AEF',
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#208AEF',
  },
  dimmed: {
    opacity: 0.6,
  },
  label: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  labelSecondary: {
    color: '#208AEF',
  },
})
