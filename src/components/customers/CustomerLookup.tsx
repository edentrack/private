import { useState, useEffect } from 'react';
import { Search, User, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';

interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
}

interface CustomerLookupProps {
  farmId: string;
  onCustomerSelect: (customer: Customer | null) => void;
  initialPhone?: string;
}

export function CustomerLookup({ farmId, onCustomerSelect, initialPhone = '' }: CustomerLookupProps) {
  const { t } = useTranslation();
  const [phone, setPhone] = useState(initialPhone);
  const [searching, setSearching] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (phone.length >= 3) {
        searchCustomers(phone);
      } else {
        setCustomers([]);
        setShowDropdown(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [phone, farmId]);

  const searchCustomers = async (searchPhone: string) => {
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('farm_id', farmId)
        .ilike('phone', `%${searchPhone}%`)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;

      setCustomers(data || []);
      setShowDropdown(data && data.length > 0);
    } catch (error) {
      console.error('Error searching customers:', error);
      setCustomers([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setPhone(customer.phone);
    setShowDropdown(false);
    onCustomerSelect(customer);
  };

  const handleClearSelection = () => {
    setSelectedCustomer(null);
    setPhone('');
    onCustomerSelect(null);
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <label className="block text-sm font-medium text-gray-900 mb-1.5">
          {t('sales.customer_phone_number')}
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              if (selectedCustomer) {
                setSelectedCustomer(null);
                onCustomerSelect(null);
              }
            }}
            onFocus={() => {
              if (customers.length > 0) {
                setShowDropdown(true);
              }
            }}
            placeholder={t('sales.enter_phone_to_search') || 'Enter phone to search...'}
            className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors text-gray-900 bg-white"
            disabled={searching}
          />
          {selectedCustomer && (
            <button
              type="button"
              onClick={handleClearSelection}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {showDropdown && customers.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
            {customers.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => handleSelectCustomer(customer)}
                className="w-full text-left px-4 py-3 hover:bg-emerald-50 border-b border-gray-100 last:border-b-0 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 p-2 bg-emerald-100 rounded-full">
                    <User className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{customer.name}</p>
                    <p className="text-sm text-emerald-600 font-medium">{customer.phone}</p>
                    {customer.address && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">{customer.address}</p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {searching && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-4 text-center text-sm text-gray-900">
            {t('common.searching') || 'Searching...'}
          </div>
        )}

        {phone.length >= 3 && customers.length === 0 && !searching && !selectedCustomer && (
          <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-900">
              {t('sales.no_customer_found') || 'No customer found with this phone number. Enter details below to create a new customer.'}
            </p>
          </div>
        )}

        {selectedCustomer && (
          <div className="mt-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-900">
                {t('sales.customer_selected') || 'Customer selected'}: {selectedCustomer.name}
              </span>
            </div>
            <button
              type="button"
              onClick={handleClearSelection}
              className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
            >
              {t('common.change') || 'Change'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
