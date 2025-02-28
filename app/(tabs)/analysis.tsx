import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as FileSystem from "expo-file-system";

export default function AnalysisScreen() {
  const { fileUri } = useLocalSearchParams<{ fileUri?: string }>();
  const [fileContents, setFileContents] = useState<string>("");

  useEffect(() => {
    if (!fileUri) return;
    loadFileContents(fileUri);
  }, [fileUri]);

  async function loadFileContents(uri: string) {
    try {
      // If there's a "?ts=..." suffix, strip it off
      const cleanedUri = uri.split("?")[0];

      const contents = await FileSystem.readAsStringAsync(cleanedUri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      setFileContents(contents);
    } catch (err: any) {
      console.error("Error reading file:", err);
      setFileContents(`Error reading file: ${err.message || err}`);
    }
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>File Content</Text>
      <Text style={styles.contents}>{fileContents}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 12,
  },
  contents: {
    fontSize: 14,
    color: "#333",
  },
});
