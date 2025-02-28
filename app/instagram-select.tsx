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
import JSZip from "jszip";

/** 
 * Fallback-based helper: fetch file:// URI -> blob -> ArrayBuffer
 * with improved FileReader error handling
 */
async function fetchLocalFileAsArrayBuffer(fileUri: string): Promise<ArrayBuffer> {
  let finalUri = fileUri;
  if (!finalUri.startsWith("file://")) {
    finalUri = "file://" + finalUri;
  }

  const response = await fetch(finalUri);
  if (!response.ok) {
    throw new Error(`Failed to fetch local file: ${finalUri} (status: ${response.status})`);
  }
  const blob = await response.blob();

  if (typeof blob.arrayBuffer === "function") {
    return blob.arrayBuffer();
  }

  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result as ArrayBuffer);

    reader.onerror = (ev) => {
      if (reader.error) {
        return reject(reader.error);
      }
      reject(new Error(`FileReader error event: ${JSON.stringify(ev)}`));
    };

    reader.readAsArrayBuffer(blob);
  });
}

interface ConversationFolder {
  folderName: string;   // e.g. "sam_12345"
  displayName: string;  // e.g. "sam"
}

export default function InstagramSelectScreen() {
  const router = useRouter();
  const { zipBase64 } = useLocalSearchParams<{ zipBase64?: string }>();

  // We'll assume the local zip is stored in the same place as earlier:
  const [localZipPath] = useState(FileSystem.cacheDirectory + "sharedFile");

  const [loading, setLoading] = useState(true);
  const [conversationFolders, setConversationFolders] = useState<ConversationFolder[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [zipInstance, setZipInstance] = useState<JSZip | null>(null);

  useEffect(() => {
    loadInboxSubfolders();
  }, []);

  async function loadInboxSubfolders() {
    try {
      const zipBuffer = await fetchLocalFileAsArrayBuffer(localZipPath);
      const zip = await JSZip.loadAsync(zipBuffer);

      const inboxPath = "your_instagram_activity/messages/inbox"; 
      const folderNames = new Set<string>();

      // Collect possible subfolder names
      Object.keys(zip.files).forEach((fp) => {
        const lowerFp = fp.toLowerCase();
        const lowerInbox = inboxPath.toLowerCase();

        const indexOfInbox = lowerFp.indexOf(lowerInbox);
        if (indexOfInbox < 0) return;

        const afterInbox = fp.substring(indexOfInbox + inboxPath.length + 1);
        if (!afterInbox) return;

        const slashPos = afterInbox.indexOf("/");
        const possibleFolderName = (slashPos >= 0)
          ? afterInbox.substring(0, slashPos)
          : afterInbox;

        if (possibleFolderName && !possibleFolderName.includes(".")) {
          folderNames.add(possibleFolderName);
        }
      });

      const out: ConversationFolder[] = [];
      folderNames.forEach((f) => {
        const display = f.replace(/_[0-9]+$/, "");
        out.push({ folderName: f, displayName: display });
      });

      setConversationFolders(out);
      setZipInstance(zip);
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to parse subfolders from zip.");
    } finally {
      setLoading(false);
    }
  }

  function handleSelectItem(index: number) {
    setSelectedIndex(index);
  }

  async function handleConfirm() {
    try {
      if (selectedIndex === null) {
        Alert.alert("Please select a conversation folder first.");
        return;
      }
      if (!zipInstance) {
        Alert.alert("Missing zip data", "No JSZip instance loaded.");
        return;
      }

      setLoading(true);
      const chosen = conversationFolders[selectedIndex];
      const { folderName } = chosen;

      // Convert subfolder => .txt
      const txtPath = await convertInstagramJsonToTxt(zipInstance, folderName);

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

/** Convert subfolder => .txt, used on confirm. */
async function convertInstagramJsonToTxt(zip: JSZip, folderName: string): Promise<string> {
  const allFilePaths = Object.keys(zip.files);
  const prefix = `your_instagram_activity/messages/inbox/${folderName}/`;
  const jsonFiles: string[] = allFilePaths.filter((fp) => {
    const lower = fp.toLowerCase();
    if (!lower.startsWith(prefix.toLowerCase())) return false;
    return lower.endsWith(".json") && lower.includes("message_");
  });

  if (jsonFiles.length === 0) {
    throw new Error(`No message_*.json found in subfolder: ${folderName}`);
  }

  let allMessages: any[] = [];
  for (const relativePath of jsonFiles) {
    const fileObj = zip.file(relativePath);
    if (!fileObj) continue;
    const fileStr = await fileObj.async("string");
    const parsed = JSON.parse(fileStr);

    const arr = parsed.messages || [];
    for (const m of arr) {
      allMessages.push({
        sender: m.sender_name || "Unknown",
        content: m.content || "",
        timestampMs: m.timestamp_ms || 0,
      });
    }
  }

  // sort ascending
  allMessages.sort((a, b) => a.timestampMs - b.timestampMs);

  // build lines
  const lines: string[] = allMessages.map((msg) => {
    const dt = new Date(msg.timestampMs);
    const formattedDate = formatDate(dt);
    const sender = (msg.sender || "").replace(/\n/g, " ");
    const content = (msg.content || "").replace(/\n/g, " ");
    return `[${formattedDate}] ${sender}: ${content}`;
  });

  const finalTxt = lines.join("\n");
  const localTxtPath = FileSystem.cacheDirectory + `instagram_${folderName}.txt`;
  await FileSystem.writeAsStringAsync(localTxtPath, finalTxt, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return localTxtPath;
}

function formatDate(dt: Date): string {
  const dd = pad(dt.getDate(), 2);
  const mm = pad(dt.getMonth() + 1, 2);
  const yyyy = dt.getFullYear();

  let hours = dt.getHours();
  const minutes = pad(dt.getMinutes(), 2);
  const seconds = pad(dt.getSeconds(), 2);

  const ampm = hours >= 12 ? "pm" : "am";
  if (hours === 0) {
    hours = 12;
  } else if (hours > 12) {
    hours -= 12;
  }

  return `${dd}/${mm}/${yyyy}, ${hours}:${minutes}:${seconds} ${ampm}`;
}

function pad(num: number, width: number) {
  const s = num.toString();
  return s.length >= width ? s : "0".repeat(width - s.length) + s;
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
