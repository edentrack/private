# Eden mobile fix — input bar + long-typing

**Owner:** Claude Code
**Working dir:** `/Users/greatadigwe/Documents/edentrack`
**Branch:** `eden-mobile-input-bar`
**Source of evidence:** Greg's mobile usage report + code audit at `src/components/ai/AIAssistantPage.tsx` (lines ~2330-2470)

---

## The problem in one sentence

Eden's input bar has 5 controls + text input + Send button all in one un-wrapping flex row, AND the text input is a single-line `<input>` instead of an auto-growing `<textarea>`. On a 360-390px Android viewport, controls overflow off-screen and long messages scroll horizontally inside the input instead of wrapping. Greg's words: *"the AI page has issues with how things fit and long typing."*

## The three fixes

### Fix 1 — Auto-growing textarea (kills the "long typing" issue)

**Current:** `<input ref={inputRef} type="text" ... />`
**Replace with:** `<textarea>` that auto-grows from 1 line up to ~4 lines, then internal scroll.

```tsx
<textarea
  ref={inputRef}
  rows={1}
  inputMode="text"
  enterKeyHint="send"
  value={input}
  onChange={(e) => {
    setInput(e.target.value);
    // Auto-grow: reset height so it can shrink, then set to scrollHeight
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  }}
  onKeyDown={(e) => {
    // Enter to send, Shift+Enter for newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }}
  placeholder={...}  // keep existing placeholder logic
  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-agri-gold-500 focus:border-transparent outline-none resize-none min-h-[44px] max-h-[160px]"
  style={{ minHeight: '44px', maxHeight: '160px' }}
/>
```

Key details:
- `rows={1}` keeps it visually one line by default
- `resize-none` disables manual resize handle
- `min-h-[44px]` ensures the input is always touch-target-friendly
- `max-h-[160px]` caps the auto-grow so a 50-line paste doesn't eat the whole screen
- Internal scroll kicks in after 4 lines (browser default)
- Enter sends, Shift+Enter inserts newline (standard chat UX)

### Fix 2 — Input bar wraps responsibly on narrow screens

**Current:** all 7 row items in one `<div className="flex items-center gap-2">` with no wrap.
**Target:** at <640px, language picker moves into attach menu, mute toggle hides, and the row gracefully collapses.

The simplest pattern: keep the row as `flex items-center gap-2`, but add per-element responsive visibility classes.

- Language picker (`<select>` with EN/FR/Pidgin/Hausa): wrap in `<div className="hidden sm:block">` so it disappears below 640px. Move it into the `+` attach menu as a "Voice language" submenu item.
- Mute toggle (Volume2/VolumeX button): wrap in `<div className="hidden sm:block">`. TTS is rarely toggled; access it via Settings → Eden AI tab if needed.
- The `+` button, mic button, textarea, and Send button STAY in the row at all widths.
- Add `flex-wrap` to the row container as a defensive last-resort: if any new element is added later, it'll wrap to a second line instead of overflowing.

After this fix the row at <640px is: `[+] [🎤] [────────── textarea ──────────] [Send icon]`. Four items, comfortable spacing.

### Fix 3 — Move language picker into the attach (+) menu

The `+` attach menu currently has options like "Take photo", "Upload CSV", "Attach image". Add a fourth option: "Voice language" that opens a small sub-menu with EN / FR / Pidgin / Hausa. This is where the language picker lives on mobile and on desktop both — you can fully delete the row-level `<select>` and only use the menu version, simpler.

If keeping the row-level picker for desktop is a hard requirement, gate it `hidden sm:block` and ALSO add the menu entry — duplicates aren't a problem because they share the same setter.

---

## Acceptance criteria

After this PR ships:

1. Open Eden on a 360px viewport (Chrome DevTools mobile emulation, iPhone SE, or real Android)
2. Bottom input bar fits cleanly: `[+] [🎤] [textarea] [Send]`. No horizontal scroll. No off-screen Send button.
3. Tap into the textarea, type *"this is a really long message that should wrap to multiple lines and continue past where the original input would have ended"*. The textarea grows to 2-3 lines automatically. Send button stays visible. No horizontal scroll inside the input.
4. Tap Send. Message goes through. Textarea collapses back to 1 row.
5. Tap the `+` button. The menu now includes "Voice language: EN" with a sub-arrow. Tapping it offers EN / FR / Pidgin / Hausa.
6. The mute toggle is no longer visible in the bar. (Settings → Eden AI exposes it.)
7. Test at 768px and above — desktop layout unchanged. Send button still shows the word "Send" next to the icon.
8. Run `npm run typecheck && npm test && npm run build` — all green.

---

## Files to touch

- `src/components/ai/AIAssistantPage.tsx` — the three changes above
- `src/components/ai/EdenInput.tsx` if it exists as a standalone component (split during the EDEN-1 refactor — check)
- `src/components/settings/SettingsPage.tsx` — add a "Voice & Speech" section under Eden AI tab with the mute toggle moved here
- Possibly a new `src/components/ai/AttachMenu.tsx` if the menu items live in a sub-component

## Estimated time

~2 hours of focused work. Single PR, single deploy.

---

## How Greg verifies after merge

The browser resize tool in the Cowork session can't actually emulate mobile (macOS HiDPI quirk). Greg has three options to verify on real mobile:

**Option 1 (fastest, free): Chrome DevTools mobile emulation on his Mac.**
- Open edentrack.app in Chrome
- Cmd+Option+I to open DevTools
- Cmd+Shift+M to toggle the device toolbar
- Pick "iPhone SE" (375px) or "Pixel 5" (393px) from the dropdown
- Reload the page
- Open Eden, type a long message, observe the layout

**Option 2 (most realistic): Real Android phone in his pocket.**
- Open edentrack.app in mobile Chrome
- Sign in to test2.edentrack@gmail.com
- Open Eden, type a long message
- Screenshot and share

**Option 3 (most thorough): Let me run the verification once Greg confirms which device he wants me to emulate.**
- Cowork's resize tool fails on macOS HiDPI but Cowork can also use Chrome DevTools' Device Mode programmatically via the CDP (Chrome DevTools Protocol)
- Worth one try if Options 1+2 are inconvenient

The fastest verification is Option 1 — Greg has DevTools open in 30 seconds.

---

## Stop conditions

- TS budget gate above 180 → fix before push
- Tests fail → fix before push
- Either change introduces a regression on desktop layout → revert, isolate, retry
- The textarea height-jump is jittery (auto-grow is laggy) → tune the recompute frequency or fall back to a fixed 3-line height with internal scroll

---

## Definition of done

- Single PR merged, single deploy
- Desktop layout unchanged
- Mobile (375-414px) Eden input bar fits in one row with no overflow
- Long messages wrap inside an auto-growing textarea, not horizontal-scroll inside an input
- Greg verifies on real Android (or DevTools mobile emulation) and signs off
