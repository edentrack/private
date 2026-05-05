# Fixing React Hook Error

## The Problem

You're seeing:
```
Invalid hook call. Hooks can only be called inside of the body of a function component.
Cannot read properties of null (reading 'useState')
```

This happens when there are **multiple copies of React** in your app.

## Solution Applied

1. ✅ Updated `vite.config.ts` to dedupe React
2. ✅ Cleared Vite cache
3. ✅ Verified React import in AuthContext

## Next Steps

1. **Stop the dev server** (Ctrl+C)
2. **Clear cache and restart**:
   ```bash
   rm -rf node_modules/.vite
   rm -rf dist
   npm run dev
   ```

3. **If still having issues**, try:
   ```bash
   rm -rf node_modules
   npm install
   npm run dev
   ```

## Why This Happens

Vite sometimes bundles multiple React instances when:
- Dependencies have their own React copies
- Cache gets corrupted
- Module resolution issues

The `dedupe` config forces Vite to use a single React instance.

## Verification

After restarting, check console - you should NOT see:
- Multiple chunk files with different React versions
- "Invalid hook call" errors
- "Cannot read properties of null" errors











