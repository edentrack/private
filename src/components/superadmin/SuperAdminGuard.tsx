import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface SuperAdminGuardProps {
  children: React.ReactNode;
}

export function SuperAdminGuard({ children }: SuperAdminGuardProps) {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let userId: string | null = null;

    const redirect = () => { window.location.hash = ''; };

    const check = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { redirect(); return; }
        userId = user.id;

        const { data: profile, error } = await supabase
          .from('profiles')
          .select('is_super_admin')
          .eq('id', user.id)
          .maybeSingle();

        if (error || !profile?.is_super_admin) { redirect(); return; }
        setIsSuperAdmin(true);
      } catch {
        redirect();
      } finally {
        setLoading(false);
      }
    };

    check();

    // Subscribe to profile changes — redirect immediately if is_super_admin revoked
    const channel = supabase
      .channel('super-admin-guard')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          if (payload.new?.id === userId && !payload.new?.is_super_admin) {
            redirect();
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Verifying access...</p>
        </div>
      </div>
    );
  }

  if (!isSuperAdmin) return null;

  return <>{children}</>;
}
