// File: utils/parseInstagram.ts
import * as FileSystem from "expo-file-system";

export interface ParsedMessage {
  user: string;
  text: string;
  date: Date;
}

/** Quick check if file/folder name might be from an Instagram export */
export function isInstagramExport(fileOrFolderName: string): boolean {
  return fileOrFolderName.toLowerCase().includes("instagram");
}

/** Example function to parse Instagram JSON messages in a folder */
export async function parseInstagramConversation(
  folderPath: string
): Promise<ParsedMessage[]> {
  const dirItems = await FileSystem.readDirectoryAsync(folderPath);
  const messageFileNames = dirItems.filter(
    (f) => f.startsWith("message_") && f.endsWith(".json")
  );

  let allParsed: ParsedMessage[] = [];

  for (const fileName of messageFileNames) {
    const fullPath = `${folderPath}/${fileName}`;
    const fileContents = await FileSystem.readAsStringAsync(fullPath, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const jsonData = JSON.parse(fileContents);

    const messagesArray = jsonData.messages || [];
    for (const msg of messagesArray) {
      const user = msg.sender_name || "Unknown";
      const content = msg.content || "";
      const timestampMs = msg.timestamp_ms || 0;
      const date = new Date(timestampMs);

      allParsed.push({
        user,
        text: content,
        date,
      });
    }
  }

  // Sort ascending
  allParsed.sort((a, b) => a.date.getTime() - b.date.getTime());
  return allParsed;
}
