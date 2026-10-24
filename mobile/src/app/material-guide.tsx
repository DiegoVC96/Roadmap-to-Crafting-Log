import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getIconUrl, loadAllRecipes, type FfxivRecipe } from '@/lib/ffxiv-api';
import { loadItemSources, type ItemSource } from '@/lib/item-sources';

const kindLabel: Record<ItemSource['kind'], string> = {
  gathering: '⛏ Recolección', vendor: '◈ Vendedor', quest: '✦ Misión', mob: '⚔ Enemigo',
};

export default function MaterialGuideScreen() {
  const params = useLocalSearchParams<{ itemId?: string; name?: string; total?: string; iconPath?: string }>();
  const itemId = Number(params.itemId);
  const [sources, setSources] = useState<ItemSource[]>([]);
  const [craftingRecipe, setCraftingRecipe] = useState<FfxivRecipe | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadGuide = useCallback(async () => {
    if (!Number.isFinite(itemId)) {
      setError('No pudimos identificar este material.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const [nextSources, recipes] = await Promise.all([loadItemSources(itemId), loadAllRecipes()]);
      setSources(nextSources);
      setCraftingRecipe(recipes.find((recipe) => recipe.resultItemId === itemId) ?? null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'No se pudo cargar la guía de obtención.');
    } finally {
      setIsLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    const timer = setTimeout(() => { void loadGuide(); }, 0);
    return () => clearTimeout(timer);
  }, [loadGuide]);

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <View style={styles.heading}>
      {params.iconPath ? <Image source={{ uri: getIconUrl(params.iconPath) }} style={styles.icon} /> : <View style={styles.iconFallback} />}
      <View style={styles.headingText}><Text style={styles.eyebrow}>MATERIAL PENDIENTE</Text><Text style={styles.title}>{params.name ?? 'Material'}</Text><Text style={styles.total}>Necesitas ×{Number(params.total ?? 0).toLocaleString()}</Text></View>
    </View>
    <Text style={styles.sectionTitle}>Cómo obtener este material</Text>
    {isLoading && <View style={styles.loading}><ActivityIndicator color="#e5c86f" size="large" /><Text style={styles.loadingText}>Buscando fuentes de obtención…</Text></View>}
    {error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => void loadGuide()} style={styles.retry}><Text style={styles.retryText}>Reintentar</Text></Pressable></View>}
    {!isLoading && !error && sources.map((source, index) => <View key={`${source.kind}-${source.name}-${index}`} style={styles.sourceCard}><Text style={styles.kind}>{kindLabel[source.kind]}</Text><Text style={styles.sourceName}>{source.name}</Text><Text style={styles.detail}>{source.detail}</Text></View>)}
    {!isLoading && !error && sources.length === 0 && <View style={styles.noSources}>{craftingRecipe ? <><Text style={styles.noSourcesText}>No hay una fuente registrada por recolección, vendedor, misión ni enemigo. Debes fabricarlo para el Crafting Log.</Text><Pressable onPress={() => router.replace(`/crafting-log?crafter=${craftingRecipe.crafter}&recipeId=${craftingRecipe.id}&query=${encodeURIComponent(craftingRecipe.name)}` as never)} style={styles.craftingButton}><Text style={styles.craftingButtonText}>Ir a {craftingRecipe.crafter}: {craftingRecipe.name}</Text></Pressable></> : <Text style={styles.noSourcesText}>No encontramos una fuente registrada ni una receta de crafting. Puede provenir de contenido especial o del Market Board.</Text>}</View>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#0b121c', flex: 1 }, content: { padding: 20, paddingBottom: 35 }, heading: { alignItems: 'center', flexDirection: 'row', marginTop: 4 }, icon: { height: 66, width: 66 }, iconFallback: { backgroundColor: '#324456', borderRadius: 11, height: 66, width: 66 }, headingText: { flex: 1, marginLeft: 15 }, eyebrow: { color: '#d9b95d', fontSize: 11, fontWeight: '800', letterSpacing: 1.7 }, title: { color: '#f7d985', fontSize: 23, fontWeight: '800', marginTop: 5 }, total: { color: '#cbd5df', fontSize: 15, fontWeight: '700', marginTop: 5 }, sectionTitle: { color: '#f0d27a', fontSize: 18, fontWeight: '800', marginBottom: 12, marginTop: 29 }, loading: { alignItems: 'center', paddingVertical: 30 }, loadingText: { color: '#b9c2cd', marginTop: 13 }, sourceCard: { backgroundColor: '#132131', borderColor: '#2c4054', borderRadius: 14, borderWidth: 1, marginBottom: 10, padding: 15 }, kind: { color: '#e5c86f', fontSize: 12, fontWeight: '800' }, sourceName: { color: '#f0f4f8', fontSize: 16, fontWeight: '800', marginTop: 7 }, detail: { color: '#a9b6c4', fontSize: 13, marginTop: 4 }, errorBox: { alignItems: 'center', backgroundColor: '#3a1d21', borderRadius: 12, padding: 15 }, errorText: { color: '#ffbec5', textAlign: 'center' }, retry: { backgroundColor: '#c99d39', borderRadius: 10, marginTop: 13, paddingHorizontal: 18, paddingVertical: 11 }, retryText: { color: '#171109', fontWeight: '800' }, noSources: { backgroundColor: '#202c38', borderColor: '#485a6d', borderRadius: 14, borderWidth: 1, padding: 16 }, noSourcesText: { color: '#c5d0da', fontSize: 14, lineHeight: 21 }, craftingButton: { backgroundColor: '#8f3037', borderColor: '#e17075', borderRadius: 11, borderWidth: 1, marginTop: 16, padding: 13 }, craftingButtonText: { color: '#fff0f0', fontSize: 14, fontWeight: '800', textAlign: 'center' },
});
