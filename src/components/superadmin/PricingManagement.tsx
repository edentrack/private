import { useEffect, useState } from 'react';
import { ArrowLeft, Edit, Save, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../../contexts/ToastContext';

interface SubscriptionTier {
  id: string;
  name: string;
  price_monthly: number;
  price_yearly: number;
  max_flocks: number;
  max_team_members: number;
  features: Record<string, boolean>;
  is_active: boolean;
}

interface EditFormData {
  price_monthly: number;
  price_yearly: number;
  max_flocks: number;
  max_team_members: number;
}

export function PricingManagement() {
  const [tiers, setTiers] = useState<SubscriptionTier[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    loadTiers();
  }, []);

  const loadTiers = async () => {
    try {
      const { data, error } = await supabase
        .from('subscription_tiers')
        .select('*')
        .order('price_monthly');

      if (error) throw error;
      setTiers(data || []);
    } catch (error) {
      console.error('Failed to load tiers:', error);
      showToast('Failed to load pricing tiers', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (tierId: string, updates: EditFormData) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('subscription_tiers')
        .update(updates)
        .eq('id', tierId);

      if (error) throw error;

      await supabase.from('admin_actions').insert({
        admin_id: user?.id,
        action_type: 'tier_updated',
        target_user_id: null,
        details: { tier_id: tierId, updates },
      });

      showToast('Pricing tier updated successfully', 'success');
      loadTiers();
      setEditingId(null);
    } catch (error) {
      console.error('Update failed:', error);
      showToast('Failed to update tier', 'error');
    }
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
        <div className="mb-6">
          <button
            onClick={() => window.location.hash = '#/super-admin'}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Pricing Tiers</h1>
          <p className="text-gray-600">Manage subscription plans and limits</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {tiers.map((tier) => (
            <div key={tier.id} className="bg-white rounded-xl shadow-md p-6">
              <h3 className="text-xl font-bold mb-2 capitalize">{tier.name}</h3>

              {editingId === tier.id ? (
                <EditTierForm
                  tier={tier}
                  onSave={(updates) => handleUpdate(tier.id, updates)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <>
                  <p className="text-3xl font-bold text-green-600 mb-4">
                    ${tier.price_monthly}
                    <span className="text-sm text-gray-600">/month</span>
                  </p>
                  {tier.price_yearly > 0 && (
                    <p className="text-sm text-gray-600 mb-4">
                      ${tier.price_yearly}/year
                    </p>
                  )}
                  <ul className="space-y-2 mb-6 text-sm text-gray-600">
                    <li>Max {tier.max_flocks} flocks</li>
                    <li>Max {tier.max_team_members} team members</li>
                    {Object.entries(tier.features).map(([key, value]) => (
                      value && (
                        <li key={key} className="capitalize">
                          {key.replace(/_/g, ' ')}
                        </li>
                      )
                    ))}
                  </ul>
                  <button
                    onClick={() => setEditingId(tier.id)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                    Edit
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EditTierForm({
  tier,
  onSave,
  onCancel,
}: {
  tier: SubscriptionTier;
  onSave: (updates: EditFormData) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState<EditFormData>({
    price_monthly: tier.price_monthly,
    price_yearly: tier.price_yearly,
    max_flocks: tier.max_flocks,
    max_team_members: tier.max_team_members,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium mb-1">Monthly Price ($)</label>
        <input
          type="number"
          step="0.01"
          value={formData.price_monthly}
          onChange={(e) => setFormData({ ...formData, price_monthly: parseFloat(e.target.value) })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Yearly Price ($)</label>
        <input
          type="number"
          step="0.01"
          value={formData.price_yearly}
          onChange={(e) => setFormData({ ...formData, price_yearly: parseFloat(e.target.value) })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Max Flocks</label>
        <input
          type="number"
          value={formData.max_flocks}
          onChange={(e) => setFormData({ ...formData, max_flocks: parseInt(e.target.value) })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Max Team Members</label>
        <input
          type="number"
          value={formData.max_team_members}
          onChange={(e) => setFormData({ ...formData, max_team_members: parseInt(e.target.value) })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
          required
        />
      </div>
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          <Save className="w-4 h-4" />
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
        >
          <X className="w-4 h-4" />
          Cancel
        </button>
      </div>
    </form>
  );
}
