import { deleteMobileUserAvatar, postMobileUserAvatar } from "@/lib/mobileSettingsApi";

function isNativeModuleMissingError(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /cannot find native module|native module.*not found|ExponentImagePicker|expoimagepicker/i.test(m);
}

function wrapImagePickerError(e: unknown): Error {
  if (isNativeModuleMissingError(e)) {
    return new Error(
      "Photo picker is not available in this build. From the repo run:\n" +
        "  cd apps/mobile && npx expo run:ios\n" +
        "so native modules link, then open this app again (not an old install).",
    );
  }
  return e instanceof Error ? e : new Error(String(e));
}

/**
 * Pick from the library, then upload via the same Next route family as the web app
 * (`POST /api/mobile/user/avatar` ↔ web `POST /api/user/avatar`): `avatars/{userId}/avatar.jpg`
 * and `profiles.avatar_url`.
 *
 * `expo-image-picker` is loaded only when the user taps “change photo”, so missing native
 * code does not crash the whole app on startup.
 */
function loadImagePicker(): typeof import("expo-image-picker") {
  try {
    // Deferred so a broken native install does not crash the app until the user opens the picker.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-image-picker") as typeof import("expo-image-picker");
  } catch (e) {
    throw wrapImagePickerError(e);
  }
}

export async function pickAndUploadProfileAvatar(accessToken: string): Promise<string> {
  const ImagePicker = loadImagePicker();

  try {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      throw new Error("Photo library access was denied.");
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });

    if (picked.canceled || !picked.assets[0]?.uri) {
      throw new Error("Canceled");
    }

    const asset = picked.assets[0];
    const res = await fetch(asset.uri);
    const buf = await res.arrayBuffer();

    return await postMobileUserAvatar(accessToken, buf, "avatar");
  } catch (e) {
    if (e instanceof Error && e.message === "Canceled") throw e;
    throw wrapImagePickerError(e);
  }
}

export async function clearProfileAvatar(accessToken: string): Promise<void> {
  await deleteMobileUserAvatar(accessToken);
}
