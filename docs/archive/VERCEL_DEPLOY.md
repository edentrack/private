# 🚀 Vercel Deployment Guide

## Quick Commands

### Option 1: Use npx (No Global Install Needed)
```bash
# 1. Login to Vercel (first time only)
npx vercel login

# 2. Build the project
npm run build

# 3. Deploy to production
npx vercel --prod
```

### Option 2: Install Vercel CLI Globally
```bash
# Install globally (requires sudo on Mac)
sudo npm install -g vercel

# Then use:
vercel login
npm run build
vercel --prod
```

## Fix Build Error

The build is failing because of a `.env` file permission issue. Here are solutions:

### Solution 1: Create a `.env.local` file instead
```bash
# Create .env.local (Vite will read this automatically)
# This file should contain:
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Solution 2: Remove or fix permissions on .env
```bash
# Check if .env exists
ls -la .env

# If it exists, check permissions
chmod 644 .env

# Or remove it if not needed (use .env.local instead)
rm .env
```

### Solution 3: Use Vercel Environment Variables (Recommended for Production)
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add:
   - `VITE_SUPABASE_URL` = `https://your-project.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `your-anon-key`
3. These will be used during build automatically

## Complete Deployment Steps

```bash
# Step 1: Navigate to project
cd "/Users/great/Downloads/project 4"

# Step 2: Login to Vercel (if not already logged in)
npx vercel login

# Step 3: Build locally (to test)
npm run build

# Step 4: Deploy to production
npx vercel --prod
```

## Troubleshooting

### "command not found: vercel"
Use `npx vercel` instead of just `vercel`

### Build fails with permission error
- Check `.env` file permissions
- Use `.env.local` instead
- Or set environment variables in Vercel Dashboard

### Build succeeds locally but fails on Vercel
- Make sure environment variables are set in Vercel Dashboard
- Check Vercel build logs for specific errors
- Ensure all dependencies are in `package.json`
