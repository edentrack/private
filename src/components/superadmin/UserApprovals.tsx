import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, User, Mail, Calendar, ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../../contexts/ToastContext';

interface PendingUser {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  created_at: string;
  farm_name?: string | null;
}

export function UserApprovals() {
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    loadPendingUsers();
  }, []);

  const loadPendingUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id,
          email,
          full_name,
          phone,
          created_at
        `)
        .eq('account_status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const usersWithFarms = await Promise.all(
        (data || []).map(async (user) => {
          const { data: farmsData } = await supabase
            .from('farms')
            .select('name')
            .eq('owner_id', user.id)
            .limit(1)
            .single();

          return {
            ...user,
            farm_name: farmsData?.name || null,
          };
        })
      );

      setPendingUsers(usersWithFarms);
    } catch (error) {
      console.error('Failed to load pending users:', error);
      showToast('Failed to load pending users', 'error');
    } finally {
      setLoading(false);
    }
  };

  const [processing, setProcessing] = useState<Set<string>>(new Set());

  const setUserStatus = async (userId: string, status: 'active' | 'rejected') => {
    if (processing.has(userId)) return;
    setProcessing(prev => new Set(prev).add(userId));
    try {
      const { error } = await supabase.rpc('admin_set_user_status', {
        p_user_id: userId,
        p_status: status,
      });
      if (error) throw error;

      // Notify the user by email via edge function (fire-and-forget)
      const user = pendingUsers.find(u => u.id === userId);
      if (user?.email) {
        supabase.functions.invoke('send-account-status-email', {
          body: { email: user.email, full_name: user.full_name, status },
        }).catch(() => {}); // non-blocking
      }

      showToast(status === 'active' ? 'User approved' : 'User rejected', 'success');
      loadPendingUsers();
    } catch (error) {
      console.error('Status update failed:', error);
      showToast('Failed to update user status', 'error');
    } finally {
      setProcessing(prev => { const s = new Set(prev); s.delete(userId); return s; });
    }
  };

  const handleApprove = (userId: string) => setUserStatus(userId, 'active');

  const handleReject = (userId: string) => {
    if (!confirm('Reject this user? This cannot be undone.')) return;
    setUserStatus(userId, 'rejected');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <button
              onClick={() => window.location.hash = '#/super-admin'}
              className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </button>
            <h1 className="text-2xl font-bold text-gray-900">Pending Approvals</h1>
            <p className="text-gray-600">Review and approve new user registrations</p>
          </div>
        </div>

        {pendingUsers.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-12 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              All caught up!
            </h3>
            <p className="text-gray-600">No pending user approvals at the moment.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingUsers.map((user) => (
              <div key={user.id} className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 bg-gray-100 rounded-full">
                        <User className="w-5 h-5 text-gray-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{user.full_name || 'No name provided'}</h3>
                        <p className="text-sm text-gray-600">{user.farm_name || 'No farm name'}</p>
                      </div>
                      <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-semibold">
                        PENDING
                      </span>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Mail className="w-4 h-4" />
                        <span>{user.email}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <User className="w-4 h-4" />
                        <span>{user.phone || 'No phone'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Calendar className="w-4 h-4" />
                        <span>Registered: {new Date(user.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 ml-6">
                    <button
                      onClick={() => handleApprove(user.id)}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(user.id)}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
