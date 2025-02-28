// === C:\Users\samsn\OneDrive\Desktop\ChatRecapApp\ChatWrappedAI\app\shared-file\index.tsx ===
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  SafeAreaView,
} from "react-native";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import * as FileSystem from "expo-file-system";
import { Buffer } from "buffer";
import JSZip from "jszip";

export default function SharedFileScreen() {
  const router = useRouter();
  const { path, mimeType } = useLocalSearchParams<{ path?: string; mimeType?: string }>();

  const [status, setStatus] = React.useState("No file/folder shared yet.");
  const [loading, setLoading] = React.useState(false);
  const [hasHandledShare, setHasHandledShare] = React.useState(false);

  React.useEffect(() => {
    if (!hasHandledShare && path) {
      setHasHandledShare(true);
      handleIncomingShare(path as string);
    }
  }, [path, hasHandledShare]);

  async function handleIncomingShare(filePath: string) {
    console.log("=== handleIncomingShare called ===");
    console.log("filePath:", filePath);
    console.log("mimeType:", mimeType);

    try {
      setLoading(true);
      setStatus("Processing share... Please wait.");

      // 1) Copy from share location into cache
      let localPath = FileSystem.cacheDirectory + "sharedUserFile";
      console.log("Copying from =>", filePath, " to =>", localPath);
      await FileSystem.copyAsync({ from: filePath, to: localPath });

      // 2) Check if localPath is directory or file
      let info = await FileSystem.getInfoAsync(localPath);
      console.log("FileSystem.getInfoAsync(localPath) =>", info);

      if (!info.exists) {
        throw new Error("File/folder does not exist after copy.");
      }

      if (info.isDirectory) {
        console.log("Detected that localPath is a directory.");

        // --- If the directory is named .txt, rename ---
        if (localPath.toLowerCase().endsWith(".txt")) {
          const newLocalPath = localPath.replace(/\.txt$/i, "_DIR");
          console.log(`Renaming folder from .txt => ${newLocalPath}`);
          await FileSystem.moveAsync({
            from: localPath,
            to: newLocalPath,
          });
          localPath = newLocalPath;

          // Update 'info'
          info = await FileSystem.getInfoAsync(localPath);
          console.log("After rename, new info =>", info);
        }

        // For debug: see what's inside
        const topLevelItems = await FileSystem.readDirectoryAsync(localPath);
        console.log("Contents of localPath =>", topLevelItems);

        // Try pattern A: localPath has "messages/inbox"
        const directInbox = `${localPath}/messages/inbox`;
        const directInboxInfo = await FileSystem.getInfoAsync(directInbox);
        console.log("Trying directInbox =>", directInbox, directInboxInfo);

        if (directInboxInfo.exists && directInboxInfo.isDirectory) {
          console.log("Detected a valid export structure at top-level (messages/inbox).");
          setStatus("Detected folder with messages/inbox. Navigating to /instagram-select...");
          router.replace({
            pathname: "/instagram-select",
            params: { baseFolder: localPath },
          });
          return;
        }

        // Try pattern B: localPath/your_instagram_activity/messages/inbox
        const inboxInsta = `${localPath}/your_instagram_activity/messages/inbox`;
        const inboxInstaInfo = await FileSystem.getInfoAsync(inboxInsta);
        console.log("Trying pattern B (Instagram) =>", inboxInsta, inboxInstaInfo);

        if (inboxInstaInfo.exists && inboxInstaInfo.isDirectory) {
          console.log("Detected a valid Instagram export structure (pattern B).");
          setStatus("Detected Instagram folder. Navigating to /instagram-select...");
          router.replace({
            pathname: "/instagram-select",
            params: { baseFolder: `${localPath}/your_instagram_activity` },
          });
          return;
        }

        // Try pattern C: localPath/your_facebook_activity/messages/inbox
        const inboxFb = `${localPath}/your_facebook_activity/messages/inbox`;
        const inboxFbInfo = await FileSystem.getInfoAsync(inboxFb);
        console.log("Trying pattern C (Facebook) =>", inboxFb, inboxFbInfo);

        if (inboxFbInfo.exists && inboxFbInfo.isDirectory) {
          console.log("Detected a valid Facebook export structure (pattern C).");
          setStatus("Detected Facebook folder. Navigating to /instagram-select...");
          router.replace({
            pathname: "/instagram-select",
            params: { baseFolder: `${localPath}/your_facebook_activity` },
          });
          return;
        }

        // If no luck, show error
        console.log("No valid messages/inbox found in any pattern.");
        setStatus(
          "No `messages/inbox` found. Not a recognized Instagram/Facebook export."
        );
      } else {
        // It's a file, not a directory
        console.log("Detected that localPath is a file, not a directory.");

        // If the file is .txt or text => analysis
        if (
          localPath.toLowerCase().endsWith(".txt") ||
          (mimeType && mimeType.includes("text"))
        ) {
          console.log("Looks like a .txt file. Navigating to analysis...");
          setStatus("Detected a .txt file. Navigating to analysis...");
          router.replace({
            pathname: "/(tabs)/analysis",
            params: {
              fileUri: localPath + "?ts=" + Date.now(),
            },
          });
          return;
        }

        // If the file is zip => unzip
        if (mimeType && mimeType.includes("zip")) {
          console.log("Looks like a zip file. Attempting to unzip...");
          setStatus("Unzipping...");

          const zipBase64 = await FileSystem.readAsStringAsync(localPath, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const zipData = Buffer.from(zipBase64, "base64");
          const jsZip = new JSZip();
          const unzipped = await jsZip.loadAsync(zipData);

          const allFiles = Object.keys(unzipped.files);
          console.log("Files inside ZIP =>", allFiles);

          const txtName = allFiles.find((f) => f.endsWith(".txt"));
          if (!txtName) {
            throw new Error("No .txt found in the zip.");
          }

          const txtFile = unzipped.file(txtName);
          if (!txtFile) {
            throw new Error("No file found in ZIP contents.");
          }

          const txtContent = await txtFile.async("string");
          const finalTextPath = FileSystem.cacheDirectory + "unzippedChat.txt";
          console.log("Writing unzipped txt =>", finalTextPath);
          await FileSystem.writeAsStringAsync(finalTextPath, txtContent, {
            encoding: FileSystem.EncodingType.UTF8,
          });

          setStatus("Unzipped .txt found. Navigating to analysis...");
          router.replace({
            pathname: "/(tabs)/analysis",
            params: {
              fileUri: finalTextPath + "?ts=" + Date.now(),
            },
          });
          return;
        }

        // Otherwise fallback
        console.log("File is neither .txt nor .zip. We'll attempt to analyze anyway.");
        setStatus("Warning: not recognized as zip or text. We'll proceed...");
        router.replace({
          pathname: "/(tabs)/analysis",
          params: {
            fileUri: localPath + "?ts=" + Date.now(),
          },
        });
      }
    } catch (err: any) {
      console.log("Error in handleIncomingShare:", err);
      Alert.alert("Error reading shared file/folder:", err.message);
      setStatus(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ff69b4" />
        <Text style={styles.loadingText}>{status}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: "" }} />
      <Text style={styles.title}>{status}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff5f7",
  },
  loadingText: {
    marginTop: 10,
    color: "#333",
    fontSize: 16,
    textAlign: "center",
  },
  container: {
    flex: 1,
    backgroundColor: "#fff5f7",
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 15,
    fontStyle: "italic",
    color: "#333",
    marginBottom: 10,
    textAlign: "center",
  },
});
