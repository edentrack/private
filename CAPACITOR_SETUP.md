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
