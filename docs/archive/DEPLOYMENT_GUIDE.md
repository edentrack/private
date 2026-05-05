# 🚀 Deployment Guide - Edentrack

## Quick Deploy Options

### Option 1: Deploy to Vercel (Recommended - Easiest)

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm install -g vercel
   ```

2. **Build your app**:
   ```bash
   npm run build
   ```

3. **Deploy**:
   ```bash
   vercel
   ```
   
   Follow the prompts:
   - Link to existing project or create new
   - Set up project
   - Deploy!

4. **Set Environment Variables** in Vercel Dashboard:
   - Go to your project → Settings → Environment Variables
   - Add:
     - `VITE_SUPABASE_URL` = Your Supabase project URL
     - `VITE_SUPABASE_ANON_KEY` = Your Supabase anon key

5. **Redeploy** after adding environment variables:
   ```bash
   vercel --prod
   ```

**That's it!** Your app will be live at `your-project.vercel.app`

---

### Option 2: Deploy to Netlify

1. **Install Netlify CLI**:
   ```bash
   npm install -g netlify-cli
   ```

2. **Build your app**:
   ```bash
   npm run build
   ```

3. **Deploy**:
   ```bash
   netlify deploy --prod --dir=dist
   ```

4. **Set Environment Variables** in Netlify Dashboard:
   - Go to Site settings → Environment variables
   - Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

---

### Option 3: Deploy to GitHub Pages

1. **Update vite.config.ts** to add base path:
   ```typescript
   export default defineConfig({
     base: '/your-repo-name/',
     // ... rest of config
   })
   ```

2. **Build**:
   ```bash
   npm run build
   ```

3. **Deploy**:
   ```bash
   npm install -g gh-pages
   gh-pages -d dist
   ```

---

## 📋 Pre-Deployment Checklist

### 1. Environment Variables
Make sure you have these set in your hosting platform:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

**Where to find these:**
- Go to your Supabase project
- Settings → API
- Copy "Project URL" → `VITE_SUPABASE_URL`
- Copy "anon public" key → `VITE_SUPABASE_ANON_KEY`

### 2. Build the App
```bash
npm run build
```

This creates a `dist/` folder with all production files.

### 3. Test the Build Locally
```bash
npm run preview
```

Visit `http://localhost:4173` to test your production build.

### 4. Database Migrations
Make sure all Supabase migrations are run:
- Go to Supabase Dashboard → SQL Editor
- Run all migrations in `supabase/migrations/` folder
- Verify RLS policies are active

### 5. Service Worker
The service worker (`sw-enhanced.js`) is already configured and will be included in the build.

---

## 🔧 Detailed Deployment Steps

### Step 1: Prepare Your Code

1. **Test everything locally**:
   ```bash
   npm run dev
   ```
   Make sure all features work.

2. **Fix any errors**:
   ```bash
   npm run lint
   npm run typecheck
   ```

3. **Build for production**:
   ```bash
   npm run build
   ```

### Step 2: Choose Your Platform

#### 🟢 Vercel (Recommended)

**Why Vercel:**
- ✅ Free tier available
- ✅ Automatic deployments from Git
- ✅ Fast CDN
- ✅ Easy environment variable management
- ✅ Preview deployments for testing

**Steps:**

1. **Create account** at [vercel.com](https://vercel.com)

2. **Install Vercel CLI**:
   ```bash
   npm install -g vercel
   ```

3. **Login**:
   ```bash
   vercel login
   ```

4. **Deploy**:
   ```bash
   vercel
   ```
   
   First time? It will ask:
   - Link to existing project? → **No** (create new)
   - Project name? → `edentrack` (or your choice)
   - Directory? → `./` (current directory)
   - Override settings? → **No**

5. **Set Environment Variables**:
   - Go to [vercel.com/dashboard](https://vercel.com/dashboard)
   - Click your project
   - Settings → Environment Variables
   - Add:
     - `VITE_SUPABASE_URL` = `https://your-project.supabase.co`
     - `VITE_SUPABASE_ANON_KEY` = `your-anon-key`

6. **Deploy to Production**:
   ```bash
   vercel --prod
   ```

7. **Set up Custom Domain** (optional):
   - Project Settings → Domains
   - Add your domain
   - Follow DNS instructions

#### 🟡 Netlify

**Steps:**

1. **Create account** at [netlify.com](https://netlify.com)

2. **Install Netlify CLI**:
   ```bash
   npm install -g netlify-cli
   ```

3. **Login**:
   ```bash
   netlify login
   ```

4. **Initialize**:
   ```bash
   netlify init
   ```

5. **Deploy**:
   ```bash
   netlify deploy --prod --dir=dist
   ```

6. **Set Environment Variables**:
   - Netlify Dashboard → Site settings → Environment variables
   - Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

#### 🔵 GitHub Pages

**Steps:**

1. **Create a GitHub repository**

2. **Push your code**:
   ```bash
   git init
   git add -A
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/your-repo.git
   git push -u origin main
   ```

3. **Update vite.config.ts**:
   ```typescript
   export default defineConfig({
     base: '/your-repo-name/', // Change this to your repo name
     // ... rest
   })
   ```

4. **Install gh-pages**:
   ```bash
   npm install --save-dev gh-pages
   ```

5. **Add deploy script to package.json**:
   ```json
   "scripts": {
     "deploy": "npm run build && gh-pages -d dist"
   }
   ```

6. **Deploy**:
   ```bash
   npm run deploy
   ```

---

## 🔐 Environment Variables Setup

### For Vercel:
1. Go to Project → Settings → Environment Variables
2. Add:
   - **Key**: `VITE_SUPABASE_URL`
   - **Value**: `https://your-project.supabase.co`
   - **Environment**: Production, Preview, Development
3. Add:
   - **Key**: `VITE_SUPABASE_ANON_KEY`
   - **Value**: Your anon key from Supabase
   - **Environment**: Production, Preview, Development
4. **Redeploy** after adding variables

### For Netlify:
1. Site settings → Environment variables
2. Add both variables
3. Redeploy

---

## 🗄️ Supabase Configuration

### 1. Update CORS Settings

In Supabase Dashboard → Settings → API:
- Add your production URL to "Allowed CORS origins"
- Example: `https://your-app.vercel.app`

### 2. Verify RLS Policies

Make sure Row Level Security is enabled on all tables:
- Go to Authentication → Policies
- Verify all tables have proper policies

### 3. Run Migrations

Run all migrations in order:
```sql
-- Run each migration file from supabase/migrations/
-- In Supabase SQL Editor
```

---

## ✅ Post-Deployment Checklist

After deploying, verify:

- [ ] App loads without errors
- [ ] Login works
- [ ] Sign up works
- [ ] All pages load correctly
- [ ] Images display properly
- [ ] Service worker registers (check browser console)
- [ ] Offline mode works
- [ ] Push notifications work (if enabled)
- [ ] All features function correctly
- [ ] Mobile view works
- [ ] Translations work (English/French)

---

## 🐛 Troubleshooting

### Build Fails

**Error: Module not found**
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Environment Variables Not Working

- Make sure variable names start with `VITE_`
- Redeploy after adding variables
- Check variable names match exactly

### Service Worker Not Working

- Check browser console for errors
- Verify `sw-enhanced.js` is in `dist/` folder
- Clear browser cache and reload

### CORS Errors

- Add your production URL to Supabase CORS settings
- Check Supabase project URL is correct

---

## 📱 Mobile App Deployment (PWA)

Your app is already a PWA! Users can:

1. **Install on mobile**:
   - Visit your site
   - Browser will show "Add to Home Screen"
   - Tap to install

2. **Test PWA**:
   - Open Chrome DevTools
   - Application tab → Service Workers
   - Verify service worker is registered

---

## 🔄 Continuous Deployment

### With Vercel + GitHub:

1. **Connect GitHub**:
   - Vercel Dashboard → Import Project
   - Select your GitHub repo
   - Vercel will auto-deploy on every push

2. **Automatic Deployments**:
   - Push to `main` → Production deployment
   - Push to other branches → Preview deployment

### With Netlify + GitHub:

1. **Connect GitHub**:
   - Netlify Dashboard → Add new site → Import from Git
   - Select GitHub → Authorize → Select repo

2. **Build Settings**:
   - Build command: `npm run build`
   - Publish directory: `dist`

---

## 🎯 Quick Deploy Commands

```bash
# Build
npm run build

# Test build locally
npm run preview

# Deploy to Vercel
vercel --prod

# Deploy to Netlify
netlify deploy --prod --dir=dist
```

---

## 📞 Need Help?

If deployment fails:
1. Check build logs in your hosting platform
2. Verify environment variables are set
3. Check Supabase CORS settings
4. Review browser console for errors

---

**Your app is ready to deploy!** 🚀
