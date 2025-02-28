// === C:\Users\samsn\OneDrive\Desktop\ChatRecapApp\ChatWrappedAI\app\chat-import.tsx ===
import React, { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ScrollView,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from "react-native";
import * as FileSystem from "expo-file-system";

export default function ChatImportScreen() {
  const { uri } = useLocalSearchParams<{ uri?: string }>();
  const router = useRouter();
  const [status, setStatus] = useState("Waiting for share...");

  useEffect(() => {
    if (!uri) {
      setStatus("No URI provided.");
      return;
    }

    checkSharedPath(uri);
  }, [uri]);

  async function checkSharedPath(sharedUri: string) {
    try {
      setStatus(`Received share from: ${sharedUri}`);

      const info = await FileSystem.getInfoAsync(sharedUri);
      if (!info.exists) {
        setStatus("File or folder does not exist: " + sharedUri);
        return;
      }

      if (info.isDirectory) {
        // 1) Check if it looks like an Instagram export
        const instaPath = `${sharedUri}/your_instagram_activity/messages/inbox`;
        const instaInfo = await FileSystem.getInfoAsync(instaPath);
        if (instaInfo.exists && instaInfo.isDirectory) {
          setStatus("Detected Instagram export folder. Navigating to instagram-select...");
          router.push({
            pathname: "/instagram-select",
            params: { baseFolder: sharedUri + "/your_instagram_activity" },
          });
          return;
        }

        // 2) Check if it looks like a Facebook export
        const fbPath = `${sharedUri}/your_facebook_activity/messages/inbox`;
        const fbInfo = await FileSystem.getInfoAsync(fbPath);
        if (fbInfo.exists && fbInfo.isDirectory) {
          setStatus("Detected Facebook export folder. Navigating to instagram-select...");
          router.push({
            pathname: "/instagram-select",
            params: { baseFolder: sharedUri + "/your_facebook_activity" },
          });
          return;
        }

        // Otherwise, it's just some folder that doesn't match either structure
        setStatus(
          "Directory provided, but no Instagram/Facebook structure found. Provide a .txt file or an export folder."
        );
      } else {
        // 3) If it's a file, see if it ends with .txt
        if (sharedUri.toLowerCase().endsWith(".txt")) {
          setStatus(`Found a .txt file: ${sharedUri}. Navigating to analysis...`);
          router.push({
            pathname: "/(tabs)/analysis",
            params: {
              fileUri: sharedUri + "?ts=" + Date.now(),
            },
          });
        } else {
          setStatus("Not a .txt file, and not an Instagram/Facebook export folder.");
        }
      }
    } catch (error: any) {
      setStatus(`Error: ${error.message}`);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>Chat Import</Text>
      <Text style={styles.status}>{status}</Text>
      <TouchableOpacity
        style={styles.demoButton}
        onPress={() => Alert.alert("Demo", "You can do something else here!")}
      >
        <Text style={styles.demoButtonText}>Demo Button</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  header: {
    fontSize: 22,
    fontWeight: "600",
    marginBottom: 12,
  },
  status: {
    color: "gray",
    marginBottom: 16,
    fontSize: 15,
  },
  demoButton: {
    marginTop: 20,
    backgroundColor: "#ff69b4",
    padding: 12,
    borderRadius: 20,
  },
  demoButtonText: {
    color: "#fff",
    textAlign: "center",
    fontWeight: "600",
  },
});
