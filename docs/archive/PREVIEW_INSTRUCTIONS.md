# 🚀 Preview Instructions

## Dev Server Status

The development server is starting up. 

## 🌐 Access Your App

Once the server is ready, open your browser and go to:

**http://localhost:5173**

## ✅ What to Check

### 1. **Flock Images**
- ✅ Layer flocks should show `image.png`
- ✅ Broiler flocks should show `broiler.png`
- ⚠️ Rabbit flocks need `rabbit.png` (add to `/public` folder)
- ⚠️ Fish flocks need `catfish.png` and `tilapia.png` (add to `/public` folder)

### 2. **Rabbit & Fish Flocks**
- Check browser console for debug logs:
  ```
  === FLOCKS LOADED ===
  Total flocks: X
  Flocks by species: { poultry: X, rabbits: Y, aquaculture: Z }
  ```
- If you don't see rabbit/fish flocks:
  1. Create new ones (they'll now have `species` field)
  2. Or update existing ones with SQL (see `DEBUG_FLOCKS_NOT_SHOWING.md`)

### 3. **Animations**
- Modal animations should be smooth
- Card hover effects should work
- Image hover zoom should work

### 4. **Help Content**
- Check Help Center for rabbit and fish articles
- Should see "Managing Rabbits" and "Managing Fish" articles

## 🐛 If You See Errors

### React Hook Error
If you see "Invalid hook call":
1. Unregister service worker (DevTools → Application → Service Workers)
2. Clear browser cache (Ctrl+Shift+R)
3. Restart server

### 503 Error for Images
If images show 503 error:
1. Stop server (Ctrl+C)
2. Run: `rm -rf node_modules/.vite`
3. Restart: `npm run dev`

### Flocks Not Showing
Check browser console for debug logs to see what's loaded.

## 📝 Quick Commands

```bash
# Stop server
Ctrl+C

# Restart server
npm run dev

# Clear cache and restart
rm -rf node_modules/.vite && npm run dev
```

---

**Your app should be running at http://localhost:5173** 🎉











