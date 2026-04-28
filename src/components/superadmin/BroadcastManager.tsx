import { useEffect, useState } from 'react';
import { Plus, Trash2, ArrowLeft, Info, AlertTriangle, AlertOctagon, ToggleLeft, ToggleRight } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

interface Broadcast {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'critical';
  target: 'all' | 'free' | 'paid';
  active: boolean;
  dismissable: boolean;
  expires_at: string | null;
  created_at: string;
}

const TYPE_META = {
  info:     { label: 'Info',     icon: Info,          bg: 'bg-blue-100 text-blue-700',   bar: 'bg-blue-600' },
  warning:  { label: 'Warning',  icon: AlertTriangle,  bg: 'bg-amber-100 text-amber-700', bar: 'bg-amber-500' },
  critical: { label: 'Critical', icon: AlertOctagon,   bg: 'bg-red-100 text-red-700',     bar: 'bg-red-600' },
};

export function BroadcastManager() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState('');
  const [type, setType] = useState<'info' | 'warning' | 'critical'>('info');
  const [target, setTarget] = useState<'all' | 'free' | 'paid'>('all');
  const [dismissable, setDismissable] = useState(true);
  const [expiresAt, setExpiresAt] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('broadcasts')
        .select('*')
        .order('created_at', { ascending: false });
      if (error && error.code !== '42P01') throw error;
      setBroadcasts(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!message.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('broadcasts').insert({
        message: message.trim(),
        type,
        target,
        dismissable,
        expires_at: expiresAt || null,
        active: true,
        created_by: user?.id,
      });
      if (error) throw error;
      showToast('Broadcast created — users will see it immediately', 'success');
      setShowForm(false);
      setMessage(''); setType('info'); setTarget('all'); setDismissable(true); setExpiresAt('');
      load();
    } catch {
      showToast('Failed to create broadcast', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (b: Broadcast) => {
    await supabase.from('broadcasts').update({ active: !b.active }).eq('id', b.id);
    setBroadcasts(prev => prev.map(x => x.id === b.id ? { ...x, active: !x.active } : x));
  };

  const handleDelete = async (id: string) => {
    await supabase.from('broadcasts').delete().eq('id', id);
    setBroadcasts(prev => prev.filter(b => b.id !== id));
    showToast('Broadcast deleted', 'success');
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <button onClick={() => { window.location.hash = '#/super-admin'; }}
          className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-6 text-sm">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Broadcast Banners</h1>
            <p className="text-gray-500 text-sm mt-1">Messages shown as a banner inside the app for all logged-in users</p>
          </div>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800">
            <Plus className="w-4 h-4" /> New Broadcast
          </button>
        </div>

        {/* Preview of how it looks */}
        <div className="mb-6 rounded-xl overflow-hidden border border-gray-200">
          <div className="bg-gray-100 px-4 py-2 text-xs text-gray-500 font-medium">Preview — how it appears in the app</div>
          <div className="bg-blue-600 text-white flex items-center justify-center gap-3 px-4 py-2.5 text-sm font-medium">
            <Info className="w-4 h-4" />
            <span>🚀 New feature: Smart receipt import is now live! Tap Eden AI to try it.</span>
            <button className="ml-2 p-1 rounded-full hover:bg-blue-700 opacity-80"><span className="text-xs">✕</span></button>
          </div>
        </div>

        {/* Create form */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
            <h2 className="font-bold text-gray-900 mb-5">Create Broadcast</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Message</label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-none"
                  placeholder="e.g. 🚀 New feature: Smart Import is now live! Try it from the sidebar."
                />
                <p className="text-xs text-gray-400 mt-1">{message.length}/280 characters</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Type</label>
                  <select value={type} onChange={e => setType(e.target.value as any)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none">
                    <option value="info">ℹ️ Info — blue banner</option>
                    <option value="warning">⚠️ Warning — amber banner</option>
                    <option value="critical">🚨 Critical — red banner</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Audience</label>
                  <select value={target} onChange={e => setTarget(e.target.value as any)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none">
                    <option value="all">All users</option>
                    <option value="free">Free plan only</option>
                    <option value="paid">Paid plans only</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Expires at (optional)</label>
                  <input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none" />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <button type="button" onClick={() => setDismissable(d => !d)} className="text-gray-400 hover:text-gray-700">
                      {dismissable
                        ? <ToggleRight className="w-7 h-7 text-green-500" />
                        : <ToggleLeft className="w-7 h-7" />}
                    </button>
                    <div>
                      <p className="text-sm font-semibold text-gray-700">Dismissable</p>
                      <p className="text-xs text-gray-400">{dismissable ? 'Users can close it' : 'Cannot be closed'}</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
                <button onClick={handleCreate} disabled={!message.trim() || saving}
                  className="flex-1 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-bold hover:bg-gray-800 disabled:opacity-50">
                  {saving ? 'Creating…' : 'Create & Publish'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading…</div>
        ) : broadcasts.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
            <p className="text-gray-400 text-sm">No broadcasts yet. Create one to show a message to all users.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {broadcasts.map(b => {
              const meta = TYPE_META[b.type] || TYPE_META.info;
              const Icon = meta.icon;
              return (
                <div key={b.id} className={`bg-white rounded-2xl border border-gray-100 overflow-hidden transition-opacity ${b.active ? '' : 'opacity-50'}`}>
                  <div className={`h-1 ${meta.bar}`} />
                  <div className="p-5 flex items-start gap-4">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 font-medium leading-snug">{b.message}</p>
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${meta.bg}`}>{meta.label}</span>
                        <span className="text-xs text-gray-400">→ {b.target === 'all' ? 'All users' : b.target === 'free' ? 'Free only' : 'Paid only'}</span>
                        {!b.dismissable && <span className="text-xs text-gray-400">• Non-dismissable</span>}
                        {b.expires_at && <span className="text-xs text-gray-400">• Expires {new Date(b.expires_at).toLocaleDateString()}</span>}
                        <span className="text-xs text-gray-400">• {new Date(b.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => toggleActive(b)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${b.active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                        {b.active ? 'Live' : 'Off'}
                      </button>
                      <button onClick={() => handleDelete(b.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
