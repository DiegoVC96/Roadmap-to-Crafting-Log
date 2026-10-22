import { router } from 'expo-router';
import { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { loadAccessStatus, requestAccess } from '@/lib/access-control';
import { auth, isFirebaseConfigured } from '@/lib/firebase';

type Mode = 'sign-in' | 'sign-up' | 'reset';

const actionUrl = 'https://roadmap-to-crafting-log.web.app';

function isStrongPassword(password: string) {
  return password.length >= 12 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}

function getErrorMessage(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';

  if (code === 'auth/email-already-in-use') return 'Ya existe una cuenta con este correo.';
  if (code === 'auth/invalid-credential') return 'El correo o la contraseña no son correctos.';
  if (code === 'auth/too-many-requests') return 'Demasiados intentos. Espera unos minutos antes de volver a probar.';
  if (code === 'auth/weak-password') return 'La contraseña no cumple los requisitos de seguridad.';
  if (code === 'auth/network-request-failed') return 'No hay conexión. Revisa tu red e inténtalo otra vez.';

  return 'No pudimos completar la solicitud. Inténtalo nuevamente.';
}

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setPassword('');
    setMessage(null);
    setError(null);
  }

  async function submit() {
    setMessage(null);
    setError(null);

    if (!auth) {
      setError('Firebase todavía no está configurado en esta instalación.');
      return;
    }

    if (!email.trim()) {
      setError('Ingresa tu correo electrónico.');
      return;
    }

    if (mode === 'sign-up' && !isStrongPassword(password)) {
      setError('Usa 12 caracteres o más, con mayúscula, minúscula, número y símbolo.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === 'sign-up') {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await sendEmailVerification(credential.user, { url: actionUrl });
        await signOut(auth);
        setPassword('');
        setMode('sign-in');
        setMessage('Cuenta creada. Confirma el enlace enviado a tu correo antes de iniciar sesión.');
        return;
      }

      if (mode === 'reset') {
        await sendPasswordResetEmail(auth, email.trim(), { url: actionUrl });
        setMessage('Si existe una cuenta con ese correo, recibirás un enlace de recuperación.');
        return;
      }

      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      await credential.user.reload();

      if (!credential.user.emailVerified) {
        await signOut(auth);
        setError('Confirma primero el enlace enviado a tu correo.');
        return;
      }

      await requestAccess(credential.user.uid, credential.user.email ?? email.trim());
      const status = await loadAccessStatus(credential.user.uid);

      if (status === 'approved') {
        router.replace('/crafting-log');
        return;
      }

      setMessage(
        status === 'rejected'
          ? 'Tu solicitud fue rechazada. Contacta al administrador si crees que se trata de un error.'
          : 'Tu cuenta está verificada. Un administrador debe aprobar tu acceso antes de usar el log.',
      );
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>CUENTA PROTEGIDA</Text>
          <Text style={styles.title}>
            {mode === 'sign-up' ? 'Crea tu cuenta' : mode === 'reset' ? 'Recupera tu acceso' : 'Bienvenido de vuelta'}
          </Text>
          <Text style={styles.intro}>
            {mode === 'sign-up'
              ? 'Primero verificaremos tu correo y luego el administrador habilitará tu acceso.'
              : 'Usa tu cuenta de Roadmap to Crafting Log para continuar.'}
          </Text>

          {!isFirebaseConfigured && (
            <View style={styles.notice}>
              <Text style={styles.noticeTitle}>Falta conectar Firebase</Text>
              <Text style={styles.noticeText}>Completa el archivo .env.local dentro de la carpeta mobile antes de crear o iniciar sesión.</Text>
            </View>
          )}

          {mode !== 'reset' && (
            <View style={styles.tabs}>
              <Tab label="Entrar" active={mode === 'sign-in'} onPress={() => changeMode('sign-in')} />
              <Tab label="Crear cuenta" active={mode === 'sign-up'} onPress={() => changeMode('sign-up')} />
            </View>
          )}

          <Text style={styles.label}>Correo electrónico</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="tu@email.com"
            placeholderTextColor="#748294"
            style={styles.input}
            value={email}
          />

          {mode !== 'reset' && (
            <>
              <Text style={styles.label}>Contraseña</Text>
              <TextInput
                autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                onChangeText={setPassword}
                placeholder="••••••••••••"
                placeholderTextColor="#748294"
                secureTextEntry
                style={styles.input}
                value={password}
              />
              {mode === 'sign-up' && <Text style={styles.help}>Mínimo 12 caracteres: mayúscula, minúscula, número y símbolo.</Text>}
            </>
          )}

          {message && <Text style={styles.message}>{message}</Text>}
          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            accessibilityRole="button"
            disabled={isSubmitting || !isFirebaseConfigured}
            onPress={() => void submit()}
            style={({ pressed }) => [styles.submit, (pressed || isSubmitting || !isFirebaseConfigured) && styles.submitPressed]}>
            <Text style={styles.submitText}>
              {isSubmitting ? 'Procesando…' : mode === 'sign-in' ? 'Iniciar sesión' : mode === 'sign-up' ? 'Crear cuenta segura' : 'Enviar enlace'}
            </Text>
          </Pressable>

          {mode === 'sign-in' && <LinkButton label="¿Olvidaste tu contraseña?" onPress={() => changeMode('reset')} />}
          {mode === 'reset' && <LinkButton label="← Volver a iniciar sesión" onPress={() => changeMode('sign-in')} />}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]}><Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text></Pressable>;
}

function LinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.linkButton}><Text style={styles.linkText}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b121c' }, safeArea: { flex: 1 }, content: { padding: 24 },
  eyebrow: { color: '#d9b95d', fontSize: 12, fontWeight: '800', letterSpacing: 2.4, marginTop: 12 },
  title: { color: '#f7d985', fontSize: 29, fontWeight: '800', marginTop: 10 }, intro: { color: '#b9c2cd', fontSize: 15, lineHeight: 22, marginTop: 9 },
  notice: { backgroundColor: '#2c2010', borderColor: '#735420', borderRadius: 12, borderWidth: 1, marginTop: 20, padding: 14 }, noticeTitle: { color: '#f0d27a', fontWeight: '800' }, noticeText: { color: '#d3c5a5', fontSize: 13, lineHeight: 19, marginTop: 5 },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 26 }, tab: { alignItems: 'center', flex: 1, borderBottomColor: '#304153', borderBottomWidth: 2, paddingVertical: 12 }, tabActive: { borderBottomColor: '#d9b95d' }, tabText: { color: '#91a0af', fontWeight: '700' }, tabTextActive: { color: '#f0d27a' },
  label: { color: '#dce4ed', fontSize: 14, fontWeight: '700', marginTop: 23, marginBottom: 8 }, input: { backgroundColor: '#132131', borderColor: '#31465b', borderRadius: 12, borderWidth: 1, color: '#f4f7fb', fontSize: 16, paddingHorizontal: 15, paddingVertical: 14 }, help: { color: '#9eabb9', fontSize: 12, lineHeight: 18, marginTop: 8 },
  message: { backgroundColor: '#123126', color: '#a7e6bd', borderRadius: 10, fontSize: 14, lineHeight: 20, marginTop: 20, padding: 13 }, error: { backgroundColor: '#3a1d21', color: '#ffbec5', borderRadius: 10, fontSize: 14, lineHeight: 20, marginTop: 20, padding: 13 },
  submit: { alignItems: 'center', backgroundColor: '#c99d39', borderRadius: 13, marginTop: 24, paddingVertical: 16 }, submitPressed: { opacity: 0.55 }, submitText: { color: '#171109', fontSize: 16, fontWeight: '800' }, linkButton: { alignItems: 'center', marginTop: 20, padding: 8 }, linkText: { color: '#e5c86f', fontSize: 14, fontWeight: '700' },
});
