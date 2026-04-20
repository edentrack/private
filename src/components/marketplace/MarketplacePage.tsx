import { useState } from 'react';
import { Search, MapPin, Phone, Star, Package, Truck, Bird, Pill, ShoppingCart, Filter, ExternalLink, Clock, CheckCircle, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';

interface Supplier {
  id: string;
  name: string;
  category: 'feed' | 'chicks' | 'equipment' | 'medicine' | 'packaging';
  location: string;
  rating: number;
  reviewCount: number;
  description: string;
  phone?: string;
  products: string[];
  verified: boolean;
  deliveryAvailable: boolean;
}

// Marketplace is currently unavailable - suppliers will be added after verification
const MOCK_SUPPLIERS: Supplier[] = [];

const CATEGORIES = [
  { id: 'all', labelKey: 'marketplace.all', icon: ShoppingCart },
  { id: 'feed', labelKey: 'marketplace.feed', icon: Package },
  { id: 'chicks', labelKey: 'marketplace.chicks', icon: Bird },
  { id: 'medicine', labelKey: 'marketplace.medicine', icon: Pill },
  { id: 'equipment', labelKey: 'marketplace.equipment', icon: Filter },
  { id: 'packaging', labelKey: 'marketplace.packaging', icon: Package },
];

export function MarketplacePage() {
  const { t } = useTranslation();
  const { currentFarm } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showVerifiedOnly, setShowVerifiedOnly] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [supplierForm, setSupplierForm] = useState({
    businessName: '',
    category: 'feed',
    location: '',
    phone: '',
    email: '',
    description: '',
  });

  const filteredSuppliers = MOCK_SUPPLIERS.filter(supplier => {
    const matchesSearch = supplier.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      supplier.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      supplier.products.some(p => p.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || supplier.category === selectedCategory;
    const matchesVerified = !showVerifiedOnly || supplier.verified;
    return matchesSearch && matchesCategory && matchesVerified;
  });

  const handleSupplierSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Thank you for your interest! We will review your application and contact you soon.');
    setShowSupplierModal(false);
    setSupplierForm({
      businessName: '',
      category: 'feed',
      location: '',
      phone: '',
      email: '',
      description: '',
    });
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'feed': return Package;
      case 'chicks': return Bird;
      case 'medicine': return Pill;
      case 'equipment': return Filter;
      case 'packaging': return Package;
      default: return ShoppingCart;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'feed': return 'bg-amber-100 text-amber-700';
      case 'chicks': return 'bg-yellow-100 text-yellow-700';
      case 'medicine': return 'bg-red-100 text-red-700';
      case 'equipment': return 'bg-blue-100 text-blue-700';
      case 'packaging': return 'bg-green-100 text-green-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">{t('marketplace')}</h2>
        <p className="text-gray-500 mt-1">{t('marketplace.find_suppliers') || 'Find suppliers for feed, chicks, equipment, and more'}</p>
      </div>

      <div className="section-card">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('marketplace.search_placeholder') || 'Search suppliers, products...'}
              className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-neon-500/20 focus:border-neon-500"
            />
          </div>
          <label className="flex items-center gap-2 px-4 py-3 bg-gray-50 rounded-xl cursor-pointer">
            <input
              type="checkbox"
              checked={showVerifiedOnly}
              onChange={(e) => setShowVerifiedOnly(e.target.checked)}
              className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
            />
            <span className="text-sm font-medium text-gray-700">{t('marketplace.verified_only') || 'Verified only'}</span>
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
                {t(cat.labelKey) || cat.id}
              </button>
            );
          })}
        </div>
      </div>

      {currentFarm?.city && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <MapPin className="w-4 h-4" />
          <span>{t('marketplace.showing_suppliers_near') || 'Showing suppliers near'} {currentFarm.city}, {currentFarm.country}</span>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {filteredSuppliers.map(supplier => {
          const CategoryIcon = getCategoryIcon(supplier.category);
          return (
            <div
              key={supplier.id}
              className="section-card hover:shadow-lg transition-all duration-300"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${getCategoryColor(supplier.category)}`}>
                    <CategoryIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-gray-900">{supplier.name}</h3>
                      {supplier.verified && (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-sm text-gray-500">
                      <MapPin className="w-4 h-4" />
                      {supplier.location}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                  <span className="font-medium text-gray-900">{supplier.rating}</span>
                  <span className="text-sm text-gray-500">({supplier.reviewCount})</span>
                </div>
              </div>

              <p className="text-sm text-gray-600 mb-4">{supplier.description}</p>

              <div className="flex flex-wrap gap-2 mb-4">
                {supplier.products.slice(0, 4).map(product => (
                  <span
                    key={product}
                    className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full"
                  >
                    {product}
                  </span>
                ))}
                {supplier.products.length > 4 && (
                  <span className="px-2 py-1 bg-gray-100 text-gray-500 text-xs rounded-full">
                    +{supplier.products.length - 4} {t('marketplace.more')}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <div className="flex items-center gap-4 text-sm">
                  {supplier.deliveryAvailable && (
                    <div className="flex items-center gap-1 text-green-600">
                      <Truck className="w-4 h-4" />
                      {t('marketplace.delivery')}
                    </div>
                  )}
                  {supplier.phone && (
                    <div className="flex items-center gap-1 text-gray-500">
                      <Phone className="w-4 h-4" />
                      {supplier.phone}
                    </div>
                  )}
                </div>
                <button className="px-4 py-2 bg-[#3D5F42] text-white text-sm font-medium rounded-lg hover:bg-[#2F4A34] transition-colors flex items-center gap-2">
                  {t('marketplace.contact_supplier')}
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredSuppliers.length === 0 && (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('marketplace.unavailable') || 'Marketplace Unavailable'}</h3>
          <p className="text-gray-500">{t('marketplace.unavailable_message') || 'The marketplace is currently being set up. Suppliers will be available soon after verification.'}</p>
        </div>
      )}

      <div className="section-card bg-gradient-to-r from-[#3D5F42] to-[#2F4A34] text-white">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold mb-2">{t('marketplace.are_you_supplier') || 'Are you a supplier?'}</h3>
            <p className="text-white/80">{t('marketplace.list_business') || 'List your business and reach thousands of poultry farmers'}</p>
          </div>
          <button
            onClick={() => setShowSupplierModal(true)}
            className="px-6 py-3 bg-white text-[#3D5F42] font-medium rounded-xl hover:bg-gray-100 transition-colors"
          >
            {t('marketplace.register_supplier') || 'Register as Supplier'}
          </button>
        </div>
      </div>

      <div className="text-center text-sm text-gray-500">
        <Clock className="w-4 h-4 inline-block mr-1" />
        {t('marketplace.data_updated_daily') || 'Marketplace data is updated daily. Contact suppliers directly for current availability and pricing.'}
      </div>

      {showSupplierModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">{t('marketplace.register_supplier') || 'Register as Supplier'}</h3>
              <button
                onClick={() => setShowSupplierModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleSupplierSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('marketplace.business_name') || 'Business Name'} *
                </label>
                <input
                  type="text"
                  required
                  value={supplierForm.businessName}
                  onChange={(e) => setSupplierForm({ ...supplierForm, businessName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42]"
                  placeholder={t('marketplace.business_name_placeholder') || 'Your business name'}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('marketplace.category') || 'Category'} *
                </label>
                <select
                  required
                  value={supplierForm.category}
                  onChange={(e) => setSupplierForm({ ...supplierForm, category: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42]"
                >
                  <option value="feed">{t('marketplace.feed') || 'Feed'}</option>
                  <option value="chicks">{t('marketplace.chicks') || 'Chicks'}</option>
                  <option value="equipment">{t('marketplace.equipment') || 'Equipment'}</option>
                  <option value="medicine">{t('marketplace.medicine') || 'Medicine'}</option>
                  <option value="packaging">{t('marketplace.packaging') || 'Packaging'}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('marketplace.location') || 'Location'} *
                </label>
                <input
                  type="text"
                  required
                  value={supplierForm.location}
                  onChange={(e) => setSupplierForm({ ...supplierForm, location: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42]"
                  placeholder={t('marketplace.location_placeholder') || 'City, Region'}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('marketplace.phone_number') || 'Phone Number'} *
                </label>
                <input
                  type="tel"
                  required
                  value={supplierForm.phone}
                  onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42]"
                  placeholder="+237 6XX XXX XXX"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('marketplace.email_address') || 'Email Address'} *
                </label>
                <input
                  type="email"
                  required
                  value={supplierForm.email}
                  onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42]"
                  placeholder="your@email.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('marketplace.business_description') || 'Business Description'} *
                </label>
                <textarea
                  required
                  value={supplierForm.description}
                  onChange={(e) => setSupplierForm({ ...supplierForm, description: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42] resize-none"
                  placeholder={t('marketplace.description_placeholder') || 'Describe your products and services...'}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowSupplierModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {t('common.cancel') || 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-[#3D5F42] text-white font-medium rounded-lg hover:bg-[#2F4A34] transition-colors"
                >
                  {t('marketplace.submit_application') || 'Submit Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
