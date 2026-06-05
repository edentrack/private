import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY - copy .env.example to .env and fill in your project values'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Persist the session in localStorage so it survives app restarts
    // and is available immediately without a network round-trip.
    persistSession: true,
    // Store auth tokens in localStorage (works on both web and Capacitor
    // WebView — Capacitor exposes localStorage to the WebView).
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    // Keep trying to refresh the token in the background when online.
    // Combined with the offline guard in AuthContext, this means:
    //   online  → tokens auto-refresh silently
    //   offline → last valid session is used, no forced sign-out
    autoRefreshToken: true,
    // Detect the session from the URL hash after OAuth / magic-link
    // callbacks. Required for Supabase magic links to work.
    detectSessionInUrl: true,
  },
});
