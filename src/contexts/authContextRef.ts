import { createContext } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import type { Profile, FarmMember, MemberRole } from '../types/database';

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  currentFarm: { id: string; name: string; currency?: string; currency_code?: string; broiler_price_per_bird?: number; broiler_price_per_kg?: number } | null;
  currentMember: FarmMember | null;
  currentRole: MemberRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (newPassword: string) => Promise<void>;
  refreshSession: () => Promise<void>;
}

/**
 * Auth context reference in a separate file so HMR doesn't recreate it
 * and break "useAuth must be used within an AuthProvider".
 */
export const AuthContext = createContext<AuthContextType | undefined>(undefined);
