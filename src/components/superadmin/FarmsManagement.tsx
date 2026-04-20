import { useEffect, useState } from 'react';
import { Search, ArrowLeft, Eye, Building2, Users, Layers } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../../contexts/ToastContext';
import { ImpersonationModal } from './ImpersonationModal';

interface FarmData {
  id: string;
  name: string;
  owner_id: string;
  owner_email: string;
  owner_name: string | null;
  plan: string;
  created_at: string;
  total_flocks?: number;
  total_members?: number;
}

export function FarmsManagement() {
  const [farms, setFarms] = useState<FarmData[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedFarm, setSelectedFarm] = useState<FarmData | null>(null);
  const [impersonateUser, setImpersonateUser] = useState<{id: string, name: string, email: string} | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    loadFarms();
  }, []);

  const loadFarms = async () => {
    try {
      const { data: farmsData, error: farmsError } = await supabase
        .from('farms')
        .select(`
          id,
          name,
          owner_id,
          plan,
          created_at
        `)
        .order('created_at', { ascending: false });

      if (farmsError) throw farmsError;

      const farmsWithDetails = await Promise.all(
        (farmsData || []).map(async (farm) => {
          // Get owner info
          const { data: ownerData } = await supabase
            .from('profiles')
            .select('email, full_name')
            .eq('id', farm.owner_id)
            .single();

          // Count flocks
          const { count: flocksCount } = await supabase
            .from('flocks')
            .select('*', { count: 'exact', head: true })
            .eq('farm_id', farm.id);

          // Count members
          const { count: membersCount } = await supabase
            .from('farm_members')
            .select('*', { count: 'exact', head: true })
            .eq('farm_id', farm.id)
            .eq('is_active', true);

          return {
            ...farm,
            owner_email: ownerData?.email || 'Unknown',
            owner_name: ownerData?.full_name || null,
            total_flocks: flocksCount || 0,
            total_members: membersCount || 0,
          };
        })
      );

      setFarms(farmsWithDetails);
    } catch (error) {
      console.error('Failed to load farms:', error);
      showToast('Failed to load farms', 'error');
    } finally {
      setLoading(false);
    }
  };

  const filteredFarms = farms.filter(farm =>
    farm.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    farm.owner_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    farm.owner_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading farms...</p>
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
          <h1 className="text-2xl font-bold text-gray-900">Farms Management</h1>
          <p className="text-gray-600">View and manage all farms on the platform</p>
        </div>

        <div className="bg-white rounded-xl shadow-md p-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by farm name, owner email, or owner name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredFarms.map((farm) => (
            <div key={farm.id} className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-1">{farm.name}</h3>
                  <p className="text-sm text-gray-600">{farm.owner_name || 'No name'}</p>
                  <p className="text-xs text-gray-500">{farm.owner_email}</p>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                  farm.plan === 'pro' ? 'bg-blue-100 text-blue-700' :
                  farm.plan === 'enterprise' ? 'bg-purple-100 text-purple-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {farm.plan?.toUpperCase() || 'FREE'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Layers className="w-4 h-4" />
                  <span>{farm.total_flocks || 0} Flocks</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Users className="w-4 h-4" />
                  <span>{farm.total_members || 0} Members</span>
                </div>
              </div>

              <div className="text-xs text-gray-500 mb-4">
                Created: {new Date(farm.created_at).toLocaleDateString()}
              </div>

              <button
                onClick={() => setImpersonateUser({
                  id: farm.owner_id,
                  name: farm.owner_name || '',
                  email: farm.owner_email
                })}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-900 rounded-lg hover:bg-[#f5f0e8] transition-colors text-sm font-medium"
              >
                <Eye className="w-4 h-4" />
                View As Owner
              </button>
            </div>
          ))}
        </div>

        {filteredFarms.length === 0 && (
          <div className="bg-white rounded-xl shadow-md p-12 text-center">
            <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No farms found</p>
          </div>
        )}
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
    </div>
  );
}
