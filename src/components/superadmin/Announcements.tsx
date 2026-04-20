import { useEffect, useState } from 'react';
import { ArrowLeft, Send, Plus, Calendar, Users, Building2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../../contexts/ToastContext';

interface Announcement {
  id: string;
  title: string;
  message: string;
  target_audience: 'all_owners' | 'pro_tier' | 'enterprise_tier' | 'free_tier' | 'specific_farms';
  scheduled_for: string | null;
  sent_at: string | null;
  created_at: string;
  created_by: string;
  status: 'draft' | 'scheduled' | 'sent';
}

export function Announcements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const loadAnnouncements = async () => {
    try {
      const { data, error } = await supabase
        .from('platform_announcements')
        .select('*')
        .order('created_at', { ascending: false });

      if (error && error.code === '42P01') {
        // Table doesn't exist
        setAnnouncements([]);
      } else if (error) {
        throw error;
      } else {
        setAnnouncements(data || []);
      }
    } catch (error) {
      console.error('Failed to load announcements:', error);
      setAnnouncements([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSendAnnouncement = async (announcement: Partial<Announcement>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('platform_announcements')
        .insert({
          title: announcement.title,
          message: announcement.message,
          target_audience: announcement.target_audience || 'all_owners',
          scheduled_for: announcement.scheduled_for || null,
          sent_at: announcement.scheduled_for ? null : new Date().toISOString(),
          created_by: user?.id,
          status: announcement.scheduled_for ? 'scheduled' : 'sent',
        });

      if (error) throw error;

      showToast('Announcement sent successfully', 'success');
      setShowCreateModal(false);
      loadAnnouncements();
    } catch (error) {
      console.error('Failed to send announcement:', error);
      showToast('Failed to send announcement', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading announcements...</p>
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
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
              <p className="text-gray-600">Send messages to all owners or specific subscription tiers</p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <Plus className="w-5 h-5" />
              New Announcement
            </button>
          </div>
        </div>

        {announcements.length === 0 && !loading && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
            <p className="text-yellow-800 font-medium">Platform Announcements Table Not Found</p>
            <p className="text-yellow-700 text-sm mt-2">
              The platform_announcements table needs to be created in your database. 
              This feature will be available once the table is set up.
            </p>
          </div>
        )}

        <div className="grid gap-6">
          {announcements.map((announcement) => (
            <div key={announcement.id} className="bg-white rounded-xl shadow-md p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{announcement.title}</h3>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                    <span className="flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      {getAudienceLabel(announcement.target_audience)}
                    </span>
                    {announcement.scheduled_for && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {new Date(announcement.scheduled_for).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
                <StatusBadge status={announcement.status} />
              </div>
              <p className="text-gray-700 whitespace-pre-wrap">{announcement.message}</p>
              <div className="mt-4 pt-4 border-t border-gray-200 text-sm text-gray-500">
                {announcement.sent_at 
                  ? `Sent: ${new Date(announcement.sent_at).toLocaleString()}`
                  : `Created: ${new Date(announcement.created_at).toLocaleString()}`
                }
              </div>
            </div>
          ))}
        </div>

        {showCreateModal && (
          <CreateAnnouncementModal
            onClose={() => setShowCreateModal(false)}
            onSend={handleSendAnnouncement}
          />
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    scheduled: 'bg-blue-100 text-blue-700',
    sent: 'bg-green-100 text-green-700',
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${styles[status] || 'bg-gray-100 text-gray-700'}`}>
      {status.toUpperCase()}
    </span>
  );
}

function getAudienceLabel(audience: string): string {
  const labels: Record<string, string> = {
    all_owners: 'All Farm Owners',
    pro_tier: 'Pro Tier Only',
    enterprise_tier: 'Enterprise Tier Only',
    free_tier: 'Free Tier Only',
    specific_farms: 'Specific Farms',
  };
  return labels[audience] || audience;
}

function CreateAnnouncementModal({ onClose, onSend }: { onClose: () => void; onSend: (announcement: Partial<Announcement>) => void }) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetAudience, setTargetAudience] = useState<'all_owners' | 'pro_tier' | 'enterprise_tier' | 'free_tier'>('all_owners');
  const [scheduledFor, setScheduledFor] = useState('');
  const [sendNow, setSendNow] = useState(true);

  const handleSubmit = () => {
    if (!title || !message) {
      alert('Please fill in title and message');
      return;
    }

    onSend({
      title,
      message,
      target_audience: targetAudience,
      scheduled_for: sendNow ? null : scheduledFor,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Create Announcement</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
              placeholder="Announcement title..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message *
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
              rows={6}
              placeholder="Enter your message..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Target Audience
            </label>
            <select
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            >
              <option value="all_owners">All Farm Owners</option>
              <option value="pro_tier">Pro Tier Only</option>
              <option value="enterprise_tier">Enterprise Tier Only</option>
              <option value="free_tier">Free Tier Only</option>
            </select>
          </div>
          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={sendNow}
                onChange={(e) => setSendNow(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm font-medium text-gray-700">Send immediately</span>
            </label>
          </div>
          {!sendNow && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Schedule For
              </label>
              <input
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
              />
            </div>
          )}
        </div>
        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <Send className="w-4 h-4" />
            {sendNow ? 'Send Now' : 'Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}












