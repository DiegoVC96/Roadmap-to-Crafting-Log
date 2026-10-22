import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import logo from '@/assets/images/roadmap-logo.png';

export default function HomeScreen() {
  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.heroGlow} />
          <Image source={logo} style={styles.logo} contentFit="contain" />
          <Text style={styles.eyebrow}>FINAL FANTASY XIV</Text>
          <Text style={styles.title}>Roadmap to{`\n`}Crafting Log</Text>
          <Text style={styles.subtitle}>
            Tu ruta para completar al 100% los ocho registros de artesanía.
          </Text>

          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            onPress={() => router.push('/crafting-log')}>
            <Text style={styles.primaryButtonText}>Abrir Crafting Log</Text>
          </Pressable>

          <View style={styles.statusCard}>
            <Text style={styles.statusTitle}>Migración profesional en curso</Text>
            <Text style={styles.statusText}>
              Esta es la nueva base nativa para Android e iOS. Tus cuentas y progreso se conectarán de forma segura con Firebase en el siguiente paso.
            </Text>
          </View>

          <View style={styles.featureRow}>
            <Feature label="8 profesiones" detail="Logs de crafting" />
            <Feature label="Materiales" detail="Planificación total" />
            <Feature label="Nativo" detail="Android y iOS" />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Feature({ label, detail }: { label: string; detail: string }) {
  return (
    <View style={styles.feature}>
      <Text style={styles.featureLabel}>{label}</Text>
      <Text style={styles.featureDetail}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b121c' },
  safeArea: { flex: 1 },
  content: { alignItems: 'center', paddingHorizontal: 24, paddingBottom: 42 },
  heroGlow: {
    position: 'absolute',
    top: -170,
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: '#3a2a0d',
    opacity: 0.38,
  },
  logo: { width: 138, height: 138, marginTop: 38, marginBottom: 20 },
  eyebrow: { color: '#d9b95d', fontSize: 12, fontWeight: '800', letterSpacing: 3 },
  title: { color: '#f7d985', fontSize: 38, fontWeight: '800', lineHeight: 43, textAlign: 'center', marginTop: 12 },
  subtitle: { color: '#b9c2cd', fontSize: 16, lineHeight: 24, textAlign: 'center', marginTop: 16, maxWidth: 335 },
  primaryButton: { alignSelf: 'stretch', alignItems: 'center', backgroundColor: '#c99d39', borderRadius: 14, marginTop: 30, paddingVertical: 16, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 10, elevation: 5 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  primaryButtonText: { color: '#16110a', fontSize: 16, fontWeight: '800' },
  statusCard: { alignSelf: 'stretch', backgroundColor: '#132131', borderColor: '#2a4053', borderRadius: 16, borderWidth: 1, marginTop: 20, padding: 18 },
  statusTitle: { color: '#e9c86c', fontSize: 16, fontWeight: '800', marginBottom: 7 },
  statusText: { color: '#b7c2cf', fontSize: 14, lineHeight: 21 },
  featureRow: { alignSelf: 'stretch', flexDirection: 'row', gap: 10, marginTop: 18 },
  feature: { flex: 1, alignItems: 'center', backgroundColor: '#101a27', borderRadius: 12, paddingHorizontal: 6, paddingVertical: 14 },
  featureLabel: { color: '#f0d27a', fontSize: 12, fontWeight: '800', textAlign: 'center' },
  featureDetail: { color: '#94a2b2', fontSize: 10, lineHeight: 14, marginTop: 5, textAlign: 'center' },
});
