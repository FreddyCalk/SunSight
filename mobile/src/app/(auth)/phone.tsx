import { StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PhoneAuthRoute() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>WELCOME TO SUNSIGHT</Text>
        <Text style={styles.title}>Confirm your phone</Text>
        <Text style={styles.description}>
          Phone verification and password sign-in will be available in a later build.
        </Text>
        <TextInput
          accessibilityLabel="Phone number"
          editable={false}
          placeholder="+1 phone number"
          style={styles.input}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    gap: 18,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  description: {
    color: '#64594F',
    fontSize: 16,
    lineHeight: 24,
  },
  eyebrow: {
    color: '#945924',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8CABD',
    borderRadius: 14,
    borderWidth: 1,
    color: '#7C6E61',
    fontSize: 17,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  safeArea: {
    backgroundColor: '#FFF7EA',
    flex: 1,
  },
  title: {
    color: '#2B1607',
    fontSize: 34,
    fontWeight: '700',
  },
});
