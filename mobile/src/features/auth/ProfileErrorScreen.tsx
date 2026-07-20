import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from './AuthProvider';

export function ProfileErrorScreen() {
  const { refreshProfile } = useAuth();

  return (
    <View style={styles.centered}>
      <Text style={styles.title}>Could not load your profile</Text>
      <Text style={styles.message}>
        Your account is still signed in. Check your connection and try again.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => void refreshProfile()}
        style={styles.button}>
        <Text style={styles.buttonText}>Try again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#2B1607',
    borderRadius: 14,
    marginTop: 4,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  buttonText: {
    color: '#FFF7EA',
    fontSize: 16,
    fontWeight: '600',
  },
  centered: {
    alignItems: 'center',
    backgroundColor: '#FFF7EA',
    flex: 1,
    gap: 14,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  message: {
    color: '#64594F',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  title: {
    color: '#2B1607',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
});
