// app/_layout.tsx
import React from "react";
import { Slot, useRouter } from "expo-router";
import { ShareIntentProvider, useShareIntent } from "expo-share-intent";

export default function RootLayout() {
  return (
    <ShareIntentProvider>
      <MainApp />
    </ShareIntentProvider>
  );
}

function MainApp() {
  const router = useRouter();
  const { hasShareIntent, shareIntent } = useShareIntent();

  React.useEffect(() => {
    if (hasShareIntent && shareIntent) {
      console.log("=== SHARE INTENT DETECTED ===");
      console.log(JSON.stringify(shareIntent, null, 2));

      if (shareIntent.files?.length) {
        const theFile = shareIntent.files[0];
        console.log("File path:", theFile.path);
        console.log("MIME type:", theFile.mimeType);

        // Navigate to /shared-file, providing path & mimeType
        router.push({
          pathname: "/shared-file",
          params: {
            path: theFile.path,
            mimeType: theFile.mimeType,
          },
        });
      } else if (shareIntent.text) {
        router.push({
          pathname: "/shared-text",
          params: {
            text: shareIntent.text,
          },
        });
      }
    }
  }, [hasShareIntent, shareIntent]);

  return <Slot />;
}
