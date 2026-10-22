import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#101a27' },
          headerTintColor: '#f5d67a',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: '#0b121c' },
        }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ title: 'Acceso seguro' }} />
        <Stack.Screen name="crafting-log" options={{ title: 'Crafting Log' }} />
      </Stack>
    </>
  );
}
