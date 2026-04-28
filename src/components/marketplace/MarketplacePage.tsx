import { useEffect, useState } from 'react';
import { Search, MapPin, Phone, Package, Bird, Pill, ShoppingCart, Filter, ExternalLink, Clock, CheckCircle, X, Globe } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useTranslation } from 'react-i18next';

interface Supplier {
  id: string;
  name: string;
  business_name: string | null;
  email: string;
  phone: string | null;
  category: string;
  description: string | null;
  address: string | null;
  website_url: string | null;
  products: string[] | null;
  delivery_available: boolean;
  status: string;
  is_featured: boolean;
}

const CATEGORIES = [
  { id: 'all', label: 'All', icon: ShoppingCart },
  { id: 'feed', label: 'Feed', icon: Package },
  { id: 'chicks', label: 'Chicks', icon: Bird },
  { id: 'medicine', label: 'Medicine', icon: Pill },
  { id: 'equipment', label: 'Equipment', icon: Filter },
  { id: 'packaging', label: 'Packaging', icon: Package },
];

const CATEGORY_COLOR: Record<string, string> = {
  feed:      'bg-amber-100 text-amber-700',
  chicks:    'bg-yellow-100 text-yellow-700',
  medicine:  'bg-red-100 text-red-700',
  equipment: 'bg-blue-100 text-blue-700',
  packaging: 'bg-green-100 text-green-700',
};

const CATEGORY_ICON: Record<string, React.ElementType> = {
  feed: Package, chicks: Bird, medicine: Pill, equipment: Filter, packaging: Package,
};

export function MarketplacePage() {
  const { t } = useTranslation();
  const { user, currentFarm } = useAuth();
  const { showToast } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showVerifiedOnly, setShowVerifiedOnly] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [supplierForm, setSupplierForm] = useState({
    businessName: '',
    category: 'feed',
    location: '',
    phone: '',
    email: '',
    description: '',
  });

  useEffect(() => { fetchSuppliers(); }, []);

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('marketplace_suppliers')
        .select('id, name, business_name, email, phone, category, description, address, website_url, products, delivery_available, status, is_featured')
        .in('status', ['approved', 'verified'])
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false });
      if (error && error.code !== '42P01') throw error;
      setSuppliers(data || []);
    } catch {
      // Silently handle — table may not be migrated yet
    } finally {
      setLoading(false);
    }
  };

  const filteredSuppliers = suppliers.filter(s => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q ||
      s.name?.toLowerCase().includes(q) ||
      s.business_name?.toLowerCase().includes(q) ||
      s.description?.toLowerCase().includes(q) ||
      s.products?.some(p => p.toLowerCase().includes(q));
    const matchesCategory = selectedCategory === 'all' || s.category === selectedCategory;
    const matchesVerified = !showVerifiedOnly || s.status === 'verified';
    return matchesSearch && matchesCategory && matchesVerified;
  });

  const handleSupplierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('marketplace_suppliers').insert({
        user_id: user.id,
        name: supplierForm.businessName,
        business_name: supplierForm.businessName,
        email: supplierForm.email,
        phone: supplierForm.phone,
        category: supplierForm.category,
        address: supplierForm.location,
        description: supplierForm.description,
        status: 'pending',
      });
      if (error) throw error;
      showToast('Application submitted! We will review and contact you soon.', 'success');
      setShowSupplierModal(false);
      setSupplierForm({ businessName: '', category: 'feed', location: '', phone: '', email: '', description: '' });
    } catch {
      showToast('Failed to submit application. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">{t('marketplace.title') || 'Marketplace'}</h2>
        <p className="text-gray-500 mt-1">Find suppliers for feed, chicks, equipment, and more</p>
      </div>

      <div className="section-card">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search suppliers, products…"
              className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42]"
            />
          </div>
          <label className="flex items-center gap-2 px-4 py-3 bg-gray-50 rounded-xl cursor-pointer">
            <input
              type="checkbox"
              checked={showVerifiedOnly}
              onChange={e => setShowVerifiedOnly(e.target.checked)}
              className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
            />
            <span className="text-sm font-medium text-gray-700">Verified only</span>
          </label>
        </div>

        <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
          {CATEGORIES.map(cat => {
            const Icon = cat.icon;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                  selectedCategory === cat.id
                    ? 'bg-[#3D5F42] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {currentFarm?.city && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <MapPin className="w-4 h-4" />
          <span>Showing suppliers near {currentFarm.city}, {currentFarm.country}</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#3D5F42]" />
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filteredSuppliers.map(s => {
            const displayName = s.business_name || s.name;
            const CategoryIcon = CATEGORY_ICON[s.category] || ShoppingCart;
            const colorCls = CATEGORY_COLOR[s.category] || 'bg-gray-100 text-gray-700';
            return (
              <div key={s.id} className="section-card hover:shadow-lg transition-all duration-300">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colorCls}`}>
                      <CategoryIcon className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-gray-900">{displayName}</h3>
                        {s.status === 'verified' && (
                          <CheckCircle className="w-4 h-4 text-green-500" title="Verified supplier" />
                        )}
                        {s.is_featured && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">Featured</span>
                        )}
                      </div>
                      {s.address && (
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                          <MapPin className="w-3.5 h-3.5" />
                          {s.address}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {s.description && (
                  <p className="text-sm text-gray-600 mb-4 line-clamp-2">{s.description}</p>
                )}

                {s.products && s.products.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {s.products.slice(0, 4).map(p => (
                      <span key={p} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">{p}</span>
                    ))}
                    {s.products.length > 4 && (
                      <span className="px-2 py-1 bg-gray-100 text-gray-500 text-xs rounded-full">+{s.products.length - 4} more</span>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-4 text-sm">
                    {s.phone && (
                      <div className="flex items-center gap-1 text-gray-500">
                        <Phone className="w-4 h-4" />
                        {s.phone}
                      </div>
                    )}
                  </div>
                  {s.website_url ? (
                    <a
                      href={s.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-[#3D5F42] text-white text-sm font-medium rounded-lg hover:bg-[#2F4A34] transition-colors flex items-center gap-2"
                    >
                      Visit Website
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  ) : s.email ? (
                    <a
                      href={`mailto:${s.email}`}
                      className="px-4 py-2 bg-[#3D5F42] text-white text-sm font-medium rounded-lg hover:bg-[#2F4A34] transition-colors flex items-center gap-2"
                    >
                      Contact
                      <Globe className="w-4 h-4" />
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && filteredSuppliers.length === 0 && (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No suppliers yet</h3>
          <p className="text-gray-500">
            {searchQuery || selectedCategory !== 'all'
              ? 'No suppliers match your search. Try different filters.'
              : 'The marketplace is being set up. Suppliers will appear here soon.'}
          </p>
        </div>
      )}

      <div className="section-card bg-gradient-to-r from-[#3D5F42] to-[#2F4A34] text-white">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold mb-2">Are you a supplier?</h3>
            <p className="text-white/80">List your business and reach thousands of poultry farmers</p>
          </div>
          <button
            onClick={() => setShowSupplierModal(true)}
            className="px-6 py-3 bg-white text-[#3D5F42] font-medium rounded-xl hover:bg-gray-100 transition-colors"
          >
            Register as Supplier
          </button>
        </div>
      </div>

      <div className="text-center text-sm text-gray-500">
        <Clock className="w-4 h-4 inline-block mr-1" />
        Contact suppliers directly for current availability and pricing.
      </div>

      {showSupplierModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">Register as Supplier</h3>
              <button onClick={() => setShowSupplierModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSupplierSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Business Name *</label>
                <input
                  type="text" required
                  value={supplierForm.businessName}
                  onChange={e => setSupplierForm({ ...supplierForm, businessName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42]"
                  placeholder="Your business name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                <select
                  required value={supplierForm.category}
                  onChange={e => setSupplierForm({ ...supplierForm, category: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42]"
                >
                  <option value="feed">Feed</option>
                  <option value="chicks">Chicks</option>
                  <option value="equipment">Equipment</option>
                  <option value="medicine">Medicine</option>
                  <option value="packaging">Packaging</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
                <input
                  type="text" required
                  value={supplierForm.location}
                  onChange={e => setSupplierForm({ ...supplierForm, location: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42]"
                  placeholder="City, Region"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                  <input
                    type="tel" required
                    value={supplierForm.phone}
                    onChange={e => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42]"
                    placeholder="+237 6XX XXX XXX"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input
                    type="email" required
                    value={supplierForm.email}
                    onChange={e => setSupplierForm({ ...supplierForm, email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42]"
                    placeholder="your@email.com"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Business Description *</label>
                <textarea
                  required rows={4}
                  value={supplierForm.description}
                  onChange={e => setSupplierForm({ ...supplierForm, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42] resize-none"
                  placeholder="Describe your products and services…"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button" onClick={() => setShowSupplierModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit" disabled={submitting}
                  className="flex-1 px-4 py-2 bg-[#3D5F42] text-white font-medium rounded-lg hover:bg-[#2F4A34] disabled:opacity-50"
                >
                  {submitting ? 'Submitting…' : 'Submit Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
