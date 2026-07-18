import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SkyWindowRoute() {
  const { blastId } = useLocalSearchParams<{ blastId: string }>();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>SKY WINDOW</Text>
        <Text style={styles.title}>The sky will appear here.</Text>
        <Text style={styles.description}>
          Blast {blastId ?? 'unknown'} is not available in this scaffold.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    flex: 1,
    gap: 18,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  description: {
    color: '#D9D2CA',
    fontSize: 15,
    textAlign: 'center',
  },
  eyebrow: {
    color: '#F4A950',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 3,
  },
  safeArea: {
    backgroundColor: '#17100D',
    flex: 1,
  },
  title: {
    color: '#FFF7EA',
    fontSize: 34,
    fontWeight: '700',
    lineHeight: 40,
    textAlign: 'center',
  },
});
