import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/features/auth/AuthProvider';
import {
  formatUsCanadaNationalDisplay,
  formatUsCanadaNationalInput,
} from '@/features/auth/phone';
import { CAPTCHA_SITE_KEY } from '@/lib/config';

type Step = 'phone' | 'otp';

export default function PhoneAuthRoute() {
  const { sendOtp, verifyOtp, signOut, gate } = useAuth();
  const [step, setStep] = useState<Step>('phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSendCode = async () => {
    setError(null);
    setBusy(true);
    try {
      const { phone } = await sendOtp(phoneInput);
      setVerifiedPhone(phone);
      setStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send a code.');
    } finally {
      setBusy(false);
    }
  };

  const onVerify = async () => {
    if (!verifiedPhone) {
      setError('Request a code first.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await verifyOtp(verifiedPhone, otp);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify that code.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoiding}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>WELCOME TO SUNSIGHT</Text>
          <Text style={styles.title}>Confirm your phone</Text>
          <Text style={styles.description}>
            Enter a US or Canada number. Identity is confirmed only after the SMS
            code succeeds — the number you type is never treated as a signed-in
            account on its own.
          </Text>

          {CAPTCHA_SITE_KEY ? (
            <Text style={styles.hint}>
              This environment requires a CAPTCHA token. Pass it through a
              challenge UI before requesting a code.
            </Text>
          ) : null}

          {step === 'phone' ? (
            <>
              <TextInput
                accessibilityLabel="Phone number"
                autoComplete="tel"
                keyboardType="phone-pad"
                maxLength={14}
                onChangeText={(text) => setPhoneInput(formatUsCanadaNationalInput(text))}
                placeholder="(555) 555-0100"
                style={styles.input}
                textContentType="telephoneNumber"
                value={phoneInput}
              />
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => void onSendCode()}
                style={styles.primaryButton}>
                {busy ? (
                  <ActivityIndicator color="#FFF7EA" />
                ) : (
                  <Text style={styles.primaryButtonText}>Send code</Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.hint}>
                Code sent to{' '}
                {verifiedPhone
                  ? formatUsCanadaNationalDisplay(verifiedPhone)
                  : ''}
              </Text>
              <TextInput
                accessibilityLabel="Verification code"
                autoComplete="one-time-code"
                keyboardType="number-pad"
                maxLength={6}
                onChangeText={setOtp}
                placeholder="6-digit code"
                style={styles.input}
                textContentType="oneTimeCode"
                value={otp}
              />
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => void onVerify()}
                style={styles.primaryButton}>
                {busy ? (
                  <ActivityIndicator color="#FFF7EA" />
                ) : (
                  <Text style={styles.primaryButtonText}>Verify</Text>
                )}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => {
                  setStep('phone');
                  setOtp('');
                  setError(null);
                }}
                style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Use a different number</Text>
              </Pressable>
            </>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {gate.status === 'blocked' ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void signOut()}
              style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Sign out</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    gap: 16,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  keyboardAvoiding: {
    flex: 1,
  },
  description: {
    color: '#64594F',
    fontSize: 16,
    lineHeight: 24,
  },
  error: {
    color: '#9B2C2C',
    fontSize: 14,
    lineHeight: 20,
  },
  eyebrow: {
    color: '#945924',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
  },
  hint: {
    color: '#7C6E61',
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8CABD',
    borderRadius: 14,
    borderWidth: 1,
    color: '#2B1607',
    fontSize: 17,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#2B1607',
    borderRadius: 14,
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: '#FFF7EA',
    fontSize: 17,
    fontWeight: '600',
  },
  safeArea: {
    backgroundColor: '#FFF7EA',
    flex: 1,
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  secondaryButtonText: {
    color: '#7C6E61',
    fontSize: 15,
  },
  title: {
    color: '#2B1607',
    fontSize: 34,
    fontWeight: '700',
  },
});
