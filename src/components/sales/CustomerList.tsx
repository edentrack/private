import { Mail, Phone, MapPin } from 'lucide-react';
import { Customer } from '../../types/database';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';

interface CustomerListProps {
  customers: Customer[];
  onRefresh: () => void;
}

export function CustomerList({ customers }: CustomerListProps) {
  const { t } = useTranslation();
  const { profile } = useAuth();

  if (customers.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">{t('sales.no_customers_yet')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {customers.map((customer) => (
        <div key={customer.id} className="border border-gray-200 rounded-xl p-3 sm:p-4 hover:shadow-md transition-shadow">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate">{customer.name}</h3>
              {customer.id?.startsWith('sale_contact_') && (
                <span className="inline-block mt-0.5 text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">From sales history</span>
              )}
              <div className="mt-2 space-y-1">
                {customer.email && (
                  <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
                    <Mail className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                    <span className="truncate">{customer.email}</span>
                  </div>
                )}
                {customer.phone && (
                  <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
                    <Phone className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                    {customer.phone}
                  </div>
                )}
                {customer.address && (
                  <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
                    <MapPin className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                    <span className="break-words">{customer.address}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="sm:text-right flex-shrink-0">
              <div className="text-xs sm:text-sm text-gray-500">Total Purchases</div>
              <div className="text-base sm:text-lg font-bold text-green-600 break-words">
                {profile?.currency_preference} {(customer.total_purchases || 0).toLocaleString()}
              </div>
              {(customer.outstanding_balance || 0) > 0 && (
                <div className="text-xs sm:text-sm text-red-600 mt-1 break-words">
                  Due: {profile?.currency_preference} {(customer.outstanding_balance || 0).toLocaleString()}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
