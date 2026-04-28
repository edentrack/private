import { useEffect, useState } from 'react';
import { ArrowLeft, Search, CheckCircle, XCircle, Star, Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

interface Supplier {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  business_name: string | null;
  category: string | null;
  description: string | null;
  address: string | null;
  website_url: string | null;
  products: string[] | null;
  delivery_available: boolean;
  status: string;
  is_featured: boolean;
  created_at: string;
}

const EMPTY_FORM = {
  business_name: '',
  name: '',
  email: '',
  phone: '',
  category: 'feed',
  address: '',
  website_url: '',
  description: '',
  products: '',
  delivery_available: false,
  is_featured: false,
  status: 'approved',
};

export function MarketplaceAdmin() {
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const { showToast } = useToast();

  useEffect(() => { loadSuppliers(); }, [filterStatus]);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('marketplace_suppliers')
        .select('*')
        .order('created_at', { ascending: false });
      if (filterStatus !== 'all') query = query.eq('status', filterStatus);
      const { data, error } = await query;
      if (error) throw error;
      setSuppliers(data || []);
    } catch {
      showToast('Failed to load suppliers', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!form.business_name.trim() || !form.email.trim()) return;
    setSaving(true);
    try {
      const productsArray = form.products
        .split(',')
        .map(p => p.trim())
        .filter(Boolean);
      const { error } = await supabase.from('marketplace_suppliers').insert({
        name: form.name.trim() || form.business_name.trim(),
        business_name: form.business_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        category: form.category,
        address: form.address.trim() || null,
        website_url: form.website_url.trim() || null,
        description: form.description.trim() || null,
        products: productsArray.length ? productsArray : null,
        delivery_available: form.delivery_available,
        is_featured: form.is_featured,
        status: form.status,
        user_id: null,
      });
      if (error) throw error;
      showToast('Supplier added and live in the marketplace', 'success');
      setShowAddForm(false);
      setForm(EMPTY_FORM);
      loadSuppliers();
    } catch {
      showToast('Failed to add supplier', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (supplierId: string, newStatus: string) => {
    const { error } = await supabase
      .from('marketplace_suppliers')
      .update({ status: newStatus })
      .eq('id', supplierId);
    if (error) { showToast('Failed to update status', 'error'); return; }
    showToast(`Supplier ${newStatus}`, 'success');
    setSuppliers(prev => prev.map(s => s.id === supplierId ? { ...s, status: newStatus } : s));
  };

  const handleToggleFeatured = async (supplierId: string, isFeatured: boolean) => {
    const { error } = await supabase
      .from('marketplace_suppliers')
      .update({ is_featured: !isFeatured })
      .eq('id', supplierId);
    if (error) { showToast('Failed to update', 'error'); return; }
    showToast(isFeatured ? 'Unfeatured' : 'Featured', 'success');
    setSuppliers(prev => prev.map(s => s.id === supplierId ? { ...s, is_featured: !isFeatured } : s));
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('marketplace_suppliers').delete().eq('id', id);
    if (error) { showToast('Failed to delete', 'error'); return; }
    setSuppliers(prev => prev.filter(s => s.id !== id));
    showToast('Supplier removed', 'success');
  };

  const filteredSuppliers = suppliers.filter(s =>
    s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.business_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <button
            onClick={() => { window.location.hash = '#/super-admin'; }}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-2 text-sm"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Marketplace Suppliers</h1>
              <p className="text-gray-500 text-sm mt-1">Manage supplier listings and applications</p>
            </div>
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800"
            >
              <Plus className="w-4 h-4" /> Add Supplier
            </button>
          </div>
        </div>

        {/* Add Supplier Form */}
        {showAddForm && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
            <h2 className="font-bold text-gray-900 mb-5">Add Supplier Directly</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Business Name *</label>
                <input
                  value={form.business_name}
                  onChange={e => setForm({ ...form, business_name: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  placeholder="e.g. Sunshine Feeds Ltd"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Contact Name</label>
                <input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  placeholder="Owner or contact person name"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  placeholder="supplier@email.com"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Phone</label>
                <input
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  placeholder="+237 6XX XXX XXX"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Category</label>
                <select
                  value={form.category}
                  onChange={e => setForm({ ...form, category: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none"
                >
                  <option value="feed">Feed</option>
                  <option value="chicks">Chicks</option>
                  <option value="equipment">Equipment</option>
                  <option value="medicine">Medicine</option>
                  <option value="packaging">Packaging</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Location / Address</label>
                <input
                  value={form.address}
                  onChange={e => setForm({ ...form, address: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  placeholder="City, Region or Country"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Website URL</label>
                <input
                  value={form.website_url}
                  onChange={e => setForm({ ...form, website_url: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  placeholder="https://supplier.com"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm({ ...form, status: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none"
                >
                  <option value="approved">Approved (visible to farmers)</option>
                  <option value="verified">Verified (shows checkmark)</option>
                  <option value="pending">Pending (not visible)</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Products / Services</label>
                <input
                  value={form.products}
                  onChange={e => setForm({ ...form, products: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  placeholder="Layer mash, Broiler starter, Grower feed (comma-separated)"
                />
                <p className="text-xs text-gray-400 mt-1">Separate each product with a comma</p>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-none"
                  placeholder="Brief description of the business and what they offer…"
                />
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <button type="button" onClick={() => setForm(f => ({ ...f, delivery_available: !f.delivery_available }))}>
                    {form.delivery_available
                      ? <ToggleRight className="w-6 h-6 text-green-500" />
                      : <ToggleLeft className="w-6 h-6 text-gray-400" />}
                  </button>
                  <span className="text-sm font-medium text-gray-700">Delivery available</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <button type="button" onClick={() => setForm(f => ({ ...f, is_featured: !f.is_featured }))}>
                    {form.is_featured
                      ? <ToggleRight className="w-6 h-6 text-amber-500" />
                      : <ToggleLeft className="w-6 h-6 text-gray-400" />}
                  </button>
                  <span className="text-sm font-medium text-gray-700">Featured listing</span>
                </label>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => { setShowAddForm(false); setForm(EMPTY_FORM); }}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={!form.business_name.trim() || !form.email.trim() || saving}
                className="flex-1 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-bold hover:bg-gray-800 disabled:opacity-50"
              >
                {saving ? 'Adding…' : 'Add to Marketplace'}
              </button>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search suppliers…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42] text-sm"
              />
            </div>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#3D5F42]/20"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="verified">Verified</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Supplier</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Location</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Featured</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredSuppliers.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-gray-900">{s.business_name || s.name}</p>
                          <p className="text-sm text-gray-500">{s.email}</p>
                          {s.phone && <p className="text-xs text-gray-400">{s.phone}</p>}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 capitalize">{s.category || '—'}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{s.address || '—'}</td>
                      <td className="px-6 py-4"><StatusBadge status={s.status} /></td>
                      <td className="px-6 py-4">
                        {s.is_featured
                          ? <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2 flex-wrap">
                          {s.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleStatusChange(s.id, 'approved')}
                                className="flex items-center gap-1 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-xs font-semibold"
                              >
                                <CheckCircle className="w-3 h-3" /> Approve
                              </button>
                              <button
                                onClick={() => handleStatusChange(s.id, 'rejected')}
                                className="flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-xs font-semibold"
                              >
                                <XCircle className="w-3 h-3" /> Reject
                              </button>
                            </>
                          )}
                          {s.status === 'approved' && (
                            <button
                              onClick={() => handleStatusChange(s.id, 'verified')}
                              className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-xs font-semibold"
                            >
                              <CheckCircle className="w-3 h-3" /> Verify
                            </button>
                          )}
                          <button
                            onClick={() => handleToggleFeatured(s.id, s.is_featured)}
                            className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 text-xs font-semibold"
                          >
                            {s.is_featured ? 'Unfeature' : 'Feature'}
                          </button>
                          <button
                            onClick={() => handleDelete(s.id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredSuppliers.length === 0 && (
                <div className="text-center py-12 text-gray-400 text-sm">
                  No suppliers found. Use "Add Supplier" to seed the marketplace.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending:  'bg-orange-100 text-orange-700',
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
