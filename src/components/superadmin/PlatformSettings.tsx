import { useEffect, useState } from 'react';
import { ArrowLeft, Save, ToggleLeft, ToggleRight, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../../contexts/ToastContext';

interface PlatformSettings {
  maintenance_mode: boolean;
  maintenance_message: string;
  app_version: string;
  min_app_version: string;
  whatsapp_support_number: string;
  whatsapp_support_message: string;
  feature_flags: {
    ai_assistant: boolean;
    smart_upload: boolean;
    marketplace: boolean;
    voice_commands: boolean;
    weather_integration: boolean;
    predictive_analytics: boolean;
  };
}

export function PlatformSettings() {
  const [settings, setSettings] = useState<PlatformSettings>({
    maintenance_mode: false,
    maintenance_message: 'The platform is currently under maintenance. Please check back soon.',
    app_version: '1.0.0',
    min_app_version: '1.0.0',
    whatsapp_support_number: '',
    whatsapp_support_message: 'Hello! I need help with Ebenezer Farms app.',
    feature_flags: {
      ai_assistant: true,
      smart_upload: true,
      marketplace: true,
      voice_commands: true,
      weather_integration: true,
      predictive_analytics: true,
    },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      // Try to load from platform_settings table if it exists
      const { data, error } = await supabase
        .from('platform_settings')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') {
        // Table doesn't exist or other error - use defaults
        console.log('Using default settings');
      } else if (data) {
        setSettings({
          maintenance_mode: data.maintenance_mode || false,
          maintenance_message: data.maintenance_message || settings.maintenance_message,
          app_version: data.app_version || '1.0.0',
          min_app_version: data.min_app_version || '1.0.0',
          whatsapp_support_number: data.whatsapp_support_number || '',
          whatsapp_support_message: data.whatsapp_support_message || settings.whatsapp_support_message,
          feature_flags: data.feature_flags || settings.feature_flags,
        });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Try to upsert to platform_settings table
      const { error } = await supabase
        .from('platform_settings')
        .upsert({
          id: 'platform',
          ...settings,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'id'
        });

      if (error) {
        // If table doesn't exist, show warning but don't fail
        if (error.code === '42P01') {
          showToast('Platform settings table not found. Please create it first.', 'warning');
        } else {
          throw error;
        }
      } else {
        showToast('Settings saved successfully', 'success');
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      showToast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleFeature = (feature: keyof PlatformSettings['feature_flags']) => {
    setSettings(prev => ({
      ...prev,
      feature_flags: {
        ...prev.feature_flags,
        [feature]: !prev.feature_flags[feature],
      },
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <button
            onClick={() => window.location.hash = '#/super-admin'}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Platform Settings</h1>
          <p className="text-gray-600">Configure global platform settings and feature flags</p>
        </div>

        <div className="space-y-6">
          {/* Maintenance Mode */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Maintenance Mode</h2>
                <p className="text-sm text-gray-600">Enable to temporarily disable platform access</p>
              </div>
              <button
                onClick={() => setSettings(prev => ({ ...prev, maintenance_mode: !prev.maintenance_mode }))}
                className="text-4xl"
              >
                {settings.maintenance_mode ? (
                  <ToggleRight className="text-red-600" />
                ) : (
                  <ToggleLeft className="text-gray-400" />
                )}
              </button>
            </div>
            {settings.maintenance_mode && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Maintenance Message
                </label>
                <textarea
                  value={settings.maintenance_message}
                  onChange={(e) => setSettings(prev => ({ ...prev, maintenance_message: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  rows={3}
                  placeholder="Enter maintenance message..."
                />
              </div>
            )}
          </div>

          {/* App Versions */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">App Version Management</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Current App Version
                </label>
                <input
                  type="text"
                  value={settings.app_version}
                  onChange={(e) => setSettings(prev => ({ ...prev, app_version: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="1.0.0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Minimum Required Version
                </label>
                <input
                  type="text"
                  value={settings.min_app_version}
                  onChange={(e) => setSettings(prev => ({ ...prev, min_app_version: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="1.0.0"
                />
                <p className="mt-1 text-sm text-gray-500">
                  Users with versions below this will be prompted to update
                </p>
              </div>
            </div>
          </div>

          {/* WhatsApp Support */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">WhatsApp Support</h2>
            <p className="text-sm text-gray-600 mb-6">Configure WhatsApp support link for users to contact you</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  WhatsApp Number (with country code, e.g., +1234567890)
                </label>
                <input
                  type="text"
                  value={settings.whatsapp_support_number}
                  onChange={(e) => setSettings(prev => ({ ...prev, whatsapp_support_number: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="+1234567890"
                />
                <p className="mt-1 text-sm text-gray-500">
                  Users will be able to click a support button to message you on WhatsApp
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Default Message
                </label>
                <textarea
                  value={settings.whatsapp_support_message}
                  onChange={(e) => setSettings(prev => ({ ...prev, whatsapp_support_message: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  rows={3}
                  placeholder="Hello! I need help with Ebenezer Farms app."
                />
                <p className="mt-1 text-sm text-gray-500">
                  Pre-filled message when users click support
                </p>
              </div>
            </div>
          </div>

          {/* Feature Flags */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Feature Flags</h2>
            <p className="text-sm text-gray-600 mb-6">Enable or disable features globally across the platform</p>
            <div className="space-y-4">
              {Object.entries(settings.feature_flags).map(([feature, enabled]) => (
                <div key={feature} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="font-medium text-gray-900 capitalize">
                      {feature.replace(/_/g, ' ')}
                    </p>
                    <p className="text-sm text-gray-500">
                      {getFeatureDescription(feature as keyof PlatformSettings['feature_flags'])}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleFeature(feature as keyof PlatformSettings['feature_flags'])}
                    className="text-3xl"
                  >
                    {enabled ? (
                      <ToggleRight className="text-green-600" />
                    ) : (
                      <ToggleLeft className="text-gray-400" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-5 h-5" />
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>

          {/* Warning */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-yellow-800">Database Table Required</p>
              <p className="text-sm text-yellow-700 mt-1">
                The platform_settings table needs to be created in your database for these settings to persist.
                Contact your database administrator to create the table.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getFeatureDescription(feature: keyof PlatformSettings['feature_flags']): string {
  const descriptions: Record<string, string> = {
    ai_assistant: 'AI-powered chat assistant for farm management help',
    smart_upload: 'Smart file import with AI-powered data extraction',
    marketplace: 'Supplier marketplace for farm equipment and supplies',
    voice_commands: 'Voice command interface for hands-free operation',
    weather_integration: 'Real-time weather data and impact analysis',
    predictive_analytics: 'Machine learning predictions for production and costs',
  };
  return descriptions[feature] || 'Feature description';
}


