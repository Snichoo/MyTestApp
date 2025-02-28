import React from "react";
import { View, Text, StyleSheet, Button } from "react-native";
import { Link } from "expo-router";

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Home - ChatWrappedAI Minimal</Text>
      <Text>Use your file-sharing workflow to reproduce the zip import crash.</Text>

      <Link href="/chat-import" asChild>
        <Button title="Go to Chat Import screen" onPress={() => {}} />
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16 },
  title: { fontSize: 20, fontWeight: "bold", marginBottom: 12 },
});
