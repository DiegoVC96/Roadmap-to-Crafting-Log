import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { auth } from '@/lib/firebase';
import { getIconUrl, loadAllRecipes } from '@/lib/ffxiv-api';
import { calculateBaseMaterialTotals, type BaseMaterialTotal } from '@/lib/material-roadmap';
import { loadUserProgress } from '@/lib/user-progress';

export default function MaterialsScreen() {
  const [materials, setMaterials] = useState<BaseMaterialTotal[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMaterials = useCallback(async () => {
    const user = auth?.currentUser;
    if (!user) {
      setError('Tu sesión no está disponible. Vuelve a iniciar sesión.');
      setIsLoading(false);
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      const [recipes, completedIds] = await Promise.all([loadAllRecipes(), loadUserProgress(user.uid)]);
      setMaterials(calculateBaseMaterialTotals(recipes, completedIds));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'No se pudieron calcular los materiales.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { void loadMaterials(); }, 0);
    return () => clearTimeout(timer);
  }, [loadMaterials]);

  const visibleMaterials = useMemo(() => {
    const text = search.trim().toLocaleLowerCase();
    return text ? materials.filter((material) => material.name.toLocaleLowerCase().includes(text)) : materials;
  }, [materials, search]);

  if (isLoading) return <View style={styles.centered}><ActivityIndicator size="large" color="#e5c86f" /><Text style={styles.loading}>Calculando materiales pendientes…</Text></View>;
  if (error) return <View style={styles.centered}><Text style={styles.error}>{error}</Text><Pressable onPress={() => void loadMaterials()} style={styles.retry}><Text style={styles.retryText}>Reintentar</Text></Pressable></View>;

  return <FlatList
    data={visibleMaterials}
    keyExtractor={(material) => String(material.itemId)}
    contentContainerStyle={styles.content}
    ListHeaderComponent={<View><Text style={styles.title}>Materiales base pendientes</Text><Text style={styles.subtitle}>Totales expandidos: las recetas intermedias se desarman automáticamente hasta llegar a materiales que debes obtener fuera del crafting.</Text><TextInput value={search} onChangeText={setSearch} placeholder="Buscar material..." placeholderTextColor="#758598" style={styles.search} /><Text style={styles.count}>{visibleMaterials.length} tipos de material</Text></View>}
    renderItem={({ item }) => <Pressable onPress={() => router.push(`/material-guide?itemId=${item.itemId}&name=${encodeURIComponent(item.name)}&total=${item.total}&iconPath=${encodeURIComponent(item.iconPath ?? '')}` as never)} style={styles.materialCard}>{item.iconPath ? <Image source={{ uri: getIconUrl(item.iconPath) }} style={styles.icon} /> : <View style={styles.iconFallback} />}<View style={styles.materialInfo}><Text style={styles.name}>{item.name}</Text><Text style={styles.detail}>Toca para ver cómo obtenerlo</Text></View><Text style={styles.total}>×{item.total.toLocaleString()}</Text></Pressable>}
    ListEmptyComponent={<Text style={styles.empty}>No encontramos materiales con esa búsqueda.</Text>}
  />;
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center', backgroundColor: '#0b121c', flex: 1, justifyContent: 'center', padding: 28 }, content: { backgroundColor: '#0b121c', padding: 18, paddingBottom: 32 },
  title: { color: '#f7d985', fontSize: 28, fontWeight: '800' }, subtitle: { color: '#b9c2cd', fontSize: 14, lineHeight: 21, marginTop: 8 }, loading: { color: '#f0d27a', fontSize: 16, fontWeight: '700', marginTop: 17 }, error: { color: '#ffbec5', fontSize: 15, lineHeight: 22, textAlign: 'center' }, retry: { backgroundColor: '#c99d39', borderRadius: 12, marginTop: 20, paddingHorizontal: 20, paddingVertical: 13 }, retryText: { color: '#171109', fontWeight: '800' },
  search: { backgroundColor: '#132131', borderColor: '#31465b', borderRadius: 12, borderWidth: 1, color: '#f4f7fb', fontSize: 16, marginTop: 20, paddingHorizontal: 14, paddingVertical: 13 }, count: { color: '#8998a9', fontSize: 13, marginBottom: 10, marginTop: 15 },
  materialCard: { alignItems: 'center', backgroundColor: '#132131', borderColor: '#2c4054', borderRadius: 14, borderWidth: 1, flexDirection: 'row', marginBottom: 10, padding: 12 }, icon: { height: 43, width: 43 }, iconFallback: { backgroundColor: '#324456', borderRadius: 8, height: 43, width: 43 }, materialInfo: { flex: 1, marginHorizontal: 12 }, name: { color: '#f0f4f8', fontSize: 15, fontWeight: '800' }, detail: { color: '#9eabb9', fontSize: 12, marginTop: 4 }, total: { color: '#f1cf72', fontSize: 18, fontWeight: '900' }, empty: { color: '#aab7c6', marginTop: 22, textAlign: 'center' },
});
