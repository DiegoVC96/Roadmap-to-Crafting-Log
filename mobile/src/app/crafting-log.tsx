import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { auth } from '@/lib/firebase';
import { crafterIds, getIconUrl, loadAllRecipes, type CrafterId, type FfxivRecipe } from '@/lib/ffxiv-api';
import { loadUserProgress, saveUserProgress } from '@/lib/user-progress';

export default function CraftingLogScreen() {
  const [recipes, setRecipes] = useState<FfxivRecipe[]>([]);
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [selectedCrafter, setSelectedCrafter] = useState<CrafterId>('Carpenter');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const loadLog = useCallback(async () => {
    const user = auth?.currentUser;
    if (!user) {
      setError('Tu sesión no está disponible. Vuelve a iniciar sesión.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const [nextRecipes, nextCompletedIds] = await Promise.all([loadAllRecipes(), loadUserProgress(user.uid)]);
      setRecipes(nextRecipes);
      setCompletedIds(nextCompletedIds);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'No pudimos cargar tu Crafting Log.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { void loadLog(); }, 0);
    return () => clearTimeout(timer);
  }, [loadLog]);

  const filteredRecipes = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return recipes.filter((recipe) => recipe.crafter === selectedCrafter && (!normalizedSearch || recipe.name.toLocaleLowerCase().includes(normalizedSearch)));
  }, [recipes, search, selectedCrafter]);

  const completedForCrafter = recipes.filter((recipe) => recipe.crafter === selectedCrafter && completedIds.includes(recipe.id)).length;
  const totalForCrafter = recipes.filter((recipe) => recipe.crafter === selectedCrafter).length;

  async function toggleRecipe(recipeId: string) {
    const user = auth?.currentUser;
    if (!user) return;
    setSyncError(null);
    const nextCompleted = completedIds.includes(recipeId) ? completedIds.filter((id) => id !== recipeId) : [...completedIds, recipeId];
    setCompletedIds(nextCompleted);
    try {
      await saveUserProgress(user.uid, nextCompleted);
    } catch {
      setCompletedIds(completedIds);
      setSyncError('No se pudo guardar el cambio. Revisa tu conexión e inténtalo otra vez.');
    }
  }

  if (isLoading) return <LoadingState />;
  if (error) return <View style={styles.centered}><Text style={styles.error}>{error}</Text><Pressable onPress={() => void loadLog()} style={styles.retry}><Text style={styles.retryText}>Reintentar</Text></Pressable></View>;

  return (
    <FlatList
      data={filteredRecipes}
      keyExtractor={(recipe) => recipe.id}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={<View>
        <Text style={styles.title}>Crafting Log</Text>
        <Text style={styles.progress}>{selectedCrafter}: {completedForCrafter} / {totalForCrafter} completadas</Text>
        <View style={styles.progressTrack}><View style={[styles.progressValue, { width: totalForCrafter ? `${(completedForCrafter / totalForCrafter) * 100}%` : '0%' }]} /></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.crafterTabs}>
          {crafterIds.map((crafter) => <Pressable key={crafter} onPress={() => setSelectedCrafter(crafter)} style={[styles.crafterTab, selectedCrafter === crafter && styles.crafterTabActive]}><Text style={[styles.crafterText, selectedCrafter === crafter && styles.crafterTextActive]}>{crafter}</Text></Pressable>)}
        </ScrollView>
        <TextInput value={search} onChangeText={setSearch} placeholder="Buscar receta..." placeholderTextColor="#758598" style={styles.search} />
        {syncError && <Text style={styles.syncError}>{syncError}</Text>}
        <Pressable onPress={() => router.push('/materials')} style={styles.materialsButton}><Text style={styles.materialsButtonText}>Ver materiales pendientes</Text></Pressable>
        <Text style={styles.resultCount}>{filteredRecipes.length} recetas</Text>
      </View>}
      renderItem={({ item }) => <RecipeCard recipe={item} completed={completedIds.includes(item.id)} onToggle={() => void toggleRecipe(item.id)} />}
      ListEmptyComponent={<Text style={styles.empty}>No encontramos recetas para esta búsqueda.</Text>}
    />
  );
}

function LoadingState() {
  return <View style={styles.centered}><ActivityIndicator size="large" color="#e5c86f" /><Text style={styles.loadingText}>Cargando recetas de FFXIV…</Text><Text style={styles.loadingDetail}>La primera carga puede tomar unos momentos.</Text></View>;
}

function RecipeCard({ recipe, completed, onToggle }: { recipe: FfxivRecipe; completed: boolean; onToggle: () => void }) {
  return <Pressable onPress={onToggle} style={[styles.recipeCard, completed && styles.recipeCompleted]}>{recipe.iconPath ? <Image source={{ uri: getIconUrl(recipe.iconPath) }} style={styles.icon} /> : <View style={styles.iconFallback} />}<View style={styles.recipeContent}><Text style={[styles.recipeName, completed && styles.recipeNameCompleted]} numberOfLines={2}>{recipe.name}</Text><Text style={styles.recipeLevel}>Nivel {recipe.level ?? '—'} · {recipe.ingredients.length} materiales</Text></View><View style={[styles.check, completed && styles.checkCompleted]}><Text style={styles.checkText}>{completed ? '✓' : ''}</Text></View></Pressable>;
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center', backgroundColor: '#0b121c', flex: 1, justifyContent: 'center', padding: 28 }, loadingText: { color: '#f0d27a', fontSize: 17, fontWeight: '800', marginTop: 18 }, loadingDetail: { color: '#aab7c6', fontSize: 14, marginTop: 7, textAlign: 'center' },
  listContent: { backgroundColor: '#0b121c', padding: 18, paddingBottom: 32 }, title: { color: '#f7d985', fontSize: 29, fontWeight: '800' }, progress: { color: '#cbd5df', fontSize: 14, marginTop: 8 }, progressTrack: { backgroundColor: '#263747', borderRadius: 8, height: 8, marginTop: 10, overflow: 'hidden' }, progressValue: { backgroundColor: '#d7ad4d', height: '100%' },
  crafterTabs: { gap: 8, paddingVertical: 21 }, crafterTab: { backgroundColor: '#132131', borderColor: '#31465b', borderRadius: 99, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9 }, crafterTabActive: { backgroundColor: '#523d16', borderColor: '#d8af50' }, crafterText: { color: '#b4c0cd', fontSize: 13, fontWeight: '700' }, crafterTextActive: { color: '#f7d985' },
  search: { backgroundColor: '#132131', borderColor: '#31465b', borderRadius: 12, borderWidth: 1, color: '#f4f7fb', fontSize: 16, paddingHorizontal: 14, paddingVertical: 13 }, resultCount: { color: '#8998a9', fontSize: 13, marginBottom: 10, marginTop: 15 }, syncError: { color: '#ffbec5', fontSize: 13, marginTop: 12 },
  materialsButton: { alignItems: 'center', borderColor: '#d8af50', borderRadius: 12, borderWidth: 1, marginTop: 14, paddingVertical: 13 }, materialsButtonText: { color: '#f0d27a', fontSize: 14, fontWeight: '800' },
  recipeCard: { alignItems: 'center', backgroundColor: '#132131', borderColor: '#2c4054', borderRadius: 14, borderWidth: 1, flexDirection: 'row', marginBottom: 10, padding: 12 }, recipeCompleted: { backgroundColor: '#152a25', borderColor: '#42725a' }, icon: { height: 42, width: 42 }, iconFallback: { backgroundColor: '#324456', borderRadius: 8, height: 42, width: 42 }, recipeContent: { flex: 1, marginHorizontal: 12 }, recipeName: { color: '#f0f4f8', fontSize: 15, fontWeight: '800' }, recipeNameCompleted: { color: '#b7dfbe', textDecorationLine: 'line-through' }, recipeLevel: { color: '#9eabb9', fontSize: 12, marginTop: 5 }, check: { alignItems: 'center', borderColor: '#6c7a89', borderRadius: 15, borderWidth: 2, height: 30, justifyContent: 'center', width: 30 }, checkCompleted: { backgroundColor: '#4f986b', borderColor: '#4f986b' }, checkText: { color: '#fff', fontSize: 19, fontWeight: '900' },
  error: { color: '#ffbec5', fontSize: 15, lineHeight: 22, textAlign: 'center' }, retry: { backgroundColor: '#c99d39', borderRadius: 12, marginTop: 20, paddingHorizontal: 20, paddingVertical: 13 }, retryText: { color: '#171109', fontWeight: '800' }, empty: { color: '#aab7c6', marginTop: 22, textAlign: 'center' },
});
