# Wrapping EdenTrack as a Native App (Play Store + App Store)

**Compiled:** May 2026
**Status:** Recommendation, not yet implemented
**Current stack:** Vite + React + Supabase, deployed to Vercel as a web app at edentrack.app

---

## The short answer

You don't need to rewrite EdenTrack. You wrap the existing web app in a native shell. Three options, in ascending order of effort and capability.

| Option | Effort | Coverage | Native features | Best for |
|---|---|---|---|---|
| **PWA "Install" / TWA** | 1-2 days | Android only (Play Store) | Limited (no push, no biometric) | Quickest Play Store presence |
| **Capacitor wrapper** | 1-2 weeks | Android + iOS | Full native plugin access | Real launch — recommended |
| **React Native rewrite** | 6-12 months | Android + iOS, native perf | Full | Premature for launch |

**Recommendation**: ship **Capacitor** for both stores. It's two weeks of work, keeps your entire React codebase intact, gives you native push notifications, camera access, biometric login, secure storage, and shows up in both stores looking like a real native app.

If you want a faster Play-Store-only win first, do **TWA via Bubblewrap** in two days, then layer Capacitor on top a month later.

---

## Option A — TWA (Trusted Web Activity) for Play Store

A TWA is a Chrome browser tab in a borderless wrapper, distributed as an Android app. The user can't tell it's not native. Google's official tool **Bubblewrap** generates the wrapper automatically.

**What you need.**
- Your PWA (you already have one — Vite ships PWA-ready)
- A `manifest.json` declaring the app
- A digital-asset-link verification (proves you own edentrack.app)
- A Google Play Developer account ($25 one-time)
- App icons (512×512 PNG, plus splash screens)

**The flow.**
1. Add or polish `manifest.json` in your Vite project (name, theme color, icons, start URL).
2. Install Bubblewrap CLI: `npm i -g @bubblewrap/cli`.
3. Run `bubblewrap init --manifest=https://edentrack.app/manifest.json`.
4. It generates an Android Studio project + signed APK/AAB.
5. Upload the `.aab` to Play Console, fill listing, submit for review.

**Pros.** Two days end-to-end. No JavaScript changes. Auto-updates when you deploy edentrack.app — no app review for content changes.

**Cons.** Android only. Limited native features (no push notifications, no biometric login, no offline persistence beyond what your PWA already does). User sees a brief "powered by Chrome" banner on first launch.

**When to choose this.** You want Android Play Store presence in 48 hours and you'll add iOS later. Or you want to test app-store distribution before investing in Capacitor.

---

## Option B — Capacitor (recommended)

Capacitor is Ionic's open-source native wrapper. It runs your existing React app inside a WebView (like TWA) but adds **a real native plugin layer** — camera, push notifications, secure storage, biometric, file system, geolocation, etc. — all callable from your React code.

**What you need.**
- Your existing Vite + React project (no changes)
- A Mac for iOS builds (or rented MacInCloud, $20/mo)
- Apple Developer account ($99/year) + Google Play Developer ($25 one-time)
- App icons + splash screens (you can use Capacitor's `@capacitor/assets` to generate everything from one source PNG)

**The flow.**
1. `npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios`
2. `npx cap init "EdenTrack" "app.edentrack" --web-dir=dist`
3. Update `vite.config` build target if needed (Capacitor wants `dist/`).
4. `npm run build && npx cap add android && npx cap add ios`
5. `npx cap open android` opens Android Studio; `npx cap open ios` opens Xcode.
6. Generate icons: `npx capacitor-assets generate` from a 1024×1024 source.
7. Add native plugins as you need them: `npm install @capacitor/camera @capacitor/push-notifications` etc.
8. Build → upload to Play Console / App Store Connect.

**Pros.**
- Same React codebase. No rewrite, no parallel maintenance.
- Real native plugins. You can call camera, push, biometric, etc. from React.
- Both Android and iOS from one project.
- Plays nicely with your offline-first roadmap (Capacitor's storage and SQLite plugins are mature).
- The native shell intercepts navigation, so deep linking works properly.
- Auto-updates: web content can hot-reload from your Vercel deploy without a new app store submission, unless you change native plugins.

**Cons.**
- Two-week ramp for first developer doing it.
- App Store review for iOS is real (1-7 days, sometimes rejection on first submit for cosmetic reasons — splash screen, privacy policy URL, etc.).
- You need a Mac for iOS builds. Workaround: GitHub Actions has a `macos` runner that can build iOS on every push.

**When to choose this.** You're shipping seriously and want both stores. This is the right answer for EdenTrack.

---

## Option C — React Native rewrite

Rewriting the whole app in React Native would give you full native performance and access to every native API without WebView overhead.

**Don't do this now.** It's 6-12 months of work, you'd run two parallel codebases (the web app at edentrack.app for desktop and the React Native app for mobile), and the marginal benefit over Capacitor for your use case is small. Save it for a year from now if you're seeing real performance complaints from users running on $50 Tecno phones.

---

## Practical timeline if you go Capacitor

**Week 1**
- Day 1-2: install Capacitor, init Android + iOS projects, get a successful build to a real device.
- Day 3-4: app icons, splash screens, status bar styling, navigation polish.
- Day 5: privacy policy and terms URLs (required by App Store).

**Week 2**
- Day 6-7: native plugins you actually need (camera for receipts, push notifications for alerts, secure storage for auth tokens).
- Day 8-9: deep-linking setup (so a WhatsApp message linking to a record opens the app).
- Day 10: Play Store + App Store listings: screenshots (you need 5-8 per platform), description copy in English + French, age rating, privacy disclosures.

**Week 3 (review window)**
- Submit to both stores.
- Google Play: typically approved in 1-3 days.
- Apple: typically 1-7 days, sometimes longer; expect at least one back-and-forth on first submission.

Realistic launch-on-stores: **3 weeks from start of Capacitor work**. Add buffer if you're learning iOS submission for the first time.

---

## Costs

- Apple Developer Program: **$99/year**
- Google Play Console: **$25 one-time**
- Mac for iOS builds: $0 if you have one, ~$20/mo MacInCloud if you don't, or **free** via GitHub Actions macOS runners (recommended)
- App icon + splash design: $0 if you do it yourself with `@capacitor/assets`, $50-200 on Fiverr if you want a designer
- App Store Connect screenshot generation: free with [App Mockup](https://app-mockup.com/) or similar tools

**Total to ship to both stores: under $200**.

---

## Things to watch out for

**iOS App Store policies.** Apple is stricter than Google. Common rejection reasons that'll bite you:
- App needs a privacy policy URL (build it now: simple page at edentrack.app/privacy).
- App needs to handle "no internet" gracefully on first launch (this aligns with the offline-first roadmap anyway).
- Any payment-like UI inside the app needs to use Apple's IAP if it's for digital goods. **Important for EdenTrack:** your Stripe checkout is for SaaS subscriptions, which Apple permits via web checkout (don't try to embed Stripe Elements). Direct users to a Safari-based checkout flow for plan upgrades.

**Push notifications.** Need separate cert/key on iOS (APNs) and a Firebase project on Android (FCM). Capacitor's `@capacitor/push-notifications` plugin abstracts both, but you do the cert/key setup once per platform.

**Offline-first matters more in a wrapped app.** When users install a real app and tap it from their home screen, they expect it to open even with no internet. Your current "requires connection" state will look broken. Closing the offline-first gap (in COMPETITIVE_GAPS_AND_UPGRADES.md) becomes more urgent if you're shipping native.

**App icon must look good at 16×16.** The icon you design needs to read clearly on a phone home screen and at favicon size. Test it tiny before locking it in.

**Naming on the stores.** "EdenTrack" is probably available but check both stores before announcing. iOS limits the visible name to ~12 characters before truncation; consider if "EdenTrack" or "Eden" is the brand.

---

## My recommendation, in two sentences

Spin up Capacitor next week. Use the first weekend to get an Android build running on your phone, the next to add iOS, and the week after that to polish icons and submit. Three weeks from now you can have edentrack.app on both Play Store and App Store, with the same codebase you ship to Vercel.

Don't do the TWA route unless you specifically want a Play-Store-only beachhead in 48 hours; otherwise it's just extra work you'll redo.

Skip React Native unless and until users tell you the WebView feels slow on their phone.
