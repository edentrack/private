import { useContext, useEffect, useState, useRef, ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import posthog from 'posthog-js';
import { supabase } from '../lib/supabaseClient';
import type { Profile, FarmMember, MemberRole } from '../types/database';
import { AuthContext } from './authContextRef';

export type { AuthContextType } from './authContextRef';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [currentFarm, setCurrentFarm] = useState<{ id: string; name: string; currency?: string; currency_code?: string; broiler_price_per_bird?: number; broiler_price_per_kg?: number } | null>(null);
  const [currentMember, setCurrentMember] = useState<FarmMember | null>(null);
  const [currentRole, setCurrentRole] = useState<MemberRole | null>(null);
  const [loading, setLoading] = useState(true);
  const currentFarmIdRef = useRef<string | null>(null);

  // Only update currentFarm when the farm ID actually changes — prevents token-refresh flickers
  const stableSetCurrentFarm = (farm: typeof currentFarm) => {
    if (farm?.id === currentFarmIdRef.current) return;
    currentFarmIdRef.current = farm?.id ?? null;
    setCurrentFarm(farm);
  };

  const clearCurrentFarm = () => {
    currentFarmIdRef.current = null;
    setCurrentFarm(null);
  };


  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        try {
          await loadUserData(session.user.id);
        } catch (error) {
          console.error('Error in initial loadUserData:', error);
          // Ensure loading is cleared even if loadUserData fails
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    }).catch((error) => {
      console.error('Error getting session:', error);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      (async () => {
        try {
          setSession(session);
          setUser(session?.user ?? null);
          if (session?.user) {
            await loadUserData(session.user.id);
          } else {
            clearUserData();
          }
        } catch (error) {
          console.error('Error in auth state change:', error);
          // Ensure loading is cleared on error
          setLoading(false);
        }
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const clearUserData = () => {
    setProfile(null);
    clearCurrentFarm();
    setCurrentMember(null);
    setCurrentRole(null);
    setLoading(false);
  };

  const loadUserData = async (userId: string) => {
    // Add a timeout to prevent infinite loading
    let timeoutId: NodeJS.Timeout | null = setTimeout(() => {
      if (import.meta.env.DEV) console.warn('loadUserData is taking too long');
      setLoading(false);
    }, 30000); // 30 second timeout

    try {
      // Check if we're impersonating — will be re-validated against profile below
      let impersonation: any = null;
      try {
        const stored = localStorage.getItem('impersonation_state');
        if (stored) {
          impersonation = JSON.parse(stored);
        }
      } catch (e) {
        // Ignore
      }

      // Start with the real user's IDs; only override after confirming super admin
      let effectiveUserId = userId;
      let effectiveFarmId: string | null = null;

      try {
        const { error: acceptErr } = await supabase.rpc('accept_pending_invitations');
        if (acceptErr) {
          console.warn('[AuthContext] accept_pending_invitations RPC returned error (non-blocking):', acceptErr);
        }
      } catch (e) {
        console.warn('[AuthContext] accept_pending_invitations threw (non-blocking):', e);
      }

      // Sync user's farm_id with their active farm membership (if column exists)
      // DISABLED: This RPC call was causing timeouts and hanging the app
      // The system works fine without it - farm_members table is the source of truth
      // try {
      //   await supabase.rpc('sync_user_farm_id', { p_user_id: effectiveUserId });
      // } catch (e) {
      //   console.warn('sync_user_farm_id failed:', e);
      // }

      const { data: authUser, error: authError } = await supabase.auth.getUser();
      if (authError || !authUser?.user) {
        console.warn('getUser failed or no user:', authError?.message);
        if (authError?.message?.includes('403') || authError?.message?.includes('401') || authError?.status === 401 || authError?.status === 403) {
          await supabase.auth.signOut();
          clearUserData();
        }
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
        setLoading(false);
        return;
      }
      const userEmail = authUser.user?.email || '';
      const userMetadata = authUser.user?.user_metadata || {};

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', effectiveUserId)
        .maybeSingle();
      
      if (profileError) {
        console.error('Profile query error:', profileError);
        if (profileError.code === '42501' || profileError.code === 'PGRST301' || (profileError as any).status === 401) {
          await supabase.auth.signOut();
          clearUserData();
        }
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
        setLoading(false);
        return;
      }

      if (!profileData) {
        const fullName = userMetadata?.full_name || 'User';
        let profileCreated = false;
        const { data: rpcResult } = await supabase.rpc('create_my_profile_if_missing', {
          p_full_name: fullName,
          p_email: userEmail || null,
        });
        const rpcOk = (rpcResult as { success?: boolean })?.success === true;
        if (rpcOk) {
          const { data: refetched } = await supabase.from('profiles').select('*').eq('id', effectiveUserId).maybeSingle();
          if (refetched) {
            setProfile(refetched);
            profileCreated = true;
            if (refetched.is_super_admin) {
              if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
              setLoading(false);
              return;
            }
          }
        }
        if (!profileCreated) {
          const { data: newProfile, error: insertError } = await supabase
            .from('profiles')
            .insert({
              id: userId,
              full_name: fullName,
              email: userEmail,
              account_status: 'pending',
              subscription_tier: 'free',
            })
            .select()
            .maybeSingle();

          if (insertError) {
            console.error('Profile insert error:', insertError);
            if (insertError.code === '42501' || (insertError as any).status === 401) {
              await supabase.auth.signOut();
              clearUserData();
            }
            if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
            setLoading(false);
            return;
          }

          if (newProfile) {
            setProfile(newProfile);
            if (newProfile.is_super_admin) {
              if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
              setLoading(false);
              return;
            }
          }
        }
      } else {
        // Client-side safety net: if email is confirmed but profile still pending, activate it
        if (profileData.account_status === 'pending' && authUser.user.email_confirmed_at) {
          const { error: activateErr } = await supabase
            .from('profiles')
            .update({ account_status: 'active' })
            .eq('id', effectiveUserId)
            .eq('account_status', 'pending');
          if (!activateErr) profileData.account_status = 'active';
        }

        // Only honour impersonation state if the real user is a super admin AND the log is still open in the DB.
        // Verify with a 3-second timeout — if the query hangs or RLS blocks it, clear stale state and
        // fall back to normal super admin load rather than hanging the entire auth flow.
        if (impersonation?.active) {
          if (profileData.is_super_admin && impersonation.targetUserId && impersonation.targetFarmId && impersonation.logId) {
            let logIsOpen = false;
            try {
              const logQueryPromise = supabase
                .from('super_admin_impersonation_logs')
                .select('id')
                .eq('id', impersonation.logId)
                .eq('admin_id', userId)
                .is('ended_at', null)
                .maybeSingle();
              const logTimeoutPromise = new Promise<{ data: null }>((resolve) =>
                setTimeout(() => resolve({ data: null }), 3000)
              );
              const logResult = await Promise.race([logQueryPromise, logTimeoutPromise]) as any;
              logIsOpen = !!(logResult?.data && !logResult?.error);
            } catch {
              logIsOpen = false;
            }

            if (logIsOpen) {
              effectiveUserId = impersonation.targetUserId;
              effectiveFarmId = impersonation.targetFarmId;
            } else {
              // Log is stale, ended, or query failed — clear it so super admin dashboard loads normally
              localStorage.removeItem('impersonation_state');
              impersonation = null;
            }
          } else {
            localStorage.removeItem('impersonation_state');
            impersonation = null;
          }
        }

        setProfile(profileData);
      posthog.identify(effectiveUserId, {
        email: profileData.email,
        name: profileData.full_name,
        subscription_tier: profileData.subscription_tier,
        country: profileData.country,
        account_status: profileData.account_status,
      });
        // Super admins skip farm loading UNLESS they are actively impersonating someone
        if (profileData.is_super_admin && !effectiveFarmId) {
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          setLoading(false);
          return;
        }
      }

      // If we have a target farm ID from impersonation, use it directly
      let memberData = null;
      if (effectiveFarmId) {
        try {
          const farmPromise = supabase
            .from('farms')
            .select('id, name, currency, currency_code')
            .eq('id', effectiveFarmId)
            .maybeSingle();
          
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Farm query timeout')), 5000)
          );
          
          const farmResult = await Promise.race([farmPromise, timeoutPromise]) as any;
          
          if (farmResult?.data && !farmResult.error) {
            const memberPromise = supabase
              .from('farm_members')
              .select('*')
              .eq('farm_id', effectiveFarmId)
              .eq('user_id', effectiveUserId)
              .eq('is_active', true)
              .maybeSingle();
            
            const memberTimeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Member query timeout')), 5000)
            );
            
            const memberResult = await Promise.race([memberPromise, memberTimeoutPromise]) as any;
            
            if (memberResult?.data && !memberResult.error) {
              memberData = {
                ...memberResult.data,
                farms: farmResult.data
              } as any;
            }
          }
        } catch (e) {
          console.warn('Error loading farm/member data (impersonation):', e);
        }
      }
      
      // If we don't have memberData yet, try normal lookup.
      // Prefer membership where user is worker/manager/viewer (invited to a farm) over owner (their own farm)
      // so everyone you invite only sees your farm when they log in.
      if (!memberData) {
        try {
          const memberPromise = supabase
            .from('farm_members')
            .select('*, farms!inner(id, name, currency, currency_code)')
            .eq('user_id', effectiveUserId)
            .eq('is_active', true)
            .order('joined_at', { ascending: false })
            .limit(10);
          
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Member query timeout')), 5000)
          );
          
          const result = await Promise.race([memberPromise, timeoutPromise]) as any;
          
          if (result?.data && !result.error && Array.isArray(result.data) && result.data.length > 0) {
            const rows = result.data as any[];
            // Always prefer worker/manager/viewer membership (your farm) over owner (their own farm)
            const sorted = [...rows].sort((a: any, b: any) => (a.role === 'owner' ? 1 : 0) - (b.role === 'owner' ? 1 : 0));
            memberData = sorted[0];
          }
        } catch (e) {
          console.warn('Error loading member data:', e);
        }
      }

      if (!memberData && !impersonation?.active) {
        try {
          await new Promise(resolve => setTimeout(resolve, 1000));

          const retryPromise = supabase
            .from('farm_members')
            .select('*, farms!inner(id, name, currency, currency_code)')
            .eq('user_id', userId)
            .eq('is_active', true)
            .order('joined_at', { ascending: false })
            .limit(10);

          const retryTimeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Retry query timeout')), 5000)
          );

          const result = await Promise.race([retryPromise, retryTimeoutPromise]) as any;

          if (result?.data && !result.error && Array.isArray(result.data) && result.data.length > 0) {
            const rows = result.data as any[];
            const sorted = [...rows].sort((a: any, b: any) => (a.role === 'owner' ? 1 : 0) - (b.role === 'owner' ? 1 : 0));
            memberData = sorted[0];
          }
        } catch (e) {
          console.warn('Error on retry member data:', e);
        }
      }

      // Last-resort fallback: query farm_members without the JOIN, then fetch the farm separately.
      // Handles edge cases where the inner join fails due to RLS or query plan issues.
      if (!memberData && !impersonation?.active) {
        try {
          const { data: memberRows } = await supabase
            .from('farm_members')
            .select('*')
            .eq('user_id', userId)
            .eq('is_active', true)
            .order('joined_at', { ascending: false })
            .limit(1);

          if (memberRows && memberRows.length > 0) {
            const row = memberRows[0];
            const { data: farmRow } = await supabase
              .from('farms')
              .select('id, name, currency, currency_code')
              .eq('id', row.farm_id)
              .maybeSingle();
            if (farmRow) {
              memberData = { ...row, farms: farmRow };
            }
          }
        } catch (e) {
          console.warn('Error on fallback member data:', e);
        }
      }

      if (!memberData) {
        // If impersonating and no member data found, try to create minimal structure from impersonation state
        if (impersonation?.active && effectiveFarmId && impersonation.targetFarmName) {
          // Create minimal farm/member structure from impersonation state
          stableSetCurrentFarm({
            id: effectiveFarmId,
            name: impersonation.targetFarmName,
            currency: undefined,
            currency_code: undefined
          });
          // Create a minimal member object
          setCurrentMember({
            id: 'temp',
            farm_id: effectiveFarmId,
            user_id: effectiveUserId,
            role: 'owner' as MemberRole,
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as any);
          setCurrentRole('owner' as MemberRole);
        } else {
          // Invited users must never get their own farm — only access via accepting the invite.
          // Supabase RPC errors surface in the `error` field (not thrown), so we MUST check both.
          let shouldNotCreateFarm = false;
          let inviteCheckFailed = false;

          try {
            const { data: hasPendingInvite, error: pendingErr } = await supabase.rpc('user_has_pending_farm_invite');
            if (pendingErr) {
              console.error('[AuthContext] user_has_pending_farm_invite RPC error:', pendingErr);
              inviteCheckFailed = true;
              shouldNotCreateFarm = true; // fail-safe: never create an orphan farm on uncertainty
            } else if (hasPendingInvite) {
              shouldNotCreateFarm = true;
            }
          } catch (e) {
            console.error('[AuthContext] user_has_pending_farm_invite threw:', e);
            inviteCheckFailed = true;
            shouldNotCreateFarm = true;
          }

          if (!shouldNotCreateFarm) {
            try {
              const { data: wasInvited, error: invitedErr } = await supabase.rpc('user_was_invited_to_farm');
              if (invitedErr) {
                console.error('[AuthContext] user_was_invited_to_farm RPC error:', invitedErr);
                inviteCheckFailed = true;
                shouldNotCreateFarm = true;
              } else if (wasInvited) {
                shouldNotCreateFarm = true;
              }
            } catch (e) {
              console.error('[AuthContext] user_was_invited_to_farm threw:', e);
              inviteCheckFailed = true;
              shouldNotCreateFarm = true;
            }
          }

          if (shouldNotCreateFarm) {
            if (inviteCheckFailed) {
              console.warn(
                '[AuthContext] Invitation check could not complete — blocking auto-farm creation as a safety measure. ' +
                'If this is a new direct signup, they may appear stuck at loading. ' +
                'Verify user_has_pending_farm_invite and user_was_invited_to_farm RPCs are deployed to production.'
              );
            }
            setLoading(false);
            return;
          }

          // No invite (pending or past) — create new farm only for direct signups
          const { data: newFarm } = await supabase
            .from('farms')
            .insert({
              name: `${userMetadata?.full_name || 'My'}'s Farm`,
              owner_id: userId,
            })
            .select()
            .maybeSingle();

          if (newFarm) {
            const { data: newMember } = await supabase
              .from('farm_members')
              .insert({
                farm_id: newFarm.id,
                user_id: userId,
                role: 'owner',
                is_active: true,
                joined_at: new Date().toISOString(),
              })
              .select('*, farms!inner(id, name, currency, currency_code)')
              .maybeSingle();

            if (newMember) {
              stableSetCurrentFarm({
                id: newFarm.id,
                name: newFarm.name,
                currency: newFarm.currency,
                currency_code: newFarm.currency_code
              });
              setCurrentMember(newMember);
              setCurrentRole('owner' as MemberRole);
            }
          }
        }
      } else {
        const farmData = memberData.farms as any;
        stableSetCurrentFarm({
          id: farmData.id,
          name: farmData.name,
          currency: farmData.currency,
          currency_code: farmData.currency_code
        });
        setCurrentMember(memberData);
        setCurrentRole(memberData.role as MemberRole);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
      // Ensure loading state is cleared even on error
      // This prevents infinite loading screen
    } finally {
      // Clear the timeout since we're done
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      // ALWAYS set loading to false, even if errors occurred
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectTo = `${window.location.origin}/#/auth/callback`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
        emailRedirectTo: redirectTo,
      }
    });

    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    posthog.reset();
    clearUserData();
  };

  const requestPasswordReset = async (email: string) => {
    const redirectTo = `${window.location.origin}/#/auth/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    if (error) throw error;
  };

  const resetPassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (error) throw error;
  };

  const refreshSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await loadUserData(session.user.id);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      currentFarm,
      currentMember,
      currentRole,
      loading,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      resetPassword,
      refreshSession
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
