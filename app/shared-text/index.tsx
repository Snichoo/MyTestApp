import React from 'react';
import { useLocalSearchParams, Stack } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';

export default function SharedTextScreen() {
  const { text } = useLocalSearchParams<{ text?: string }>();

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Shared Text' }} />
      <Text style={styles.title}>Shared Text</Text>
      <Text style={styles.body}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '600', marginBottom: 10 },
  body: { color: '#333', fontSize: 16 },
});
