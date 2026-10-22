import { ScrollView, StyleSheet, Text, View } from 'react-native';

const professions = [
  'Carpenter',
  'Blacksmith',
  'Armorer',
  'Goldsmith',
  'Leatherworker',
  'Weaver',
  'Alchemist',
  'Culinarian',
];

export default function CraftingLogScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Tus profesiones</Text>
      <Text style={styles.subtitle}>
        El motor de recetas y el progreso sincronizado se trasladarán a esta vista nativa.
      </Text>
      <View style={styles.grid}>
        {professions.map((profession) => (
          <View key={profession} style={styles.card}>
            <Text style={styles.cardTitle}>{profession}</Text>
            <Text style={styles.cardDetail}>Preparando log</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b121c' },
  content: { padding: 22 },
  title: { color: '#f7d985', fontSize: 28, fontWeight: '800' },
  subtitle: { color: '#b9c2cd', fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 22 },
  grid: { gap: 12 },
  card: { backgroundColor: '#132131', borderColor: '#2a4053', borderRadius: 14, borderWidth: 1, padding: 17 },
  cardTitle: { color: '#f0d27a', fontSize: 17, fontWeight: '800' },
  cardDetail: { color: '#9eabb9', fontSize: 13, marginTop: 4 },
});
