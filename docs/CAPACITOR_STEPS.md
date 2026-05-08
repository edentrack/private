# Capacitor Wrap — Step-by-Step Checklist

**Goal:** ship EdenTrack to Google Play Store and Apple App Store using the existing Vite + React codebase.
**Realistic timeline:** 3 weeks from start to "submitted for review."
**Cost:** ~$125 first year ($99 Apple + $25 Google).

---

## Phase 0 — Pre-work (do this first, before any code)

These are the items that block everything else. Knock them out first.

1. **Sign up for Apple Developer Program** at developer.apple.com. Costs $99/year. Requires a real legal entity (sole proprietor is fine). Approval can take 1-3 days, sometimes longer if Apple verifies your details.

2. **Sign up for Google Play Console** at play.google.com/console. Costs $25 one-time. Approval is usually instant.

3. **Get Mac access** — three options. Best to worst:
   - You already have a Mac → use it
   - GitHub Actions with `macos-latest` runner builds iOS for free (recommended if no Mac)
   - MacInCloud rental at ~$20/month (works but slower for daily dev)

4. **Privacy policy live** at edentrack.app/privacy. Apple WILL reject without this. Generate a starting template at termly.io or freeprivacypolicy.com, then customize.

5. **Terms of service live** at edentrack.app/terms. Less strictly required but standard.

6. **Decide bundle identifiers.** Common pattern: reverse domain. For you: `app.edentrack` (Android) and `app.edentrack` (iOS). Use the same string for both. **Cannot be changed once published.**

7. **App name decision.** Lock in "EdenTrack" or just "Eden" before generating icons. iOS truncates anything over ~12 characters on the home screen.

---

## Phase 1 — Local Capacitor setup (Day 1)

8. **Verify Vite builds clean.** From repo root: `npm run build` — should produce `dist/` with `index.html` plus assets. If your `vite.config` outputs to a different folder, note it for step 11.

9. **Install Capacitor core** in your existing repo:
   ```
   npm install @capacitor/core @capacitor/cli
   ```

10. **Initialize Capacitor:**
    ```
    npx cap init "EdenTrack" "app.edentrack" --web-dir=dist
    ```
    Creates `capacitor.config.ts` at repo root.

11. **Edit `capacitor.config.ts`** to confirm `webDir: 'dist'` matches your Vite output. Add any iOS/Android config you want here later.

---

## Phase 2 — Android first (Day 2-3)

12. **Add Android platform:**
    ```
    npm install @capacitor/android
    npx cap add android
    ```
    Creates an `android/` folder with a Gradle project.

13. **Build web → copy to Android:**
    ```
    npm run build
    npx cap copy android
    ```
    This copies `dist/` into the Android assets.

14. **Open in Android Studio:**
    ```
    npx cap open android
    ```
    Wait for Gradle sync. Errors here are usually JDK version (need 17+) or stale gradle cache (`./gradlew clean`).

15. **Run on a real Android device** (USB-connected, USB debugging on) or an emulator. Confirm the app loads, you can sign in, and the dashboard renders. **This is your first big checkpoint.**

---

## Phase 3 — iOS (Day 4-5, Mac required)

16. **Add iOS platform:**
    ```
    npm install @capacitor/ios
    npx cap add ios
    npx cap copy ios
    ```

17. **Open in Xcode:**
    ```
    npx cap open ios
    ```
    First run of `pod install` happens automatically. Wait for it.

18. **Set signing team in Xcode:** open the project, go to "Signing & Capabilities," select your Apple Developer team. Without this iOS won't build to a device.

19. **Run on iOS Simulator first** (Xcode menu: Product → Run). Then on a real device once that works. Same checkpoint as Android: dashboard loads, sign-in works.

---

## Phase 4 — Icons, splash, polish (Day 6-7)

20. **Source icon:** create one 1024×1024 PNG. Square, no transparency, no rounded corners (the OS adds those). Make sure it reads at 16×16. Test by literally previewing it tiny.

21. **Source splash:** one 2732×2732 PNG, brand-color background with logo centered.

22. **Generate all sizes:**
    ```
    npm install @capacitor/assets --save-dev
    npx capacitor-assets generate --iconBackgroundColor '#FFDD00' --splashBackgroundColor '#FFDD00'
    ```
    (Use your actual brand color.) This generates iOS and Android sizes from the source files in `resources/icon.png` and `resources/splash.png`.

23. **Status bar styling.** In `capacitor.config.ts`:
    ```ts
    plugins: {
      StatusBar: { style: 'dark', backgroundColor: '#FFDD00' }
    }
    ```
    `npm install @capacitor/status-bar` for this.

24. **Splash screen polish.** `npm install @capacitor/splash-screen`. Configure auto-hide after 2 seconds in capacitor.config.

---

## Phase 5 — Native plugins (Day 8-9, add only what you need)

25. **Camera** for photo capture (receipts, disease photos):
    ```
    npm install @capacitor/camera
    ```

26. **Network** for online/offline detection:
    ```
    npm install @capacitor/network
    ```

27. **Preferences** for secure local storage of small data:
    ```
    npm install @capacitor/preferences
    ```

28. **Browser** for opening Stripe checkout in Safari (REQUIRED for iOS — see Phase 7):
    ```
    npm install @capacitor/browser
    ```

29. **Share** for share-to-WhatsApp from receipts:
    ```
    npm install @capacitor/share
    ```

30. **Push notifications.** This one needs more setup (Firebase project for Android, APNs cert for iOS), so skip for v1 if you want to ship faster. Add in v1.1.
    ```
    npm install @capacitor/push-notifications
    ```

After installing each plugin, run `npx cap sync` to wire it into the native projects.

---

## Phase 6 — Deep linking (Day 10)

31. **Configure URL scheme.** Decide on your scheme — likely `edentrack://`. Configure in `capacitor.config.ts`:
    ```ts
    plugins: {
      App: { ... }
    }
    ```

32. **Universal links / App Links** so a tap on edentrack.app/foo opens the native app:
    - iOS: add Associated Domains capability in Xcode, host an `apple-app-site-association` JSON at `edentrack.app/.well-known/apple-app-site-association`
    - Android: add intent filter to AndroidManifest.xml, host `assetlinks.json` at `edentrack.app/.well-known/assetlinks.json`

This step is fiddly. Test with QR codes pointing at edentrack.app links — the app should intercept.

---

## Phase 7 — iOS-specific compliance (Day 11)

33. **Stripe checkout: open in Safari, never embedded.** App Store will reject any in-app payment for digital goods (subscriptions count). When the user taps "Upgrade to Farm Boss," open the Stripe checkout URL via `Browser.open()` from `@capacitor/browser`, NOT inside the WebView.

34. **Permission strings.** Edit `ios/App/App/Info.plist`:
    - `NSCameraUsageDescription` → "EdenTrack uses your camera to capture receipts and farm photos."
    - `NSPhotoLibraryUsageDescription` → "EdenTrack accesses photos to upload farm images."
    - `NSLocationWhenInUseUsageDescription` (only if you're using location) → describe.

35. **Privacy nutrition label** (filled out on App Store Connect, not in code). Be honest about: account info collected, usage data, payment info, location.

---

## Phase 8 — Build for stores (Day 12-13)

36. **Android release build.** From the `android/` folder:
    ```
    ./gradlew bundleRelease
    ```
    Output: `android/app/build/outputs/bundle/release/app-release.aab` — this is what you upload.

37. **First time:** generate a signing key (`keytool -genkey -v -keystore release.keystore -alias edentrack -keyalg RSA -keysize 2048 -validity 10000`), back it up to two places (you cannot recover lost signing keys), and configure Gradle to use it.

38. **iOS release build.** In Xcode: Product → Archive. When done, the Organizer opens. Select your archive, click "Distribute App," choose "App Store Connect," upload.

39. **Wait 30-60 minutes** for Apple to process the upload before it appears in App Store Connect. Sometimes this fails silently — check email for processing errors.

---

## Phase 9 — Store listings (Day 13-14)

40. **Screenshots.** You need:
    - iOS: 5-8 screenshots at iPhone 6.7" (1290×2796) and iPhone 5.5" (1242×2208). Optionally iPad.
    - Android: 2-8 screenshots at any resolution, plus a feature graphic (1024×500).
    - Use a tool like [App Mockup](https://app-mockup.com/) or [Previewed](https://previewed.app/) to wrap real screenshots in device frames with marketing copy.

41. **Description copy.** Both English and French. Apple allows 4000 characters; Google 4000. Lead with Eden's transactional AI, multi-species support, and CFA-zone fluency.

42. **Promo text** (Apple only, 170 characters): one-liner that updates without re-review. Use this for time-sensitive announcements.

43. **Keywords** (Apple only, 100 characters): comma-separated. "poultry, farm, africa, cameroon, eden, livestock, aquaculture" type set.

44. **Categories.** Primary: "Productivity" or "Business." Secondary: "Lifestyle" or maybe "Food & Drink."

45. **Age rating.** Walk through the questionnaire. Probably ends up 4+ on iOS, "Everyone" on Google.

46. **Support URL** and marketing URL — both can point at edentrack.app.

47. **Pricing.** Free download, then in-app subscription managed via your existing Stripe (web-based per Phase 7).

---

## Phase 10 — Submit (Day 14-21)

48. **Submit Android first** — Google Play review usually takes 1-3 days. Less stressful learning curve.

49. **Submit iOS** — Apple review takes 1-7 days, often a back-and-forth on first submission. Common rejection reasons:
    - Missing privacy policy URL
    - In-app purchase missing for digital goods (you'll dodge this with Phase 7)
    - Crashes on launch on a specific iPhone model (test on multiple devices)
    - Misleading screenshots
    - App is incomplete (some flow doesn't work)
    - Generic copy that doesn't describe what the app actually does

50. **Phased rollout** on Play Store: release to 5% of users first, watch crash analytics for 24 hours, then 25%, then 100%. Apple has a similar "phased release" toggle.

---

## Ongoing — after launch

- **Web app updates** (changes to `dist/`) deploy via Vercel and your apps will pick them up on next launch — no app store re-submit required.
- **Native plugin changes** (adding a new Capacitor plugin, changing permissions) DO require an app store re-submit.
- **Monitor crash reports** in App Store Connect and Google Play Console. Fix top crashes within 7 days.
- **Respond to reviews.** Both stores penalize you for ignoring reviews; respond within 48 hours, especially to 1-2 star reviews.

---

## Quick reference — total checklist

**Pre-work (1-2 days, mostly waiting):** items 1-7
**Local setup (1 day):** items 8-11
**Android (2 days):** items 12-15
**iOS (2 days):** items 16-19
**Icons + polish (2 days):** items 20-24
**Native plugins (2 days):** items 25-30
**Deep linking (1 day):** item 31-32
**iOS compliance (1 day):** items 33-35
**Build artifacts (2 days):** items 36-39
**Store listings (2 days):** items 40-47
**Submit + iterate (1 week):** items 48-50

**Total: 3 weeks of focused work.** Add a week of buffer for first-time iOS submission back-and-forth.
