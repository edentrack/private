# Capacitor mobile shell — setup guide

This doc is the **step-by-step you run on your laptop** to ship the Edentrack
web app to the App Store and Google Play. The web app already works inside
Capacitor — what you do here is the native bits that have to happen on your
machine with your Apple ID.

Throughout: 🤖 = Claude already did this, 👤 = only you can do.

---

## What's already in place (🤖)

- Capacitor + plugins installed (`@capacitor/core`, `@capacitor/ios`,
  `@capacitor/android`, push, camera, status-bar, splash-screen,
  preferences, network, share)
- `capacitor.config.ts` with bundle ID `app.edentrack`, app name "Edentrack"
- `src/lib/capacitorPush.ts` — native push registration, sends APNs/FCM
  tokens to Supabase. No-ops on the web.
- `src/lib/capacitorCamera.ts` — native camera helper for Eden photo
  diagnosis. Falls back to web `<input type="file">` on the browser.
- `src/main.tsx` wired: native init only fires inside the Capacitor shell;
  service worker only registers on the web build
- npm scripts: `mobile:build`, `mobile:ios`, `mobile:android`,
  `mobile:livereload:ios`, `mobile:livereload:android`

The web app at edentrack.app is **unchanged**. All Capacitor code is gated
behind `Capacitor.isNativePlatform()` checks.

---

## Phase 1 — Local mobile dev setup (👤, ~30 min)

Before you can build for real devices you need the platform SDKs.

### 1. Install Xcode (iOS)

```bash
# Open the Mac App Store and install Xcode (15 GB, takes a while)
# Then accept the license:
sudo xcodebuild -license accept

# Install command-line tools if not already:
xcode-select --install

# Install CocoaPods (iOS dependency manager):
sudo gem install cocoapods
# OR if your Mac has Apple silicon and gem fails:
brew install cocoapods
```

### 2. Install Android Studio (Android)

```bash
# Download from https://developer.android.com/studio
# Open Android Studio → Tools → SDK Manager → install:
#   - Android SDK Platform 34 (or latest)
#   - Android SDK Build-Tools
#   - Android Emulator
#   - Android SDK Platform-Tools
```

Set `ANDROID_HOME` in `~/.zshrc`:
```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools
```

### 3. Add the iOS + Android platform folders to this repo

```bash
cd /Users/greatadigwe/Documents/edentrack
npm run build              # produces dist/
npx cap add ios            # creates ios/App/...
npx cap add android        # creates android/...
npx cap sync               # copies dist/ into both platforms
```

This adds `ios/` (~50MB, Xcode project) and `android/` (~30MB, Gradle
project) to your repo. Both should be committed — they're part of the
build artefact like `package.json`.

---

## Phase 2 — Apple Developer account (👤 only, ~$99 + 1-2 days)

### 4. Sign up

Go to https://developer.apple.com/programs/. Click Enrol.

- **Individual** account: $99/yr, instant approval, your real name shows on
  the App Store
- **Organisation** account: $99/yr, takes 1-2 weeks, requires a D-U-N-S
  number (free at https://developer.apple.com/support/D-U-N-S/), shows
  "Edentrack" or your company name on the App Store

For a one-person operation, **Individual is fine and faster**. You can
upgrade to Organisation later — apps don't have to be re-submitted.

### 5. Create an App ID

In https://developer.apple.com/account → Certificates, IDs & Profiles → Identifiers →

- Click **+**, choose **App IDs** → **App**
- Bundle ID: `app.edentrack` (must match `capacitor.config.ts` exactly)
- Description: "Edentrack"
- Capabilities: enable **Push Notifications**

### 6. Create an APNs Auth Key (for push)

In Certificates, IDs & Profiles → Keys →

- Click **+**, name it "Edentrack Push"
- Enable **Apple Push Notifications service (APNs)**
- Download the `.p8` file. **Save it — you only get to download once.**
- Note the **Key ID** (10 chars) and your **Team ID** (top right corner of
  the developer portal)

You'll need these three things later when you wire push on the server:
- The `.p8` file content
- The Key ID
- The Team ID
- Your bundle ID (`app.edentrack`)

Drop them in your Supabase function secrets when you're ready.

---

## Phase 3 — App Store Connect (👤 only, ~30 min)

### 7. Create the App Store listing

Go to https://appstoreconnect.apple.com → My Apps → **+** New App

- Platform: iOS
- Name: **Edentrack**
- Primary language: English (you'll add French as a localization)
- Bundle ID: `app.edentrack` (the one you registered in step 5)
- SKU: `edentrack-ios` (internal — anything unique works)

### 8. Fill in the metadata

You'll need:
- **App description** (~1500 char). Below is a draft — edit to taste.
- **Keywords** (100 char, comma-separated)
- **Screenshots**: 6.7" (iPhone 15 Pro Max) and 6.5" (iPhone 11 Pro Max).
  Take screenshots of: Dashboard, Tasks, Eden AI chat, Sales receipt,
  Insights. Use `xcrun simctl io booted screenshot` from a simulator.
- **App icon**: 1024×1024 PNG, no transparency, no rounded corners
  (Apple rounds them). Generate from your existing logo.
- **Privacy policy URL**: `https://edentrack.app/privacy` (you need a
  real privacy policy — required by Apple)
- **Support URL**: `https://edentrack.app/help` or your contact form
- **Age rating**: probably 4+ (no objectionable content)
- **Category**: Business or Productivity

#### App description draft

> **Edentrack — run your farm like a professional**
>
> The all-in-one farm management app for poultry, fish and rabbit
> operations. Built for smallholder farmers who need real tools, not
> a spreadsheet.
>
> **Track everything in one place**
> • Daily mortality, feed, water and weight
> • Egg collection by size and grade
> • Sales, expenses, profit per flock
> • Vaccinations and vet visits with withdrawal-period alerts
>
> **Eden AI helps you run smarter**
> Ask Eden anything about your farm — "what's my FCR?", "should I worry
> about this water reading?", "when should I harvest?". Eden remembers
> your farm context and gives advice grounded in your actual numbers.
>
> **Photo diagnosis**
> Snap a photo of a sick fish or unusual bird and Eden's vision model
> ranks possible diseases with treatment plans.
>
> **Works offline**
> Log mortality, feed and tasks without internet. Everything syncs
> automatically when you reconnect.
>
> **Multi-language**
> English and French built in.
>
> **Free to start**
> Starter plan is free forever. Upgrade to Grower or Farm Boss when
> you're ready for full analytics, AI usage and team features.

#### Keywords (Apple gives you 100 char)

```
farm,poultry,chicken,fish,aquaculture,rabbits,livestock,agriculture,FCR,broiler,layer,tilapia
```

---

## Phase 4 — Build, sign, ship to TestFlight (👤 + 🤖 mixed)

### 9. 🤖 + 👤 Build the iOS app

```bash
npm run mobile:ios
# Opens Xcode with ios/App/App.xcworkspace
```

In Xcode:
- Select **App** target in the left sidebar
- **Signing & Capabilities** tab
- Team: pick your Apple Developer team (the one you paid $99 for)
- Bundle Identifier: `app.edentrack` (should be pre-filled)
- Click **+ Capability**, add **Push Notifications** and
  **Background Modes** (check "Remote notifications")
- Plug in a real iPhone via USB, select it in the top device picker
- Hit ▶️ to build and run on your phone

If it builds and runs on your real phone with the Edentrack UI showing,
you're done with the hardest part.

### 10. 👤 Submit to TestFlight

Still in Xcode:
- **Product → Archive**
- Wait for build to finish (~3-5 min)
- Organizer window opens → click **Distribute App** → **App Store Connect**
  → Upload
- Wait ~10 min for Apple to process
- Go to https://appstoreconnect.apple.com → Edentrack → TestFlight
- The build appears with status "Processing" → "Ready to Submit"
- Add internal testers (your email, anyone else you want) — they get an
  invite via email, install TestFlight from the App Store, install your
  app

### 11. 👤 Test on real devices for at least 2-3 days

Test the things that DON'T work in a browser:
- Push notifications arriving when the app is closed
- Camera flow for Eden photo diagnosis (sick fish, water sample)
- Offline → online sync (turn airplane mode on, log mortality, turn it
  off, watch it sync)
- Biometric login if you wire it
- App icon + splash screen looking right
- Rotating the phone (lock to portrait if you don't want it rotating)

### 12. 👤 Submit for App Store review

Once TestFlight builds work:
- App Store Connect → Edentrack → App Store tab → **+ Version**
- Fill in "What's New", attach the screenshots
- Click **Submit for Review**
- Apple takes 24-48 hours typically. They'll either approve, reject
  with reasons, or ask for clarification.

Common rejection reasons (handle these BEFORE submitting):
- **No demo account**: provide test credentials in the review-notes box
  so Apple's reviewer can sign in. e.g. `reviewer@edentrack.app` /
  `EdenReview2026!` with a pre-populated farm.
- **Privacy policy missing**: must be a real, accessible URL
- **In-App Purchase missing**: if you charge a subscription that unlocks
  features inside the app, Apple requires you use their IAP. If your
  subscription is for a service "primarily used outside the app" (you
  could argue this), you can use Stripe/Flutterwave. But the safer move
  is to use Apple IAP for in-app subscriptions; we can wire RevenueCat
  later.
- **Crashes on launch**: usually a missing Info.plist permission. If
  you use the camera, mic, location, photo library — each needs a
  human-readable string in Info.plist explaining why. Capacitor's
  default config covers most of these.

---

## Phase 5 — Android (👤 mostly, similar shape)

### 13. 👤 Google Play Developer account ($25 one-time)

Sign up at https://play.google.com/console. $25 one-time fee. Approved
in minutes (vs Apple's 1-2 days).

### 14. 🤖 + 👤 Build the Android APK / AAB

```bash
npm run mobile:android
# Opens Android Studio
```

In Android Studio:
- Wait for Gradle sync
- Build → Generate Signed Bundle / APK → choose **Android App Bundle**
- First time: create a new keystore (save the `.jks` file + password
  somewhere safe — you can't recover this)
- Build → produces `app/build/outputs/bundle/release/app-release.aab`

### 15. 👤 Upload to Play Console

- Play Console → Edentrack → Production → Create new release
- Upload the `.aab`
- Fill in store listing (description, screenshots — same content as iOS)
- Submit for review (typically 1-7 days)

---

## Phase 6 — Updates after launch (mixed)

When you ship a new feature:

```bash
# 🤖 Code changes happen in src/
# 🤖 Bump the version in capacitor.config.ts and ios/App/App.xcodeproj
git add -A && git commit -m "..."
npm run mobile:build      # rebuilds web + syncs to native

# 👤 In Xcode:
#   - Increment Build number (top of Signing tab)
#   - Product → Archive → Distribute → upload
#   - In App Store Connect, attach the new build to a new version
#   - Submit for review

# 👤 In Android Studio:
#   - Bump versionCode in android/app/build.gradle
#   - Build → Generate Signed Bundle → upload to Play Console
```

You can also use **EAS Update** or **Capacitor Live Updates** for
JS-only changes that ship instantly without app review. Set that up
later once basic flow is working.

---

## What can go wrong

- **"Untrusted Developer" on iPhone**: Settings → General → VPN &
  Device Management → trust your dev certificate
- **Build fails with CocoaPods error**: `cd ios/App && pod install`
- **Push token doesn't arrive**: check the APNs key is set in your push
  server (we use Supabase edge function for this — wire it up after
  TestFlight works)
- **Bundle won't load**: Vite's base path. If `dist/index.html`
  references `/assets/...`, that resolves fine in Capacitor's WebView
  because it serves from `capacitor://localhost`. If you see 404s on
  asset loads, set `base: './'` in `vite.config.ts`.

---

## What you don't have to redo

- All your existing React code works unchanged
- Supabase auth, RLS, edge functions — same
- The French translation work (10+ PRs) — same
- Eden AI prompts, photo diagnosis, offline sync — same
- The web app at edentrack.app — same, totally unaffected

The Capacitor wrapper is purely additive.

---

## Signing on a Personal Team while Apple Developer is processing

If you've paid for Apple Developer Program but Xcode still shows you as "(Personal Team)", that's because Xcode hasn't picked up the new paid team yet. The `app.entitlements` file in this repo currently has Push Notifications and Associated Domains commented out so the Personal Team can sign the build for on-device development. You can run on a real iPhone today and re-enable the two capabilities once the paid team appears.

### Why this happens

Apple's payment confirmation email arrives within seconds, but the team can take 24–48 hours to provision in their backend. Xcode reads team membership from that backend, so until Apple flips the bit, Xcode keeps treating you as Personal regardless of what your inbox says.

### How to make the paid team appear in Xcode

Try these in order:

1. **Xcode → Settings → Accounts** → click your Apple ID → click **Download Manual Profiles**. This forces a refresh.
2. **Sign out and back in** on the same screen if step 1 doesn't surface the new team.
3. **developer.apple.com → Account → Agreements** — Apple sometimes adds a new License Agreement after payment that you must explicitly accept before the team activates.
4. **Wait 24–48h** if none of the above surfaces it. Apple's docs confirm this is normal.

### How to restore Push Notifications + Universal Links once the paid team appears

1. Open Xcode → click the App target (top of the file tree, blue icon) → **Signing & Capabilities**
2. Switch the **Team** dropdown from "(Personal Team)" to your paid team
3. Open `ios/App/App/App.entitlements` and uncomment the two `<key>` blocks (delete the wrapping `<!--` and `-->`)
4. Back in Xcode → Signing & Capabilities → click **+ Capability** twice and re-add **Push Notifications** and **Associated Domains**
5. Build and run — the "Cannot create provisioning profile" error clears

The app's push and Universal Links code paths are guarded so they silently no-op when entitlements are missing. Nothing else breaks while you're on Personal Team.

---

## Bonus features — biometric login, barcode scanner, live updates

These three are additive and DON'T need paid Apple Developer to develop locally — they're community plugins / third-party services that ride on top of Capacitor. They're already wired up in this repo.

### 1. Biometric login (Face ID / Touch ID / Android fingerprint)

Plugin: `@capgo/capacitor-native-biometric`

Why we want it: farmers re-open Edentrack a dozen times a day. Typing the password every time is painful, especially with gloves on. Biometrics let us cache the Supabase refresh token in the device keychain and unlock it with a glance.

Helpers in `src/lib/capacitorNative.ts`:

- `biometricAvailable()` — does this device have Face ID / Touch ID enrolled?
- `enableBiometricLogin(email, refreshToken)` — call once after a normal email+password sign-in, when the user opts in to biometric unlock
- `biometricUnlock()` — prompts Face ID; on success returns `{ email, secret }` to feed into `supabase.auth.setSession({ refresh_token: secret })`
- `disableBiometricLogin()` — clear the keychain entry on logout

iOS needs `NSFaceIDUsageDescription` in `Info.plist` (already added). Android needs nothing extra — biometric prompt is built in.

To wire it into the UI: after a successful login, show a one-time "Unlock with Face ID next time?" prompt. If accepted, call `enableBiometricLogin`. On the login screen, if `biometricAvailable().available` is true and `isCredentialsSaved` returns true, show a Face ID button that calls `biometricUnlock`.

### 2. Barcode / QR scanner

Plugin: `@capacitor-mlkit/barcode-scanning` (Google ML Kit)

Use cases on the farm:

- Scan vaccine vial QR codes to auto-fill batch number + expiry on the vet log
- Scan feed bag barcodes to log incoming inventory in one tap
- Scan a buyer's join-link QR to add them as a marketplace contact
- Scan an invite QR to join a co-op farm without typing the link

Helper in `src/lib/capacitorNative.ts`:

- `scanBarcode()` — opens camera full-screen, returns the first decoded value as a string, or `null` if the user cancels

The first time it runs on Android, ML Kit downloads a small model (~3 MB) automatically. Camera permission is already in `AndroidManifest.xml` and `Info.plist`. No paid Apple Developer needed.

### 3. Live updates (OTA JS bundle pushes)

Plugin: `@capgo/capacitor-updater`

Why we want it: the App Store review queue is 1–7 days. We ship features constantly, so waiting a week for a copy fix is not workable. Live Updates let us push a new JS bundle to all installed apps within minutes — they download in the background and apply on the next cold start. Apple permits this as long as the change is JS-only (no new native plugins, no behavioral changes that bypass review). See section 3.3.2 of the Apple Developer Program License Agreement.

What's wired up:

- `capacitor.config.ts` has the `CapacitorUpdater` plugin block configured
- `src/main.tsx` calls `CapacitorUpdater.notifyAppReady()` on launch — without this, the plugin auto-rolls back to the previous bundle if the new one crashes before reaching it (10s timeout)

What you still need to do (👤 you, after Apple Developer membership processes):

1. Create a Capgo account: https://capgo.app — free for the first 1,000 monthly active users, then ~$15/month
2. Run `npx @capgo/cli init` in the repo — it generates an API key, adds it to `capacitor.config.ts`, and creates a `production` channel
3. To ship a JS update: `npm run build && npx @capgo/cli bundle upload --channel=production`
4. All installed apps pick it up on next launch

Alternative: Ionic Appflow ($499/month), more polished but pricier. Capgo is fine for our scale.

**Important boundary:** Live updates can only ship JS / CSS / asset changes. If you ever need to add a new Capacitor plugin (e.g. add Bluetooth scanning), that requires native code changes which still need a real App Store / Play Store update. Plan accordingly.

---

## Order of operations summary

1. 🤖 Code is ready (this PR)
2. 👤 Install Xcode + Android Studio + CocoaPods
3. 👤 `npm run build && npx cap add ios && npx cap add android`
4. 👤 Apple Developer account ($99) + create App ID + APNs key
5. 👤 App Store Connect listing + screenshots + privacy policy
6. 👤 `npm run mobile:ios` → Xcode → run on real iPhone
7. 👤 Xcode → Archive → upload to TestFlight
8. 👤 Test on TestFlight 2-3 days
9. 👤 Submit for App Store review (24-48 hour wait)
10. 👤 Repeat steps 4-9 for Android (Play Console, $25 one-time)
