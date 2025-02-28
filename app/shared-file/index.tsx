import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  FlatList,
  Platform,
  SafeAreaView,
} from "react-native";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import * as FileSystem from "expo-file-system";
import { Buffer } from "buffer";
import { inflate } from "pako"; // For manual zlib inflate on Android

export default function SharedFileScreen() {
  const router = useRouter();
  const { path, mimeType } = useLocalSearchParams<{ path?: string; mimeType?: string }>();

  const [status, setStatus] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [hasHandledShare, setHasHandledShare] = React.useState(false);

  // Local path to the shared .zip
  const [localZipPath, setLocalZipPath] = React.useState<string | null>(null);

  // We'll store subfolders as objects so we can show a "displayName"
  const [inboxFolders, setInboxFolders] = React.useState<Array<{ fullName: string; displayName: string }>>([]);
  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null);

  React.useEffect(() => {
    // Only handle the share once
    if (!hasHandledShare && path) {
      setHasHandledShare(true);
      handleIncomingShare(path as string, mimeType || "");
    }
  }, [path, mimeType, hasHandledShare]);

  async function handleIncomingShare(filePath: string, mime: string) {
    try {
      setLoading(true);
      setStatus("Hang on, processing... Please do not close.");

      // 1) Copy from share location to local cache
      const localPath = FileSystem.cacheDirectory + "sharedFile.zip";
      await FileSystem.copyAsync({ from: filePath, to: localPath });
      setLocalZipPath(localPath);

      // 2) List all filenames from the ZIP central directory
      const allFilePaths = await listZipFilenamesCentralDir(localPath);

      // 3) Filter for subfolders in "your_instagram_activity/messages/inbox"
      const normalizedInbox = "your_instagram_activity/messages/inbox".toLowerCase();
      const folderSet = new Set<string>();
      for (const f of allFilePaths) {
        const lowerF = f.toLowerCase();
        const idx = lowerF.indexOf(normalizedInbox);
        if (idx >= 0) {
          // substring after inbox/
          const after = f.substring(idx + normalizedInbox.length + 1);
          if (after) {
            const slashPos = after.indexOf("/");
            const folderName = slashPos >= 0 ? after.substring(0, slashPos) : after;
            // skip if it has a '.' => likely a file
            if (folderName && !folderName.includes(".")) {
              folderSet.add(folderName);
            }
          }
        }
      }

      // 4) If we *did find* Instagram conversation folders
      if (folderSet.size > 0) {
        setStatus("Select the conversation you want to import, then tap Confirm below.");
        // Build array of {fullName, displayName}
        const folderArray = Array.from(folderSet).map((f) => {
          // e.g. "advait_129312942935834" => "advait"
          const display = f.replace(/_[0-9]+$/, "");
          return { fullName: f, displayName: display };
        });
        setInboxFolders(folderArray);
        return;
      }

      // 5) Otherwise, fallback: check if there's at least one .txt in the zip
      const txtFiles = allFilePaths.filter((f) => f.toLowerCase().endsWith(".txt"));
      if (txtFiles.length === 0) {
        setStatus(
          "No conversation folders found in your Instagram export, and no .txt file found either."
        );
        return;
      }

      // For simplicity, just process the FIRST .txt we find
      setStatus("Found a .txt in the .zip. Converting it for analysis...");

      if (Platform.OS === "ios") {
        // iOS approach: read entire zip with JSZip and extract the .txt
        const outPath = await extractTxt_iOS(localPath, txtFiles[0]);
        navigateToAnalysis(outPath);
      } else {
        // Android partial approach: read the single .txt from central directory
        const cdEntries = await parseCentralDirectory(localPath);
        // Find the corresponding entry
        const entry = cdEntries.find(
          (e) => e.fileName.toLowerCase() === txtFiles[0].toLowerCase()
        );
        if (!entry) {
          setStatus("Could not find local header for the .txt file in the zip.");
          return;
        }
        const fileTxt = await readAndInflateOneFile(localPath, entry);
        if (!fileTxt) {
          setStatus("Failed reading the .txt from the zip.");
          return;
        }
        const outPath = FileSystem.cacheDirectory + "sharedWhatsapp.txt";
        await FileSystem.writeAsStringAsync(outPath, fileTxt, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        navigateToAnalysis(outPath);
      }
    } catch (err: any) {
      console.error("Error reading shared .zip:", err);
      setStatus(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  function navigateToAnalysis(fileUri: string) {
    // Move to your analysis screen, passing the local .txt path
    router.replace({
      pathname: "/(tabs)/analysis",
      params: {
        fileUri: fileUri + "?ts=" + Date.now(),
      },
    });
  }

  function handleSelectSubfolder(index: number) {
    setSelectedIndex(index);
  }

  async function handleConfirm() {
    try {
      if (selectedIndex == null) {
        Alert.alert("Please select a conversation folder first.");
        return;
      }
      if (!localZipPath) {
        Alert.alert("Missing local zip path.");
        return;
      }
      const chosenFolder = inboxFolders[selectedIndex];
      setLoading(true);
      setStatus("Hang on, processing... Please do not close.");

      let txtPath: string;
      if (Platform.OS === "ios") {
        // iOS: read entire zip into memory, parse with JSZip
        txtPath = await convertSubfolderToWhatsAppTxt_iOSStyle(localZipPath, chosenFolder.fullName);
      } else {
        // Android: partial read + manual inflate
        txtPath = await convertSubfolderToWhatsAppTxt_Android(localZipPath, chosenFolder.fullName);
      }

      router.replace({
        pathname: "/(tabs)/analysis",
        params: {
          fileUri: txtPath + "?ts=" + Date.now(),
        },
      });
    } catch (err: any) {
      console.error("Error converting folder:", err);
      setStatus(`Error: ${err.message}`);
      setLoading(false);
    }
  }

  if (loading) {
    // Centered loader with generic text
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

      {/* If we *did* find Instagram subfolders, display them */}
      {inboxFolders.length > 0 && (
        <>
          <FlatList
            data={inboxFolders}
            keyExtractor={(item) => item.fullName}
            renderItem={({ item, index }) => {
              const isSelected = index === selectedIndex;
              return (
                <TouchableOpacity
                  style={[styles.folderRow, isSelected && styles.folderRowSelected]}
                  onPress={() => handleSelectSubfolder(index)}
                >
                  <Text style={styles.folderText}>{item.displayName}</Text>
                </TouchableOpacity>
              );
            }}
            style={{ marginVertical: 16 }}
          />

          <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
            <Text style={styles.confirmButtonText}>Confirm</Text>
          </TouchableOpacity>
        </>
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------
//  (A) PARTIAL READ: Get all filenames from central directory.
// ---------------------------------------------------------------------
async function listZipFilenamesCentralDir(zipFileUri: string): Promise<string[]> {
  const info = await FileSystem.getInfoAsync(zipFileUri);
  if (!info.exists) throw new Error("Zip file not found at " + zipFileUri);
  const { size } = info;

  // We'll read the last 128KB to find the End Of Central Directory
  const readSize = Math.min(128 * 1024, size);
  const startPos = size - readSize;
  const tailBase64 = await FileSystem.readAsStringAsync(zipFileUri, {
    encoding: FileSystem.EncodingType.Base64,
    position: startPos,
    length: readSize,
  });
  const tailBytes = base64ToBytes(tailBase64);

  // EOCD signature = 0x50, 0x4B, 0x05, 0x06
  const eocdSig = [0x50, 0x4b, 0x05, 0x06];
  let eocdPos = -1;
  for (let i = tailBytes.length - 4; i >= 0; i--) {
    if (
      tailBytes[i] === eocdSig[0] &&
      tailBytes[i + 1] === eocdSig[1] &&
      tailBytes[i + 2] === eocdSig[2] &&
      tailBytes[i + 3] === eocdSig[3]
    ) {
      eocdPos = i;
      break;
    }
  }
  if (eocdPos < 0) throw new Error("Couldn't find EOCD in the zip.");

  // parse out size & offset of central directory
  const sizeOfCD = readUInt32LE(tailBytes, eocdPos + 12);
  const offsetOfCD = readUInt32LE(tailBytes, eocdPos + 16);

  // read the entire central directory (limit ~2MB)
  const maxCD = Math.min(sizeOfCD, 2 * 1024 * 1024);
  if (sizeOfCD > maxCD) {
    throw new Error("Central directory >2MB, not supported in this example.");
  }
  const cdBase64 = await FileSystem.readAsStringAsync(zipFileUri, {
    encoding: FileSystem.EncodingType.Base64,
    position: offsetOfCD,
    length: sizeOfCD,
  });
  const cdBytes = base64ToBytes(cdBase64);

  const filePaths: string[] = [];
  let pos = 0;
  while (pos + 4 < cdBytes.length) {
    // central file header signature = 0x50, 0x4B, 0x01, 0x02
    if (
      cdBytes[pos] === 0x50 &&
      cdBytes[pos + 1] === 0x4b &&
      cdBytes[pos + 2] === 0x01 &&
      cdBytes[pos + 3] === 0x02
    ) {
      const fileNameLen = readUInt16LE(cdBytes, pos + 28);
      const extraLen = readUInt16LE(cdBytes, pos + 30);
      const commentLen = readUInt16LE(cdBytes, pos + 32);
      const fileNameStart = pos + 46;
      const fileNameEnd = fileNameStart + fileNameLen;
      if (fileNameEnd > cdBytes.length) break;

      const fnBytes = cdBytes.slice(fileNameStart, fileNameEnd);
      const fnStr = utf8Decode(fnBytes);
      filePaths.push(fnStr);

      pos = fileNameEnd + extraLen + commentLen;
    } else {
      pos++;
    }
  }
  return filePaths;
}

// ---------------------------------------------------------------------
//  (B1) iOS approach: read entire zip => parse with JSZip => gather .txt
// ---------------------------------------------------------------------
async function extractTxt_iOS(zipPath: string, txtRelativePath: string) {
  // 1) read entire zip as base64
  const b64 = await FileSystem.readAsStringAsync(zipPath, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // 2) parse with JSZip
  const JSZip = require("jszip");
  const arrBuf = base64ToArrayBuffer(b64);
  const zip = await JSZip.loadAsync(arrBuf);

  // 3) get the .txt file
  const fileObj = zip.file(txtRelativePath);
  if (!fileObj) {
    throw new Error("No matching .txt file found inside the zip for: " + txtRelativePath);
  }
  const txtContent = await fileObj.async("string");

  // 4) write it out to local cache
  const outPath = FileSystem.cacheDirectory + "sharedWhatsapp_iOS.txt";
  await FileSystem.writeAsStringAsync(outPath, txtContent, { encoding: FileSystem.EncodingType.UTF8 });
  return outPath;
}

// ---------------------------------------------------------------------
//  (B2) ANDROID partial approach: parse only the needed .txt
// ---------------------------------------------------------------------
async function convertSubfolderToWhatsAppTxt_Android(zipPath: string, folderName: string) {
  // 1) read central directory again (to find local file headers for message_*.json).
  const allFilePaths = await listZipFilenamesCentralDir(zipPath);
  const prefix = `your_instagram_activity/messages/inbox/${folderName}/`.toLowerCase();

  // We'll gather each file that starts with prefix and ends with message_x.json
  const relevantFiles = allFilePaths.filter(
    (f) =>
      f.toLowerCase().startsWith(prefix) &&
      f.toLowerCase().includes("message_") &&
      f.toLowerCase().endsWith(".json")
  );
  if (!relevantFiles.length) {
    throw new Error(`No message_*.json found in folder "${folderName}".`);
  }

  const cdEntries = await parseCentralDirectory(zipPath);
  const messages: Array<{ sender: string; content: string; timestampMs: number }> = [];

  for (const relPath of relevantFiles) {
    const entry = cdEntries.find((e) => e.fileName === relPath);
    if (!entry) continue;

    const fileJsonStr = await readAndInflateOneFile(zipPath, entry);
    if (!fileJsonStr) continue;
    const parsed = JSON.parse(fileJsonStr);
    const arr = parsed.messages || [];
    for (const m of arr) {
      messages.push({
        sender: m.sender_name || "Unknown",
        content: m.content || "",
        timestampMs: m.timestamp_ms || 0,
      });
    }
  }

  // 3) sort by ascending timestamp
  messages.sort((a, b) => a.timestampMs - b.timestampMs);

  const lines = messages.map((m) => {
    const dt = new Date(m.timestampMs);
    return `[${formatDate(dt)}] ${m.sender.replace(/\n/g, " ")}: ${m.content.replace(/\n/g, " ")}`;
  });
  const finalTxt = lines.join("\n");

  // 4) write to cache
  const outPath = FileSystem.cacheDirectory + `ig_android_${folderName}.txt`;
  await FileSystem.writeAsStringAsync(outPath, finalTxt, { encoding: FileSystem.EncodingType.UTF8 });
  return outPath;
}

// ---------------------------------------------------------------------
//  (C1) iOS approach: read entire .zip => parse with JSZip => gather needed message_*.json
// ---------------------------------------------------------------------
async function convertSubfolderToWhatsAppTxt_iOSStyle(zipPath: string, folderName: string) {
  // 1) read entire zip as base64
  const b64 = await FileSystem.readAsStringAsync(zipPath, {
    encoding: FileSystem.EncodingType.Base64,
  });
  // 2) parse with JSZip
  const JSZip = require("jszip");
  const arrBuf = base64ToArrayBuffer(b64);
  const zip = await JSZip.loadAsync(arrBuf);

  // 3) gather `message_*.json` from that subfolder
  const prefix = `your_instagram_activity/messages/inbox/${folderName}/`;
  const allPaths = Object.keys(zip.files);
  const msgFiles = allPaths.filter(
    (fp) => fp.startsWith(prefix) && fp.toLowerCase().includes("message_") && fp.endsWith(".json")
  );
  if (!msgFiles.length) {
    throw new Error(`No message_*.json found in folder "${folderName}".`);
  }

  // 4) parse & combine
  let messages: Array<{ sender: string; content: string; timestampMs: number }> = [];
  for (const p of msgFiles) {
    const fileObj = zip.file(p);
    if (!fileObj) continue;
    const jsonStr = await fileObj.async("string");
    const parsed = JSON.parse(jsonStr);
    const arr = parsed.messages || [];
    for (const m of arr) {
      messages.push({
        sender: m.sender_name || "Unknown",
        content: m.content || "",
        timestampMs: m.timestamp_ms || 0,
      });
    }
  }
  messages.sort((a, b) => a.timestampMs - b.timestampMs);

  // 5) build lines and write .txt
  const lines = messages.map((m) => {
    const dt = new Date(m.timestampMs);
    return `[${formatDate(dt)}] ${m.sender.replace(/\n/g, " ")}: ${m.content.replace(/\n/g, " ")}`;
  });
  const txtContent = lines.join("\n");
  const outPath = FileSystem.cacheDirectory + `ig_${folderName}.txt`;
  await FileSystem.writeAsStringAsync(outPath, txtContent, { encoding: FileSystem.EncodingType.UTF8 });
  return outPath;
}

// ---------------------------------------------------------------------
// (D) parseCentralDirectory => returns each entry: { fileName, ...offset }
// ---------------------------------------------------------------------
interface CentralDirEntry {
  fileName: string;
  versionMade: number;
  versionNeeded: number;
  flags: number;
  compressionMethod: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

async function parseCentralDirectory(zipPath: string): Promise<CentralDirEntry[]> {
  const info = await FileSystem.getInfoAsync(zipPath);
  if (!info.exists) throw new Error("File not found: " + zipPath);
  const { size } = info;

  const tailSize = Math.min(128 * 1024, size);
  const tailStart = size - tailSize;
  const tailB64 = await FileSystem.readAsStringAsync(zipPath, {
    encoding: FileSystem.EncodingType.Base64,
    position: tailStart,
    length: tailSize,
  });
  const tailBytes = base64ToBytes(tailB64);

  let eocdPos = -1;
  for (let i = tailBytes.length - 4; i >= 0; i--) {
    if (tailBytes[i] === 0x50 && tailBytes[i + 1] === 0x4b && tailBytes[i + 2] === 0x05 && tailBytes[i + 3] === 0x06) {
      eocdPos = i;
      break;
    }
  }
  if (eocdPos < 0) throw new Error("EOCD not found.");

  const sizeOfCD = readUInt32LE(tailBytes, eocdPos + 12);
  const offsetOfCD = readUInt32LE(tailBytes, eocdPos + 16);
  const maxCD = Math.min(sizeOfCD, 2 * 1024 * 1024);
  if (sizeOfCD > maxCD) {
    throw new Error("Central directory >2MB, not supported in partial read demo.");
  }

  const cdB64 = await FileSystem.readAsStringAsync(zipPath, {
    encoding: FileSystem.EncodingType.Base64,
    position: offsetOfCD,
    length: sizeOfCD,
  });
  const cdBytes = base64ToBytes(cdB64);

  const entries: CentralDirEntry[] = [];
  let pos = 0;
  while (pos + 4 < cdBytes.length) {
    if (cdBytes[pos] === 0x50 && cdBytes[pos + 1] === 0x4b && cdBytes[pos + 2] === 0x01 && cdBytes[pos + 3] === 0x02) {
      const versionMade = readUInt16LE(cdBytes, pos + 4);
      const versionNeeded = readUInt16LE(cdBytes, pos + 6);
      const flags = readUInt16LE(cdBytes, pos + 8);
      const method = readUInt16LE(cdBytes, pos + 10);
      const crc32 = readUInt32LE(cdBytes, pos + 16);
      const cSize = readUInt32LE(cdBytes, pos + 20);
      const uSize = readUInt32LE(cdBytes, pos + 24);
      const fnLen = readUInt16LE(cdBytes, pos + 28);
      const extraLen = readUInt16LE(cdBytes, pos + 30);
      const commentLen = readUInt16LE(cdBytes, pos + 32);
      const lho = readUInt32LE(cdBytes, pos + 42);

      const fileNameStart = pos + 46;
      const fileNameEnd = fileNameStart + fnLen;
      if (fileNameEnd > cdBytes.length) break;

      const nameBytes = cdBytes.slice(fileNameStart, fileNameEnd);
      const fileName = utf8Decode(nameBytes);

      entries.push({
        fileName,
        versionMade,
        versionNeeded,
        flags,
        compressionMethod: method,
        crc32,
        compressedSize: cSize,
        uncompressedSize: uSize,
        localHeaderOffset: lho,
      });

      pos = fileNameEnd + extraLen + commentLen;
    } else {
      pos++;
    }
  }

  return entries;
}

// ---------------------------------------------------------------------
// read & inflate one file given a central directory entry
// ---------------------------------------------------------------------
async function readAndInflateOneFile(zipPath: string, entry: CentralDirEntry): Promise<string | null> {
  if (entry.compressionMethod !== 8 && entry.compressionMethod !== 0) {
    console.warn("Unsupported compression method for file:", entry.fileName);
    return null;
  }

  const LFH_SIZE = 30; // local file header size
  const localHeaderB64 = await FileSystem.readAsStringAsync(zipPath, {
    encoding: FileSystem.EncodingType.Base64,
    position: entry.localHeaderOffset,
    length: 200,
  });
  const lfhBytes = base64ToBytes(localHeaderB64);

  // local file header signature check
  if (lfhBytes[0] !== 0x50 || lfhBytes[1] !== 0x4b || lfhBytes[2] !== 0x03 || lfhBytes[3] !== 0x04) {
    console.warn("Local file header signature not found for:", entry.fileName);
    return null;
  }

  const localFileNameLen = readUInt16LE(lfhBytes, 26);
  const localExtraLen = readUInt16LE(lfhBytes, 28);
  const localHeaderTotal = LFH_SIZE + localFileNameLen + localExtraLen;

  const dataStart = entry.localHeaderOffset + localHeaderTotal;
  const compressedB64 = await FileSystem.readAsStringAsync(zipPath, {
    encoding: FileSystem.EncodingType.Base64,
    position: dataStart,
    length: entry.compressedSize,
  });
  const compressedBytes = base64ToBytes(compressedB64);

  let uncompressed: Uint8Array;
  if (entry.compressionMethod === 0) {
    // no compression
    uncompressed = compressedBytes;
  } else {
    // deflate
    uncompressed = inflate(compressedBytes);
  }

  const decoder = new TextDecoder("utf-8");
  return decoder.decode(uncompressed);
}

// -------------------------------------
// HELPER: minimal date formatting
// -------------------------------------
function formatDate(dt: Date): string {
  const dd = pad(dt.getDate());
  const mm = pad(dt.getMonth() + 1);
  const yyyy = dt.getFullYear();
  let hh = dt.getHours();
  const min = pad(dt.getMinutes());
  const sec = pad(dt.getSeconds());
  const ampm = hh >= 12 ? "pm" : "am";
  if (hh === 0) hh = 12;
  else if (hh > 12) hh -= 12;
  return `${dd}/${mm}/${yyyy}, ${hh}:${min}:${sec} ${ampm}`;
}

function pad(num: number, width = 2) {
  const s = num.toString();
  return s.length >= width ? s : "0".repeat(width - s.length) + s;
}

// -------------------------------------
// HELPER: base64 => ArrayBuffer
// -------------------------------------
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = global.atob
    ? global.atob(base64)
    : Buffer.from(base64, "base64").toString("binary");
  const length = binaryString.length;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// -------------------------------------
// HELPER: base64 => Uint8Array
// -------------------------------------
function base64ToBytes(base64: string): Uint8Array {
  return new Uint8Array(base64ToArrayBuffer(base64));
}

// -------------------------------------
// HELPER: readUInt16LE, readUInt32LE
// -------------------------------------
function readUInt16LE(buf: Uint8Array, off: number) {
  return buf[off] | (buf[off + 1] << 8);
}
function readUInt32LE(buf: Uint8Array, off: number) {
  return (
    buf[off] |
    (buf[off + 1] << 8) |
    (buf[off + 2] << 16) |
    (buf[off + 3] << 24)
  );
}

// -------------------------------------
// HELPER: basic ASCII decode
// -------------------------------------
function utf8Decode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

// -------------------------------------
// STYLES
// -------------------------------------
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
    paddingTop: 60, // helps avoid the camera notch
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 15,
    fontStyle: "italic",
    color: "#333",
    marginBottom: 10,
    textAlign: "center",
  },
  folderRow: {
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  folderRowSelected: {
    backgroundColor: "#ffeef5",
    borderColor: "#ff69b4",
    borderWidth: 1,
  },
  folderText: {
    fontSize: 15,
    color: "#333",
  },
  confirmButton: {
    backgroundColor: "#ff69b4",
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 25,
    alignSelf: "center",
  },
  confirmButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
