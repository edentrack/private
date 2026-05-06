# Brief — Phase 3: Mobile UX overhaul

**Supersedes the layout/UX portion of:** the Phase 3 section in `CLAUDE_CODE_AUTONOMOUS_ROADMAP.md` (which is bundle-size focused).
**Pairs with:** the original Phase 3 (bundle/perf work) — they can run in parallel as separate PRs.

**Status:** ready to start. No external blockers.
**Owner:** Claude Code.
**Working directory:** `/Users/greatadigwe/Documents/edentrack`
**Branch model:** four sequential PRs (`#MOB-A` through `#MOB-D`).

---

## Why we're doing this

Greg's smallholder farmers in Cameroon, Nigeria, Kenya, and beyond are mobile-first to the point of mobile-only. A 5–6" Android held one-handed at 5am during morning feed is the realistic device. The app currently *works* on mobile — none of the layouts are broken — but it doesn't *feel native* there. The Eden page especially has a desktop-shaped header eating ~15% of viewport, the input is small, and the suggestion chips wrap awkwardly.

This phase makes the app feel like it was designed for that 5am moment, not adapted from a desktop-first layout.

## What this brief does NOT cover

- Bundle size, lazy-loading, image compression. That's the perf-focused Phase 3 in the master roadmap. Both phases ship in parallel; this one is **layout / interaction / touch / keyboard** only.
- Eden-specific UI work. That's Brief #2 (Phase 2). This brief covers the global mobile shell that surrounds Eden + every other page.

---

## PR #MOB-A — Bottom nav + responsive shell

**Goal:** replace the desktop-style top nav with a bottom nav on mobile (≤768px). Top nav stays for desktop.

### Changes

1. **New component** `src/components/layout/MobileBottomNav.tsx`:
   - 5 tabs maximum: Dashboard, Flocks/Ponds/Hutches (species-aware label), Tasks, Eden AI, More
   - Each tab is a 56×56px touch target
   - Active tab highlighted (bottom border + filled icon)
   - Sticks to viewport bottom; safe-area-inset-bottom respected on iOS
   - Visible only when `viewport.width <= 768px`

2. **Update** `src/components/dashboard/DashboardLayout.tsx`:
   - On mobile, hide the existing top nav links (keep just logo + tenant + notification bell + avatar)
   - Render `<MobileBottomNav />` at the bottom of the layout
   - Add `pb-16 md:pb-0` to the main content wrapper so content doesn't hide behind the bottom nav

3. **"More" sheet** `src/components/layout/MobileMoreSheet.tsx`:
   - Bottom sheet that slides up when "More" tab is tapped
   - Lists: Inventory, Insights, Reports, Team, Settings, Sign out
   - Tap an item → navigate, close sheet
   - Tap outside or swipe down to dismiss

### Acceptance

- On a 375px viewport, the bottom nav shows 5 tabs, each tappable with thumb without stretching
- On 768px+ viewport, bottom nav is hidden, top nav unchanged
- Navigating via the bottom nav updates the active tab indicator
- The "More" sheet opens/closes smoothly with no layout shift
- Safe area inset honored on iPhone 12+

---

## PR #MOB-B — Touch targets + keyboard handling

**Goal:** every interactive element ≥44×44px (WCAG / iOS HIG / Material). Keyboard doesn't push content under input.

### Touch target audit

Run a pass over every page and flag every button/link/input/checkbox <44px in either dimension. Fix by:
- Add padding (preferred — visual size unchanged, hit area grows)
- Increase font size (only where it doesn't break the layout)
- Increase explicit `min-height: 44px; min-width: 44px;`

Highest-priority files (most user-facing tap targets):
- `DashboardHome.tsx` — task checkboxes, action chips
- `ExpenseTracking.tsx` — log button, edit/delete icons
- `FlockManagement.tsx` / `AquaculturePondWidget.tsx` / Rabbit equivalent — flock/pond cards
- `TasksPage2.tsx` — Mark Done buttons (already touched in earlier PR; re-verify)
- All modals' close (×) buttons
- All `<select>` inputs (often inherit small browser default)

### Keyboard handling

Add a `useVisualViewport()` hook (`src/hooks/useVisualViewport.ts`):
```ts
export function useVisualViewport() {
  const [vh, setVh] = useState(window.visualViewport?.height ?? window.innerHeight);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => setVh(vv.height);
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);
  return vh;
}
```

Use it in:
- `AIAssistantPage.tsx` — chat container height = `vh - headerHeight`. When keyboard opens, container shrinks; latest message stays visible.
- All modals with text inputs — input scrolls into view when focused.

### Input-zoom prevention

Set `font-size: 16px` minimum on all `<input>`, `<select>`, `<textarea>`. iOS auto-zooms to 16px when an input <16px is focused; preventing this stops the unwanted zoom-in.

Update `src/index.css`:
```css
input, select, textarea {
  font-size: 16px;
}
```

### Acceptance

- Every interactive element on every page is ≥44×44px (Greg + Claude Code do a side-by-side audit on a 375px viewport)
- Opening the keyboard on Eden chat doesn't push the input under the fold
- Tapping into an input on iOS does not cause a zoom-in
- All modals stay usable with keyboard open

---

## PR #MOB-C — Forms-on-mobile pass

**Goal:** every form (CreateFlockModal, LogMortalityModal, ExpenseModal, all the Settings forms) is comfortable to fill on a phone.

### Pattern changes

1. **One field per visual row** on mobile. Two-column form layouts (common on desktop) collapse to single-column at <640px.
2. **Native input types** for everything:
   - Numbers → `<input type="number" inputMode="numeric">`
   - Phone → `<input type="tel">`
   - Email → `<input type="email">`
   - Date → `<input type="date">` (already used in most places; verify)
   - Decimal money → `<input type="text" inputMode="decimal">`
3. **Big primary buttons at the bottom of the form** — full width, ≥48px tall, sticky to bottom of viewport on mobile.
4. **"Save" button is always reachable without scrolling** — even with a long form, the sticky footer keeps it tap-able.
5. **Cancel is a text button** to the side, not a sibling button (avoids accidental cancel).

### Files to update

- `src/components/flocks/CreateFlockModal.tsx`
- `src/components/aquaculture/CreatePondModal.tsx`
- `src/components/rabbits/CreateRabbitryModal.tsx` (if exists)
- `src/components/mortality/LogMortalityModal.tsx`
- `src/components/eggs/LogCollectionModal.tsx`
- `src/components/eggs/LogSaleModal.tsx`
- `src/components/expenses/ExpenseTracking.tsx` (the inline expense form)
- `src/components/inventory/AddInventoryModal.tsx`
- `src/components/settings/*.tsx`

### Acceptance

- Greg can fill any form on his Android in landscape OR portrait without horizontal scroll
- Number fields show numeric keyboard, not the full QWERTY
- The Save button is always reachable on screen, never below the fold
- All form errors render inline (red text below the field), never as a toast that disappears

---

## PR #MOB-D — Real-device QA + polish

**Goal:** Greg + Claude Code do a real-device pass on Android (Greg) and iOS (Greg). File and fix everything that doesn't feel right.

### Process

1. Greg records a Loom of him using the app one-handed on Android, going through:
   - Open dashboard
   - Switch tenant
   - Open Eden, ask a question, log an action
   - Open Flocks, view a flock detail
   - Open Tasks, mark one done
   - Open More → Settings → toggle a setting
2. Claude Code watches the Loom, files every UX hitch as a sub-task in this PR
3. Each hitch fixed in a single commit; PR description lists them all
4. Greg re-tests; sign-off

### Common things to look for

- Modal close buttons too small or hard to reach
- Sticky elements covering content
- Text truncation on small screens (long farm names, long flock names)
- Toast notifications appearing in wrong position (should be bottom-center on mobile, not top-right)
- Dark-mode regressions (if dark mode is supported)
- Slow input response (debouncing too aggressive)
- Bottom nav covering important content

### Acceptance

- Greg's Loom shows him completing every flow without friction
- No content is unreachable on a 320px viewport (smallest realistic Android)
- App works in landscape (don't optimize for it, but don't break it)

---

## Cross-cutting requirements

- TS baseline does not increase
- All 74 tests pass
- Bundle size delta logged per PR (target: zero net change from layout work)
- en + fr translations for all new copy (e.g. bottom nav labels, "More" sheet items)

## Stop conditions

- Bottom nav breaks an existing keyboard flow → revert and ship as desktop-only top nav fix
- visualViewport listener causes layout thrashing on Android Chrome → use the older `window.innerHeight` approach with debounce
- Real-device QA reveals a perf regression on the 4-year-old Android Greg's farmers actually use → pause this brief, prioritize Phase 3 perf work first

## Definition of done

- Greg can run his entire morning routine on the app one-handed on Android (Loom recorded as proof)
- All 4 PRs merged
- No regressions on desktop (the desktop nav unchanged, layouts unchanged at >768px)
- Touch-target audit shows zero <44px interactive elements
- Bundle did not grow

After this brief: the layout / interaction / touch portion of Phase 3 is closed. Bundle/perf Phase 3 (in the master roadmap) is still independent.
