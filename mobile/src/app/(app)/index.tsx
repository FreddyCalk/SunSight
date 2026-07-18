import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeRoute() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>SUNSIGHT</Text>
        <Text style={styles.title}>Share the sky while it is happening.</Text>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" disabled style={styles.primaryAction}>
            <Text style={styles.actionTitle}>Look up</Text>
            <Text style={styles.actionDescription}>Send a nearby nudge</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled style={styles.primaryAction}>
            <Text style={styles.actionTitle}>Capture</Text>
            <Text style={styles.actionDescription}>Photograph tonight&apos;s sunset</Text>
          </Pressable>
        </View>
        <Text style={styles.status}>Sending will be enabled in a later build.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  actionDescription: {
    color: '#744819',
    fontSize: 15,
    marginTop: 4,
  },
  actions: {
    gap: 16,
    width: '100%',
  },
  actionTitle: {
    color: '#2B1607',
    fontSize: 24,
    fontWeight: '700',
  },
  content: {
    alignItems: 'center',
    flex: 1,
    gap: 28,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  eyebrow: {
    color: '#945924',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 3,
  },
  primaryAction: {
    backgroundColor: '#F7C987',
    borderRadius: 24,
    opacity: 0.55,
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  safeArea: {
    backgroundColor: '#FFF7EA',
    flex: 1,
  },
  status: {
    color: '#7C6E61',
    fontSize: 14,
    textAlign: 'center',
  },
  title: {
    color: '#2B1607',
    fontSize: 34,
    fontWeight: '700',
    lineHeight: 40,
    maxWidth: 360,
    textAlign: 'center',
  },
});
