import { useEffect, useState } from 'react';
import { ArrowLeft, Search, CheckCircle, XCircle, Star } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../../contexts/ToastContext';

interface Supplier {
  id: string;
  name: string;
  email: string;
  business_name: string | null;
  category: string | null;
  status: string;
  is_featured: boolean;
  created_at: string;
}

export function MarketplaceAdmin() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    loadSuppliers();
  }, [filterStatus]);

  const loadSuppliers = async () => {
    try {
      let query = supabase
        .from('marketplace_suppliers')
        .select('*')
        .order('created_at', { ascending: false });

      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }

      const { data, error } = await query;
      if (error) throw error;

      setSuppliers(data || []);
    } catch (error) {
      console.error('Failed to load suppliers:', error);
      showToast('Failed to load suppliers', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (supplierId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('marketplace_suppliers')
        .update({ status: newStatus })
        .eq('id', supplierId);

      if (error) throw error;

      showToast(`Supplier ${newStatus}`, 'success');
      loadSuppliers();
    } catch (error) {
      console.error('Failed to update supplier:', error);
      showToast('Failed to update supplier', 'error');
    }
  };

  const handleToggleFeatured = async (supplierId: string, isFeatured: boolean) => {
    try {
      const { error } = await supabase
        .from('marketplace_suppliers')
        .update({ is_featured: !isFeatured })
        .eq('id', supplierId);

      if (error) throw error;

      showToast(`Supplier ${!isFeatured ? 'featured' : 'unfeatured'}`, 'success');
      loadSuppliers();
    } catch (error) {
      console.error('Failed to toggle featured:', error);
      showToast('Failed to update supplier', 'error');
    }
  };

  const filteredSuppliers = suppliers.filter(supplier =>
    supplier.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    supplier.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    supplier.business_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading suppliers...</p>
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
          <h1 className="text-2xl font-bold text-gray-900">Marketplace Suppliers</h1>
          <p className="text-gray-600">Manage supplier registrations and approvals</p>
        </div>

        <div className="bg-white rounded-xl shadow-md p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search suppliers..."
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
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="verified">Verified</option>
            </select>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Featured</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredSuppliers.map((supplier) => (
                  <tr key={supplier.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-gray-900">{supplier.name}</p>
                        <p className="text-sm text-gray-600">{supplier.email}</p>
                        {supplier.business_name && (
                          <p className="text-xs text-gray-500">{supplier.business_name}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {supplier.category || 'N/A'}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={supplier.status} />
                    </td>
                    <td className="px-6 py-4">
                      {supplier.is_featured ? (
                        <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        {supplier.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleStatusChange(supplier.id, 'approved')}
                              className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-sm"
                            >
                              <CheckCircle className="w-3 h-3" />
                              Approve
                            </button>
                            <button
                              onClick={() => handleStatusChange(supplier.id, 'rejected')}
                              className="flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm"
                            >
                              <XCircle className="w-3 h-3" />
                              Reject
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleToggleFeatured(supplier.id, supplier.is_featured)}
                          className="px-3 py-1 bg-white border border-gray-200 text-gray-900 rounded-lg hover:bg-[#f5f0e8] text-sm"
                        >
                          {supplier.is_featured ? 'Unfeature' : 'Feature'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredSuppliers.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No suppliers found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-orange-100 text-orange-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    verified: 'bg-blue-100 text-blue-700',
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${styles[status] || 'bg-gray-100 text-gray-700'}`}>
      {status.toUpperCase()}
    </span>
  );
}
