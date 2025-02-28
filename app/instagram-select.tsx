// === C:\Users\samsn\OneDrive\Desktop\ChatRecapApp\ChatWrappedAI\app\instagram-select.tsx ===
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Dimensions,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as FileSystem from "expo-file-system";

interface ConversationFolder {
  folderName: string; // e.g. "sam_12345"
  displayName: string; // e.g. "sam"
}

export default function InstagramSelectScreen() {
  const router = useRouter();
  const { baseFolder } = useLocalSearchParams<{ baseFolder?: string }>();

  const [loading, setLoading] = useState(true);
  const [conversationFolders, setConversationFolders] = useState<ConversationFolder[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!baseFolder) {
      setLoading(false);
      Alert.alert("Error", "No base folder provided to instagram-select.");
      return;
    }
    loadInboxSubfolders(baseFolder);
  }, [baseFolder]);

  /**
   * Reads subfolders in {baseFolder}/messages/inbox.
   * Each subfolder typically looks like "sam_12345", "someone_9999", etc.
   */
  async function loadInboxSubfolders(rootDir: string) {
    try {
      // The actual "inbox" path is:
      const inboxPath = `${rootDir}/messages/inbox`;
      console.log("instagram-select loadInboxSubfolders. Checking =>", inboxPath);

      // Make sure it exists
      const info = await FileSystem.getInfoAsync(inboxPath);
      if (!info.exists || !info.isDirectory) {
        throw new Error(`messages/inbox not found at: ${inboxPath}`);
      }

      // Now read the subfolder names
      const items = await FileSystem.readDirectoryAsync(inboxPath);
      console.log("Subfolders in inbox =>", items);
      
      const out: ConversationFolder[] = [];
      for (const item of items) {
        const fullPath = `${inboxPath}/${item}`;
        const folderInfo = await FileSystem.getInfoAsync(fullPath);
        if (folderInfo.isDirectory) {
          // e.g. "sam_12345"
          // let's guess a display name
          const display = item.replace(/_[0-9]+$/, "");
          out.push({ folderName: item, displayName: display });
        }
      }

      // Sort by displayName
      out.sort((a, b) => a.displayName.localeCompare(b.displayName));
      setConversationFolders(out);
    } catch (err: any) {
      console.error("Error loading inbox subfolders:", err);
      Alert.alert("Error", err.message || "Failed to list subfolders in messages/inbox.");
    } finally {
      setLoading(false);
    }
  }

  function handleSelectItem(index: number) {
    setSelectedIndex(index);
  }

  async function handleConfirm() {
    try {
      if (selectedIndex == null) {
        Alert.alert("Please select a conversation folder first.");
        return;
      }
      if (!baseFolder) {
        Alert.alert("Error", "Missing baseFolder param.");
        return;
      }

      setLoading(true);
      const chosen = conversationFolders[selectedIndex];
      const { folderName } = chosen;

      // Convert subfolder => .txt
      const txtPath = await convertInstagramJsonFolderToTxt(baseFolder, folderName);

      // Navigate to analysis
      router.push({
        pathname: "/(tabs)/analysis",
        params: {
          fileUri: txtPath + "?ts=" + Date.now(),
        },
      });
    } catch (err: any) {
      console.error("Error confirming folder:", err);
      Alert.alert("Error", err.message || "Failed to convert conversation.");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ff69b4" />
        <Text style={{ marginTop: 10, textAlign: 'center' }}>
          Hang on, processing... Please do not close.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Select the conversation you want to import</Text>
      <Text style={styles.subtitle}>Then tap Confirm below</Text>

      <FlatList
        data={conversationFolders}
        keyExtractor={(item) => item.folderName}
        renderItem={({ item, index }) => {
          const isSelected = index === selectedIndex;
          return (
            <TouchableOpacity
              style={[styles.itemRow, isSelected && styles.itemRowSelected]}
              onPress={() => handleSelectItem(index)}
            >
              <Text style={styles.itemText}>{item.displayName}</Text>
            </TouchableOpacity>
          );
        }}
      />

      <View style={styles.confirmContainer}>
        <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
          <Text style={styles.confirmButtonText}>Confirm</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

/**
 * Reads all message_*.json in the specified subfolder, merges them into .txt,
 * and returns that .txt path.
 */
async function convertInstagramJsonFolderToTxt(
  baseFolder: string,
  subFolder: string
): Promise<string> {
  // The path to the chosen conversation subfolder:
  // e.g. baseFolder/messages/inbox/sam_12345
  const convoFolderPath = `${baseFolder}/messages/inbox/${subFolder}`;
  const dirItems = await FileSystem.readDirectoryAsync(convoFolderPath);

  // Filter out "message_*.json"
  const jsonFiles = dirItems.filter((f) => {
    const lower = f.toLowerCase();
    return lower.startsWith("message_") && lower.endsWith(".json");
  });

  if (jsonFiles.length === 0) {
    throw new Error(`No message_*.json found in subfolder: ${subFolder}`);
  }

  let allMessages: Array<{
    sender: string;
    content: string;
    timestampMs: number;
  }> = [];

  for (const fileName of jsonFiles) {
    const fullPath = `${convoFolderPath}/${fileName}`;
    const fileStr = await FileSystem.readAsStringAsync(fullPath, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const parsed = JSON.parse(fileStr);

    const arr = parsed.messages || [];
    for (const m of arr) {
      // Safely handle sender (sometimes sender_name could be non-string)
      const sender =
        typeof m.sender_name === "string" ? m.sender_name : "Unknown";

      // Safely handle content, in case it's an object or missing
      let content = "";
      if (typeof m.content === "string") {
        content = m.content;
      } else if (m.content && typeof m.content.text === "string") {
        // In some Facebook JSON exports, content may be an object with a 'text' field
        content = m.content.text;
      }

      // Also handle array-of-objects or other weird shapes if needed, 
      // but for now we skip them. 
      const timestampMs = m.timestamp_ms || 0;

      allMessages.push({
        sender,
        content,
        timestampMs,
      });
    }
  }

  // Sort ascending by timestamp
  allMessages.sort((a, b) => a.timestampMs - b.timestampMs);

  // Format lines
  const lines = allMessages.map((msg) => {
    const dt = new Date(msg.timestampMs);
    const formatted = formatDate(dt);

    // Ensure we have strings
    const safeSender = (typeof msg.sender === "string" ? msg.sender : "Unknown")
      .replace(/\n/g, " ");
    const safeContent = (typeof msg.content === "string" ? msg.content : "")
      .replace(/\n/g, " ");

    return `[${formatted}] ${safeSender}: ${safeContent}`;
  });

  const finalTxt = lines.join("\n");
  const localTxtPath = FileSystem.cacheDirectory + `instagram_${subFolder}.txt`;

  await FileSystem.writeAsStringAsync(localTxtPath, finalTxt, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return localTxtPath;
}

function formatDate(dt: Date): string {
  const dd = pad(dt.getDate());
  const mm = pad(dt.getMonth() + 1);
  const yyyy = dt.getFullYear();
  let hours = dt.getHours();
  const minutes = pad(dt.getMinutes());
  const seconds = pad(dt.getSeconds());
  const ampm = hours >= 12 ? "pm" : "am";
  if (hours === 0) {
    hours = 12;
  } else if (hours > 12) {
    hours -= 12;
  }
  return `${dd}/${mm}/${yyyy}, ${hours}:${minutes}:${seconds} ${ampm}`;
}

function pad(num: number) {
  return num < 10 ? `0${num}` : String(num);
}

const { width } = Dimensions.get("window");
const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: "#fff5f7",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  container: {
    flex: 1,
    backgroundColor: "#fff5f7",
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#ff69b4",
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: "#333",
    textAlign: "center",
    marginBottom: 16,
  },
  itemRow: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  itemRowSelected: {
    backgroundColor: "#ffeef5",
    borderColor: "#ff69b4",
    borderWidth: 1,
  },
  itemText: {
    fontSize: 16,
    color: "#333",
  },
  confirmContainer: {
    position: "absolute",
    bottom: 20,
    left: 0,
    width,
    justifyContent: "center",
    alignItems: "center",
  },
  confirmButton: {
    backgroundColor: "#ff69b4",
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 25,
  },
  confirmButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
