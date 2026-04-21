# Bacup mobile (Expo)

Cross-platform **iOS** and **Android** client that uses the **same Supabase project** as the Next.js web app. Tasks, events, meeting notes, and connected accounts are read/written against the identical tables and RLS policies, so data stays aligned with the web UI.

## Tabs

1. **Overview** — KPI tiles (overdue, due today, follow-ups, priorities) from `tasks`.
2. **Meetings** — Parent rows in `notes` with `type = 'meeting'` (same source as the web Meetings scratchpad view).
3. **Consolidated** — Pending workload plus assignee grouping.
4. **Calendar** — `events` table, grouped by date.
5. **Connected email** — `user_connected_accounts` (Integrations parity).
6. **Settings** — Account email, light/dark theme (device), sign out.

## Sync model

- **Auth**: Email + password via Supabase Auth (same users as web).
- **Data**: `@supabase/supabase-js` with `AsyncStorage` session persistence.
- **Live updates**: Subscriptions on `tasks` and `events` for the signed-in `user_id` (requires **Realtime** enabled for those tables in the Supabase dashboard). If Realtime is off, pull-to-refresh and app foreground still refresh lists.

## Run

From your machine, **go to the Bacup repo root first** (the folder that contains `apps/` and `package.json` for the Next.js app). Example:

```bash
cd ~/Desktop/bacup2
```

Then:

```bash
cd apps/mobile
cp .env.example .env
```

Open `apps/mobile/.env` in an editor and set **two lines** (same values as the web app’s `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`):

```bash
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
EXPO_PUBLIC_APP_URL=https://your-next-app.example.com
```

`EXPO_PUBLIC_APP_URL` is the **Next.js site origin** (no trailing slash), e.g. production `https://www.thebacup.com` or local `http://192.168.1.10:3000` so the mobile **Meetings → mic** flow can call `/api/mobile/meetings/session/stop` with your Supabase session token. Deploy the web app with that route before relying on recording on a physical device.

**Meetings microphone** uses native speech recognition (`expo-speech-recognition`). If Expo Go does not load the module, create a **development build** (`npx expo prebuild` / EAS) so the config plugins in `app.config.ts` apply.

Install and start (must be run **inside** `apps/mobile`, where this folder’s `package.json` lives):

```bash
npm install
npx expo start
```

Then press `i` for iOS simulator or `a` for Android emulator, or scan the QR code with Expo Go.

**If `cd apps/mobile` says “no such file”:** you are not in the repo root, or this branch does not include the mobile app yet — run `git pull` in the repo, or clone/open the correct project folder.

## Shell: `permission denied` on a path

You must **change directory** with `cd`. A line that is only a path (no `cd`) makes zsh try to **run** that path as a program, which fails for a folder:

```bash
# Wrong — tries to execute the directory
~/Desktop/bacup2/apps/mobile

# Right
cd ~/Desktop/bacup2/apps/mobile
```

## iOS simulator: `xcrun` / `simctl` / exit code 69

That comes from **Xcode / Command Line Tools**, not from this repo. Fix it on the Mac, then press `i` again:

1. Install **Xcode** from the App Store (full app), **or** only tools:  
   `xcode-select --install`
2. Point the active developer directory at Xcode (adjust if your Xcode path differs):

   ```bash
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   ```

3. Accept the license (if prompted):  
   `sudo xcodebuild -license accept`
4. If Apple docs suggest it:  
   `sudo xcode-select --reset`  
   then set `-s` again as in step 2.

**Without fixing Xcode:** use a **physical iPhone** — install **Expo Go** from the App Store and scan the QR code from the terminal (same Wi‑Fi as your Mac). Android: Expo Go on the phone and scan the QR.

## Android emulator: `ANDROID_HOME`, `adb ENOENT`

Expo needs the **Android SDK** (includes **`adb`**). If you see:

- `Failed to resolve the Android SDK path` … `/Users/.../Library/Android/sdk`
- `Error: spawn adb ENOENT`

then the SDK is missing or not pointed to by **`ANDROID_HOME`**.

### Option A — Install the SDK (recommended for emulator)

1. Install **Android Studio** from [developer.android.com/studio](https://developer.android.com/studio).
2. Open Android Studio → **Settings / Preferences** → **Languages & Frameworks** → **Android SDK** and note **Android SDK Location** (often `~/Library/Android/sdk` on macOS after a full install).
3. In the **SDK Tools** tab, ensure **Android SDK Platform-Tools** is checked (this installs `adb`).
4. Export the path in your shell (zsh example — adjust the path if your SDK location differs):

   ```bash
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
   ```

   Add those lines to `~/.zshrc`, run `source ~/.zshrc`, then start a new terminal and run `npx expo start` again.

5. Create/start an AVD in Android Studio (**Device Manager**), then press `a` in the Expo terminal.

### Option B — Physical Android, no local SDK

Install **Expo Go** from the Play Store, run `npx expo start`, and scan the QR code (phone and computer on the same Wi‑Fi). You do **not** need `ANDROID_HOME` for that workflow.

## Port already in use (8081)

If Metro says another process is using the port, choose **Y** to use 8082, or quit the other Expo/Metro window (`Ctrl+C` there), then start again.

## Package version warning (React Native)

If Expo warns that `react-native` should be a specific patch version, run **inside `apps/mobile`**:

```bash
npx expo install react-native
```

That aligns versions with your installed Expo SDK.

## OAuth / Gmail

Connecting Google/Microsoft is still done most reliably in the **web** app (OAuth redirect). This mobile build focuses on **read-mostly** parity for accounts and full parity for tasks/events/notes that RLS already exposes to the user session.
