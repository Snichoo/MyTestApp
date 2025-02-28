// File: app/chat-import.tsx

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

export default function ChatImportScreen() {
  const { uri } = useLocalSearchParams<{ uri?: string }>();
  const router = useRouter();
  const [status, setStatus] = useState("Waiting for share...");

  useEffect(() => {
    if (!uri) {
      setStatus("No .zip URI provided.");
      return;
    }
    // Process the .zip from the share
    listZipContents(uri);
  }, [uri]);

  async function listZipContents(zipUri: string) {
    try {
      setStatus(`Received .zip from: ${zipUri}`);

      // 1) Copy the zip file from the provided URI to local cache
      const localZipPath = FileSystem.cacheDirectory + "tempWhatsApp.zip";
      await FileSystem.copyAsync({ from: zipUri, to: localZipPath });
      setStatus(`Copied to: ${localZipPath} - Now loading zip in memory...`);

      // 2) Read the .zip into an ArrayBuffer
      const arrayBuffer = await fetchLocalFileAsArrayBuffer(localZipPath);
      setStatus("Parsing zip structure in memory...");
      const zip = await JSZip.loadAsync(arrayBuffer);

      // 3) List all entries
      const zipEntries = Object.keys(zip.files);
      setStatus(`Found ${zipEntries.length} entries in the zip.`);

      // 4) Check for Instagram export structure
      const inboxIndicator = "/your_instagram_activity/messages/inbox";
      const foundInstagram = zipEntries.some(fp => fp.toLowerCase().includes(inboxIndicator));
      if (foundInstagram) {
        setStatus("Detected Instagram export. Navigating to instagram-select...");
        router.push({
          pathname: "/instagram-select",
          params: { zipBase64: "NOT_USED_ANYMORE" },
        });
        return;
      }

      // 5) Otherwise, try to find a .txt
      const txtEntry = zipEntries.find((fp) => fp.toLowerCase().endsWith(".txt"));
      if (!txtEntry) {
        setStatus("No .txt found, and not an Instagram export.");
        return;
      }

      setStatus(`Found a .txt file at: ${txtEntry}`);
      // If needed, you can further read/convert the .txt or navigate to analysis, etc.
      // For example:
      // const fileObj = zip.file(txtEntry);
      // const txtContent = await fileObj.async("string");
      // Then write it to a local path and navigate to analysis...
      
      // Example just to show you can navigate:
      /*
      const localTxtPath = FileSystem.cacheDirectory + "mySharedTxt.txt";
      await FileSystem.writeAsStringAsync(localTxtPath, txtContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      router.push({
        pathname: "/(tabs)/analysis",
        params: { fileUri: localTxtPath + "?ts=" + Date.now() },
      });
      */
    } catch (error: any) {
      setStatus(`Error: ${error.message}`);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>Chat Import</Text>
      <Text style={styles.status}>{status}</Text>

      {/* Demo button - you can remove or replace as needed */}
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
