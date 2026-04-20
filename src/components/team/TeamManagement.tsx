import { useEffect, useState } from 'react';
import { Users, Mail, UserPlus, Shield, Trash2, Loader2, AlertCircle, DollarSign, Copy, RotateCcw, XCircle, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { FarmMemberWithProfile, MemberRole } from '../../types/database';
import { SetCompensationModal } from './SetCompensationModal';
import { TeamActivityLog } from './TeamActivityLog';
import { InviteMemberModal } from './InviteMemberModal';
import { formatCurrency } from '../../utils/currency';

interface Invitation {
  id: string;
  invited_email: string;
  role: MemberRole;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  token: string | null;
  expires_at: string | null;
  created_at: string;
  accepted_at: string | null;
  invited_by_profile: {
    full_name: string;
  } | null;
}

export function TeamManagement() {
  const { t } = useTranslation();
  const { profile, currentFarm, currentRole } = useAuth();
  const [members, setMembers] = useState<FarmMemberWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<MemberRole>('worker');
  const [addingMember, setAddingMember] = useState(false);
  const [addMemberError, setAddMemberError] = useState<string | null>(null);
  const [addMemberSuccess, setAddMemberSuccess] = useState<string | null>(null);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);

  const [compensationModalOpen, setCompensationModalOpen] = useState(false);
  const [selectedMemberForCompensation, setSelectedMemberForCompensation] = useState<FarmMemberWithProfile | null>(null);
  const [memberPayRates, setMemberPayRates] = useState<Record<string, any>>({});
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);
  const [resendingInviteId, setResendingInviteId] = useState<string | null>(null);

  const [activityLogRefreshTrigger, setActivityLogRefreshTrigger] = useState(0);

  useEffect(() => {
    if (currentFarm?.id && profile?.id) {
      setIsOwner(currentRole === 'owner');
      loadTeamMembers();
      loadInvitations();
      loadPayRates();
    }
  }, [currentFarm?.id, profile?.id, currentRole]);

  const loadTeamMembers = async () => {
    if (!currentFarm?.id) return;

    try {
      setLoading(true);
      setError(null);

      const { data: membersData, error: membersError } = await supabase.rpc(
        'get_farm_members_with_emails',
        { p_farm_id: currentFarm.id }
      );

      if (membersError) throw membersError;

      const membersWithProfile = (membersData || []).map(member => ({
        id: member.id,
        farm_id: member.farm_id,
        user_id: member.user_id,
        role: member.role,
        is_active: member.is_active,
        invited_by: member.invited_by,
        invited_at: member.invited_at,
        joined_at: member.joined_at,
        created_at: member.created_at,
        updated_at: member.updated_at,
        profiles: {
          id: member.user_id,
          full_name: member.full_name,
          email: member.email
        }
      } as FarmMemberWithProfile));

      setMembers(membersWithProfile);
    } catch (err: any) {
      console.error('Error loading team members:', err);
      setError(err.message || 'Failed to load team members');
    } finally {
      setLoading(false);
    }
  };

  const loadInvitations = async () => {
    if (!currentFarm?.id) return;

    try {
      setLoadingInvitations(true);

      const { data: invitationsData, error: invitationsError } = await supabase
        .from('team_invitations')
        .select(`
          id,
          invited_email,
          role,
          status,
          token,
          expires_at,
          created_at,
          accepted_at,
          invited_by_profile:invited_by (
            full_name
          )
        `)
        .eq('farm_id', currentFarm.id)
        .order('created_at', { ascending: false });

      if (invitationsError) throw invitationsError;

      const formattedInvitations = (invitationsData || []).map(inv => ({
        id: inv.id,
        invited_email: inv.invited_email,
        role: inv.role as MemberRole,
        status: (inv.status || (inv.accepted_at ? 'accepted' : 'pending')) as 'pending' | 'accepted' | 'expired' | 'revoked',
        token: inv.token,
        expires_at: inv.expires_at,
        created_at: inv.created_at,
        accepted_at: inv.accepted_at,
        invited_by_profile: Array.isArray(inv.invited_by_profile)
          ? inv.invited_by_profile[0]
          : inv.invited_by_profile
      }));

      setInvitations(formattedInvitations);
    } catch (err: any) {
      console.error('Error loading invitations:', err);
    } finally {
      setLoadingInvitations(false);
    }
  };

  const handleCopyInviteLink = async (token: string) => {
    try {
      const link = `${window.location.origin}/#/invite/${token}`;
      await navigator.clipboard.writeText(link);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!confirm('Are you sure you want to revoke this invitation?')) return;

    try {
      setRevokingInviteId(inviteId);
      const { data, error } = await supabase.rpc('revoke_team_invitation', {
        p_invite_id: inviteId
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        setAddMemberError(result.error || 'Failed to revoke invitation');
        return;
      }

      await loadInvitations();
      setActivityLogRefreshTrigger(prev => prev + 1);
      setAddMemberSuccess('Invitation revoked successfully');
      setTimeout(() => setAddMemberSuccess(null), 3000);
    } catch (err: any) {
      console.error('Error revoking invite:', err);
      setAddMemberError(err.message || 'Failed to revoke invitation');
    } finally {
      setRevokingInviteId(null);
    }
  };

  const handleResendInvite = async (inviteId: string) => {
    try {
      setResendingInviteId(inviteId);
      const { data, error } = await supabase.rpc('resend_team_invitation', {
        p_invite_id: inviteId
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; token?: string };
      if (!result.success) {
        setAddMemberError(result.error || 'Failed to resend invitation');
        return;
      }

      await loadInvitations();
      setActivityLogRefreshTrigger(prev => prev + 1);
      setAddMemberSuccess('Invitation resent successfully');
      setTimeout(() => setAddMemberSuccess(null), 3000);
    } catch (err: any) {
      console.error('Error resending invite:', err);
      setAddMemberError(err.message || 'Failed to resend invitation');
    } finally {
      setResendingInviteId(null);
    }
  };

  const loadPayRates = async () => {
    if (!currentFarm?.id) return;

    try {
      const { data, error } = await supabase
        .from('worker_pay_rates')
        .select('*')
        .eq('farm_id', currentFarm.id)
        .order('effective_from', { ascending: false });

      if (error) throw error;

      const ratesMap: Record<string, any> = {};
      (data || []).forEach(rate => {
        if (!ratesMap[rate.user_id]) {
          ratesMap[rate.user_id] = rate;
        }
      });

      setMemberPayRates(ratesMap);
    } catch (err: any) {
      console.error('Error loading pay rates:', err);
    }
  };

  const handleRoleChange = async (memberId: string, newRole: MemberRole) => {
    if (!currentFarm?.id || !isOwner || updatingRoleId) return;

    const member = members.find(m => m.id === memberId);
    if (!member) return;

    try {
      setUpdatingRoleId(memberId);
      setAddMemberError(null);
      setAddMemberSuccess(null);

      const { error } = await supabase.rpc('update_farm_member_role', {
        p_farm_member_id: memberId,
        p_new_role: newRole
      });

      if (error) throw error;

      await loadTeamMembers();
      setActivityLogRefreshTrigger(prev => prev + 1);

      setAddMemberSuccess('Role updated successfully');
      setTimeout(() => setAddMemberSuccess(null), 3000);
    } catch (err: any) {
      console.error('Error updating member role:', err);
      setAddMemberError(err.message || 'Failed to update member role');
      setTimeout(() => setAddMemberError(null), 3000);
    } finally {
      setUpdatingRoleId(null);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentFarm?.id || !isOwner) return;
    if (!newMemberEmail.trim()) {
      setAddMemberError('Please enter an email address');
      return;
    }

    try {
      setAddingMember(true);
      setAddMemberError(null);
      setAddMemberSuccess(null);

      const email = newMemberEmail.trim().toLowerCase();

      const { data: addMemberData, error: addMemberError } = await supabase.rpc('add_or_update_farm_member', {
        p_farm_id: currentFarm.id,
        p_member_email: email,
        p_role: newMemberRole
      });

      if (addMemberError) throw addMemberError;

      const addResult = addMemberData as { success: boolean; error?: string; message?: string };

      if (addResult.success) {
        setAddMemberSuccess(addResult.message || 'Member added successfully');
        setNewMemberEmail('');
        setNewMemberRole('worker');

        await loadTeamMembers();
        setActivityLogRefreshTrigger(prev => prev + 1);

        setTimeout(() => setAddMemberSuccess(null), 3000);
      } else {
        if (addResult.error?.includes('not found')) {
          const { data: inviteData, error: inviteError } = await supabase.rpc('invite_team_member', {
            p_farm_id: currentFarm.id,
            p_email: email,
            p_role: newMemberRole
          });

          if (inviteError) throw inviteError;

          const inviteResult = inviteData as { success: boolean; error?: string; message?: string; user_exists?: boolean };

          if (!inviteResult.success) {
            throw new Error(inviteResult.error || 'Failed to send invitation');
          }

          setAddMemberSuccess('Invitation sent! This user will be added automatically when they sign in.');
          setNewMemberEmail('');
          setNewMemberRole('worker');

          await loadInvitations();
          setActivityLogRefreshTrigger(prev => prev + 1);

          setTimeout(() => setAddMemberSuccess(null), 5000);
        } else {
          throw new Error(addResult.error || 'Failed to add member');
        }
      }
    } catch (err: any) {
      console.error('Error adding member:', err);
      setAddMemberError(err.message || 'Failed to add member');
    } finally {
      setAddingMember(false);
    }
  };

  const handleToggleMemberStatus = async (memberId: string, currentStatus: boolean) => {
    if (!currentFarm?.id || !isOwner || updatingStatusId) return;

    const member = members.find(m => m.id === memberId);
    if (!member) return;

    if (member.user_id === profile.id) {
      setAddMemberError('You cannot change your own active status');
      setTimeout(() => setAddMemberError(null), 3000);
      return;
    }

    const action = currentStatus ? 'deactivate' : 'reactivate';
    if (!confirm(`Are you sure you want to ${action} ${member.profiles.full_name}?`)) {
      return;
    }

    try {
      setUpdatingStatusId(memberId);
      setAddMemberError(null);
      setAddMemberSuccess(null);

      const { error } = await supabase.rpc('set_farm_member_active', {
        p_farm_member_id: memberId,
        p_is_active: !currentStatus
      });

      if (error) throw error;

      await loadTeamMembers();
      setActivityLogRefreshTrigger(prev => prev + 1);

      setAddMemberSuccess(`Member ${action}d successfully`);
      setTimeout(() => setAddMemberSuccess(null), 3000);
    } catch (err: any) {
      console.error(`Error ${action}ing member:`, err);
      setAddMemberError(err.message || `Failed to ${action} member`);
      setTimeout(() => setAddMemberError(null), 3000);
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleOpenCompensationModal = (member: FarmMemberWithProfile) => {
    setSelectedMemberForCompensation(member);
    setCompensationModalOpen(true);
  };

  const handleCompensationSuccess = () => {
    loadPayRates();
    setActivityLogRefreshTrigger(prev => prev + 1);
  };

  const getPayRateSummary = (userId: string) => {
    const rate = memberPayRates[userId];
    if (!rate) return null;

    if (rate.pay_type === 'hourly') {
      return `Hourly: ${formatCurrency(rate.hourly_rate, rate.currency)}/hr (OT: ${formatCurrency(rate.overtime_rate, rate.currency)}/hr)`;
    } else {
      return `Salary: ${formatCurrency(rate.monthly_salary, rate.currency)}/month`;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-neon-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      <div className="section-card">
        <div className="flex items-center gap-3 mb-6">
          <div className="icon-circle-yellow">
            <Users className="w-5 h-5" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">{t('team.title')}</h2>
        </div>

        {!isOwner && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-800">
              {t('team.must_be_owner') || 'You need to be a farm owner to manage team members.'}
            </p>
          </div>
        )}

        {isOwner && (
          <div className="bg-gradient-to-br from-neon-50 to-neon-100/50 rounded-2xl p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-neon-700" />
                {t('team.invite_member')}
              </h3>
              <button
                onClick={() => setInviteModalOpen(true)}
                className="btn-primary flex items-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                {t('team.invite_member')}
              </button>
            </div>

            {addMemberError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">{addMemberError}</p>
              </div>
            )}

            {addMemberSuccess && (
              <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                <p className="text-sm text-green-800">{addMemberSuccess}</p>
              </div>
            )}

            <p className="text-sm text-gray-600">
              {t('team.invite_description_short') || 'Send a link to add them to this farm.'}
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">{t('team.error_loading') || 'Error loading team members'}</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('team.name') || 'Name'}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('team.email') || 'Email'}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('team.role')}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('team.status')}</th>
                {isOwner && <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('team.compensation') || 'Compensation'}</th>}
                {isOwner && <th className="text-right py-3 px-4 font-semibold text-gray-700">{t('common.actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td colSpan={isOwner ? 6 : 4} className="text-center py-8 text-gray-500">
                    {t('team.no_members')}
                  </td>
                </tr>
              ) : (
                members.map((member) => (
                  <tr key={member.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="font-medium text-gray-900">
                        {member.profiles.full_name}
                        {member.user_id === profile?.id && (
                          <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{t('common.you') || 'You'}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {member.profiles.email}
                    </td>
                    <td className="py-3 px-4">
                      {isOwner && member.user_id !== profile?.id ? (
                        <div className="relative">
                          <select
                            value={member.role}
                            onChange={(e) => handleRoleChange(member.id, e.target.value as MemberRole)}
                            disabled={updatingRoleId === member.id}
                            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <option value="owner">{t('team.owner')}</option>
                            <option value="manager">{t('team.manager')}</option>
                            <option value="worker">{t('team.worker')}</option>
                            <option value="viewer">{t('team.viewer')}</option>
                          </select>
                          {updatingRoleId === member.id && (
                            <div className="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none">
                              <Loader2 className="w-4 h-4 animate-spin text-green-600" />
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium">
                          <Shield className="w-4 h-4" />
                          {t(`team.${member.role}`)}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {member.is_active ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                          <div className="w-1.5 h-1.5 bg-green-600 rounded-full" />
                          {t('team.active')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-medium">
                          <div className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                          {t('team.inactive')}
                        </span>
                      )}
                    </td>
                    {isOwner && (
                      <td className="py-3 px-4">
                        <div className="text-sm text-gray-600">
                          {getPayRateSummary(member.user_id) || (
                            <span className="text-gray-400 italic">{t('team.not_set') || 'Not set'}</span>
                          )}
                        </div>
                      </td>
                    )}
                    {isOwner && member.user_id !== profile?.id && (
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => handleOpenCompensationModal(member)}
                            className="text-green-600 hover:text-green-700 text-sm font-medium flex items-center gap-1 transition-colors"
                            title="Set compensation"
                          >
                            <DollarSign className="w-4 h-4" />
                            {t('team.set_pay') || 'Set Pay'}
                          </button>
                          {member.is_active ? (
                            <button
                              onClick={() => handleToggleMemberStatus(member.id, member.is_active)}
                              disabled={updatingStatusId === member.id}
                              className="text-red-600 hover:text-red-700 text-sm font-medium flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              title={t('team.deactivate_member') || 'Deactivate member'}
                            >
                              {updatingStatusId === member.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleToggleMemberStatus(member.id, member.is_active)}
                              disabled={updatingStatusId === member.id}
                              className="text-green-600 hover:text-green-700 text-sm font-medium flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              title={t('team.reactivate_member') || 'Reactivate member'}
                            >
                              {updatingStatusId === member.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <span>{t('team.reactivate') || 'Reactivate'}</span>
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <TeamActivityLog farmId={currentFarm.id} refreshTrigger={activityLogRefreshTrigger} />

        <div className="mt-8">
          <div className="flex items-center gap-2 mb-4">
            <Mail className="w-5 h-5 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-900">{t('team.invitations') || 'Invitations'}</h3>
          </div>

          {loadingInvitations ? (
            <div className="flex items-center justify-center h-32 bg-gray-50 rounded-lg">
              <Loader2 className="w-6 h-6 animate-spin text-green-600" />
            </div>
          ) : invitations.length === 0 ? (
            <div className="bg-gray-50 rounded-lg p-8 text-center">
              <Mail className="w-12 h-12 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-600">{t('team.no_invitations') || 'No invitations yet'}</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('team.email')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('team.role')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('team.status')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('team.date') || 'Date'}
                    </th>
                    {isOwner && (
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {t('common.actions')}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {invitations.map((invitation) => (
                    <tr key={invitation.id} className={invitation.status === 'accepted' ? 'bg-green-50' : invitation.status === 'revoked' ? 'bg-gray-50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {invitation.invited_email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                          {t(`team.${invitation.role}`)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {invitation.status === 'accepted' ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            {t('team.accepted') || 'Accepted'}
                          </span>
                        ) : invitation.status === 'revoked' ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            {t('team.revoked') || 'Revoked'}
                          </span>
                        ) : invitation.status === 'expired' || (invitation.expires_at && new Date(invitation.expires_at) < new Date()) ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            {t('team.expired') || 'Expired'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            {t('team.pending')}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {invitation.status === 'accepted' && invitation.accepted_at
                          ? `${t('team.accepted')} ${new Date(invitation.accepted_at).toLocaleDateString()}`
                          : invitation.expires_at
                          ? `${t('team.expires') || 'Expires'} ${new Date(invitation.expires_at).toLocaleDateString()}`
                          : `${t('team.sent') || 'Sent'} ${new Date(invitation.created_at).toLocaleDateString()}`}
                      </td>
                      {isOwner && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                          {invitation.status === 'pending' && invitation.token && (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleCopyInviteLink(invitation.token!)}
                                className="text-blue-600 hover:text-blue-700 transition-colors"
                                title="Copy invite link"
                              >
                                {copiedToken === invitation.token ? (
                                  <CheckCircle className="w-4 h-4" />
                                ) : (
                                  <Copy className="w-4 h-4" />
                                )}
                              </button>
                              <button
                                onClick={() => handleResendInvite(invitation.id)}
                                disabled={resendingInviteId === invitation.id}
                                className="text-green-600 hover:text-green-700 transition-colors disabled:opacity-50"
                                title="Resend invite"
                              >
                                {resendingInviteId === invitation.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <RotateCcw className="w-4 h-4" />
                                )}
                              </button>
                              <button
                                onClick={() => handleRevokeInvite(invitation.id)}
                                disabled={revokingInviteId === invitation.id}
                                className="text-red-600 hover:text-red-700 transition-colors disabled:opacity-50"
                                title="Revoke invite"
                              >
                                {revokingInviteId === invitation.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <XCircle className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          )}
                          {(invitation.status === 'expired' || invitation.status === 'revoked') && (
                            <button
                              onClick={() => handleResendInvite(invitation.id)}
                              disabled={resendingInviteId === invitation.id}
                              className="text-green-600 hover:text-green-700 text-xs font-medium transition-colors disabled:opacity-50"
                            >
                              {resendingInviteId === invitation.id ? t('team.resending') || 'Resending...' : t('team.resend') || 'Resend'}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-6 bg-gray-50 rounded-2xl p-5">
          <h4 className="font-semibold text-gray-900 mb-3">{t('team.role_descriptions') || 'Role Descriptions'}</h4>
          <ul className="space-y-2 text-sm text-gray-600">
            <li><span className="font-medium text-gray-900">{t('team.owner')}:</span> {t('team.owner_desc') || 'Full access to all features including team management and billing'}</li>
            <li><span className="font-medium text-gray-900">{t('team.manager')}:</span> {t('team.manager_desc')}</li>
            <li><span className="font-medium text-gray-900">{t('team.worker')}:</span> {t('team.worker_desc')}</li>
            <li><span className="font-medium text-gray-900">{t('team.viewer')}:</span> {t('team.viewer_desc')}</li>
          </ul>
        </div>
      </div>

      {compensationModalOpen && selectedMemberForCompensation && currentFarm?.id && (
        <SetCompensationModal
          farmId={currentFarm.id}
          userId={selectedMemberForCompensation.user_id}
          workerName={selectedMemberForCompensation.profiles.full_name}
          onClose={() => setCompensationModalOpen(false)}
          onSuccess={handleCompensationSuccess}
        />
      )}

      {inviteModalOpen && currentFarm?.id && (
        <InviteMemberModal
          farmId={currentFarm.id}
          onClose={() => setInviteModalOpen(false)}
          onSuccess={() => {
            loadInvitations();
            setActivityLogRefreshTrigger(prev => prev + 1);
          }}
        />
      )}
    </div>
  );
}
