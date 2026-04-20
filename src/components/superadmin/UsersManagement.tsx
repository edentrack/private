import { useEffect, useState } from 'react';
import { Search, ArrowLeft, Ban, Play, Eye, Edit, Save, X, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../../contexts/ToastContext';
import { ImpersonationModal } from './ImpersonationModal';

interface UserData {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  account_status: string;
  subscription_tier: string;
  created_at: string;
  farm_name?: string | null;
  access_type?: 'owner' | 'member' | null;
  member_role?: string | null;
}

export function UsersManagement() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [impersonateUser, setImpersonateUser] = useState<{id: string, name: string, email: string} | null>(null);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{full_name: string, phone: string, subscription_tier: string}>({
    full_name: '',
    phone: '',
    subscription_tier: ''
  });
  const [deletingUser, setDeletingUser] = useState<{id: string, name: string, email: string} | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const { showToast } = useToast();

  useEffect(() => {
    loadUsers();
  }, [filterStatus]);

  const loadUsers = async () => {
    try {
      let query = supabase
        .from('profiles')
        .select(`
          id,
          email,
          full_name,
          phone,
          account_status,
          subscription_tier,
          created_at
        `)
        .order('created_at', { ascending: false });

      if (filterStatus !== 'all') {
        query = query.eq('account_status', filterStatus);
      }

      const { data, error } = await query;
      if (error) throw error;

      const usersWithFarms = await Promise.all(
        (data || []).map(async (user) => {
          try {
            const { data: ownerFarm } = await supabase
              .from('farms')
              .select('name')
              .eq('owner_id', user.id)
              .limit(1)
              .maybeSingle();

            if (ownerFarm?.name) {
              return { ...user, access_type: 'owner' as const, farm_name: ownerFarm.name, member_role: null };
            }

            const { data: memberRow } = await supabase
              .from('farm_members')
              .select('role, farms(name)')
              .eq('user_id', user.id)
              .eq('is_active', true)
              .limit(1)
              .maybeSingle();

            if (memberRow && (memberRow.farms as any)?.name) {
              return {
                ...user,
                access_type: 'member' as const,
                farm_name: (memberRow.farms as any).name,
                member_role: memberRow.role || null,
              };
            }

            return { ...user, access_type: null, farm_name: null, member_role: null };
          } catch (error) {
            console.warn(`Failed to load farm for user ${user.id}:`, error);
            return { ...user, access_type: null, farm_name: null, member_role: null };
          }
        })
      );

      setUsers(usersWithFarms);
    } catch (error) {
      console.error('Failed to load users:', error);
      showToast('Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSuspend = async (userId: string) => {
    if (!confirm('Suspend this user? They will not be able to access the platform.')) return;

    try {
      const { error } = await supabase.rpc('admin_set_user_status', {
        p_user_id: userId,
        p_status: 'suspended',
      });

      if (error) throw error;

      showToast('User suspended', 'success');
      loadUsers();
    } catch (error) {
      console.error('Suspend failed:', error);
      showToast('Failed to suspend user', 'error');
    }
  };

  const handleActivate = async (userId: string) => {
    try {
      const { error } = await supabase.rpc('admin_set_user_status', {
        p_user_id: userId,
        p_status: 'active',
      });

      if (error) throw error;

      showToast('User activated', 'success');
      loadUsers();
    } catch (error) {
      console.error('Activation failed:', error);
      showToast('Failed to activate user', 'error');
    }
  };

  const handleEdit = (user: UserData) => {
    setEditingUser(user.id);
    setEditForm({
      full_name: user.full_name || '',
      phone: user.phone || '',
      subscription_tier: user.subscription_tier || 'free'
    });
  };

  const handleCancelEdit = () => {
    setEditingUser(null);
    setEditForm({ full_name: '', phone: '', subscription_tier: '' });
  };

  const handleSaveEdit = async (userId: string) => {
    try {
      // Update profile fields
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: editForm.full_name || null,
          phone: editForm.phone || null,
        })
        .eq('id', userId);

      if (profileError) throw profileError;

      // Update subscription tier if changed
      const originalUser = users.find(u => u.id === userId);
      if (originalUser && editForm.subscription_tier !== originalUser.subscription_tier) {
        const { error: tierError } = await supabase.rpc('admin_set_user_tier', {
          p_user_id: userId,
          p_tier: editForm.subscription_tier,
        });

        if (tierError) throw tierError;
      }

      showToast('User updated successfully', 'success');
      setEditingUser(null);
      loadUsers();
    } catch (error) {
      console.error('Update failed:', error);
      showToast('Failed to update user', 'error');
    }
  };

  const handleDeleteClick = (user: UserData) => {
    setDeletingUser({
      id: user.id,
      name: user.full_name || 'User',
      email: user.email
    });
    setDeleteConfirmText('');
  };

  const handleDeleteConfirm = async () => {
    if (!deletingUser) return;

    if (deleteConfirmText !== 'DELETE') {
      showToast('Please type "DELETE" exactly to confirm', 'error');
      return;
    }

    try {
      // Try to use the admin delete function first
      const { error: rpcError } = await supabase.rpc('admin_delete_user', {
        p_user_id: deletingUser.id,
      });

      if (rpcError) {
        // If function doesn't exist or fails, try direct delete
        if (rpcError.code === '42883' || rpcError.message?.includes('does not exist')) {
          // Function doesn't exist, delete directly
          const { error: deleteError } = await supabase
            .from('profiles')
            .delete()
            .eq('id', deletingUser.id);
          
          if (deleteError) throw deleteError;
        } else {
          throw rpcError;
        }
      }

      showToast('User permanently deleted', 'success');
      setDeletingUser(null);
      setDeleteConfirmText('');
      loadUsers();
    } catch (error: any) {
      console.error('Delete failed:', error);
      showToast(`Failed to delete user: ${error.message}`, 'error');
    }
  };

  const handleDeleteCancel = () => {
    setDeletingUser(null);
    setDeleteConfirmText('');
  };

  const filteredUsers = users.filter(user =>
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <button
            onClick={() => window.location.hash = '#/super-admin'}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
          <h1 className="text-2xl font-bold text-gray-900">All Users</h1>
          <p className="text-gray-600">Manage all platform users</p>
        </div>

        <div className="bg-white rounded-xl shadow-md p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by email or name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Access</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tier</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Joined</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Delete</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      {editingUser === user.id ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editForm.full_name}
                            onChange={(e) => setEditForm({...editForm, full_name: e.target.value})}
                            placeholder="Full name"
                            className="w-full px-3 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
                          />
                          <input
                            type="text"
                            value={editForm.phone}
                            onChange={(e) => setEditForm({...editForm, phone: e.target.value})}
                            placeholder="Phone"
                            className="w-full px-3 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
                          />
                        </div>
                      ) : (
                        <div>
                          <p className="font-medium text-gray-900">{user.full_name || 'No name'}</p>
                          <p className="text-sm text-gray-600">{user.email}</p>
                          {user.phone && <p className="text-xs text-gray-500">{user.phone}</p>}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {user.access_type === 'owner' && user.farm_name
                        ? `Owner: ${user.farm_name}`
                        : user.access_type === 'member' && user.farm_name
                          ? `${(user.member_role || 'Member').charAt(0).toUpperCase() + (user.member_role || 'member').slice(1)} at ${user.farm_name}`
                          : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={user.account_status} />
                    </td>
                    <td className="px-6 py-4">
                      {editingUser === user.id ? (
                        <select
                          value={editForm.subscription_tier}
                          onChange={(e) => setEditForm({...editForm, subscription_tier: e.target.value})}
                          className="px-2 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
                        >
                          <option value="free">Free</option>
                          <option value="pro">Pro</option>
                          <option value="enterprise">Enterprise</option>
                        </select>
                      ) : (
                        <TierBadge tier={user.subscription_tier} />
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      {editingUser === user.id ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveEdit(user.id)}
                            className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-sm"
                          >
                            <Save className="w-3 h-3" />
                            Save
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
                          >
                            <X className="w-3 h-3" />
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEdit(user)}
                            className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm"
                          >
                            <Edit className="w-3 h-3" />
                            Edit
                          </button>
                          {user.account_status === 'active' && user.farm_name && (
                            <button
                              onClick={() => setImpersonateUser({
                                id: user.id,
                                name: user.full_name || '',
                                email: user.email
                              })}
                              className="flex items-center gap-1 px-3 py-1 bg-white border border-gray-200 text-gray-900 rounded-lg hover:bg-[#f5f0e8] text-sm"
                            >
                              <Eye className="w-3 h-3" />
                              View As
                            </button>
                          )}
                          {user.account_status === 'active' && (
                            <button
                              onClick={() => handleSuspend(user.id)}
                              className="flex items-center gap-1 px-3 py-1 bg-white border border-gray-200 text-gray-900 rounded-lg hover:bg-[#f5f0e8] text-sm"
                            >
                              <Ban className="w-3 h-3" />
                              Suspend
                            </button>
                          )}
                          {user.account_status === 'suspended' && (
                            <button
                              onClick={() => handleActivate(user.id)}
                              className="flex items-center gap-1 px-3 py-1 bg-white border border-gray-200 text-gray-900 rounded-lg hover:bg-[#f5f0e8] text-sm"
                            >
                              <Play className="w-3 h-3" />
                              Activate
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {!editingUser && (
                        <button
                          onClick={() => handleDeleteClick(user)}
                          className="flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredUsers.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No users found
            </div>
          )}
        </div>
      </div>

      {impersonateUser && (
        <ImpersonationModal
          isOpen={true}
          onClose={() => setImpersonateUser(null)}
          targetUserId={impersonateUser.id}
          targetUserName={impersonateUser.name}
          targetUserEmail={impersonateUser.email}
        />
      )}

      {deletingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Permanently Delete User?</h2>
            </div>

            <div className="mb-6">
              <p className="text-gray-700 mb-4">This will delete:</p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                <li><strong>User:</strong> {deletingUser.name}</li>
                <li><strong>Email:</strong> {deletingUser.email}</li>
                <li>All their farms</li>
                <li>All their data (flocks, tasks, expenses, etc.)</li>
              </ul>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-red-800 font-semibold text-sm">⚠️ This action CANNOT be undone!</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Type <strong>"DELETE"</strong> to confirm:
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Type DELETE here"
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-gray-900"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleDeleteCancel}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleteConfirmText !== 'DELETE'}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-orange-100 text-orange-700',
    active: 'bg-green-100 text-green-700',
    suspended: 'bg-red-100 text-red-700',
    rejected: 'bg-gray-100 text-gray-700',
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${styles[status] || 'bg-gray-100 text-gray-700'}`}>
      {status.toUpperCase()}
    </span>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const styles: Record<string, string> = {
    free: 'bg-gray-100 text-gray-700',
    pro: 'bg-blue-100 text-blue-700',
    enterprise: 'bg-purple-100 text-purple-700',
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${styles[tier] || 'bg-gray-100 text-gray-700'}`}>
      {tier.toUpperCase()}
    </span>
  );
}
