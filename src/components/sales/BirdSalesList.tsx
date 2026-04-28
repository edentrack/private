import { useEffect, useState } from 'react';
import { Bird, Calendar, DollarSign, User, ChevronDown, ChevronUp, Scale, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { shouldHideFinancialData } from '../../utils/navigationPermissions';

interface BirdSale {
  id: string;
  flock_id: string;
  sale_date: string;
  birds_sold: number;
  sale_method: 'per_bird' | 'per_kg' | 'lump_sum';
  price_per_bird: number;
  price_per_kg: number | null;
  total_weight_kg: number | null;
  total_amount: number;
  sale_type: string;
  customer_name: string | null;
  customer_phone: string | null;
  payment_status: 'paid' | 'partial' | 'credit';
  amount_paid: number;
  amount_pending: number;
  notes: string | null;
  created_at: string;
  flock?: {
    name: string;
    type: string;
  };
}

interface BirdSalesListProps {
  refreshTrigger?: number;
}

export function BirdSalesList({ refreshTrigger }: BirdSalesListProps) {
  const { currentFarm, currentRole, profile } = useAuth();
  const [sales, setSales] = useState<BirdSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSale, setExpandedSale] = useState<string | null>(null);
  const hideFinancials = shouldHideFinancialData(currentRole);

  const currency = profile?.currency_preference || currentFarm?.currency_code || 'XAF';

  useEffect(() => {
    if (currentFarm?.id) {
      loadSales();
    }
  }, [currentFarm?.id, refreshTrigger]);

  const loadSales = async () => {
    if (!currentFarm?.id) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('bird_sales')
        .select(`
          *,
          flock:flocks(name, type)
        `)
        .eq('farm_id', currentFarm.id)
        .order('sale_date', { ascending: false })
        .limit(50);

      if (error) throw error;
      setSales(data || []);
    } catch (error) {
      console.error('Error loading bird sales:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">Paid</span>;
      case 'partial':
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">Partial</span>;
      case 'credit':
        return <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">Credit</span>;
      default:
        return null;
    }
  };

  const getSaleTypeBadge = (type: string) => {
    const styles: Record<string, string> = {
      market: 'bg-blue-100 text-blue-700',
      pre_order: 'bg-purple-100 text-purple-700',
      wholesale: 'bg-amber-100 text-amber-700',
      retail: 'bg-green-100 text-green-700',
    };
    const labels: Record<string, string> = {
      market: 'Market',
      pre_order: 'Pre-Order',
      wholesale: 'Wholesale',
      retail: 'Retail',
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[type] || 'bg-gray-100 text-gray-700'}`}>
        {labels[type] || type}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-neon-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (sales.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Bird className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Bird Sales Yet</h3>
        <p className="text-gray-500">Record your first bird sale to start tracking</p>
      </div>
    );
  }

  const totalBirdsSold = sales.reduce((sum, s) => sum + s.birds_sold, 0);
  const totalRevenue = sales.reduce((sum, s) => sum + s.total_amount, 0);
  const totalPending = sales.reduce((sum, s) => sum + (s.amount_pending || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <div className="p-3 sm:p-4 bg-blue-50 rounded-xl">
          <p className="text-xs sm:text-sm text-blue-600 mb-1">Total Birds Sold</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900">{totalBirdsSold.toLocaleString()}</p>
        </div>
        {!hideFinancials && (
          <>
            <div className="p-3 sm:p-4 bg-green-50 rounded-xl">
              <p className="text-xs sm:text-sm text-green-600 mb-1">Total Revenue</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 break-words">{totalRevenue.toLocaleString()} {currency}</p>
            </div>
            <div className="p-3 sm:p-4 bg-amber-50 rounded-xl">
              <p className="text-xs sm:text-sm text-amber-600 mb-1">Pending Payment</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 break-words">{totalPending.toLocaleString()} {currency}</p>
            </div>
          </>
        )}
      </div>

      <div className="space-y-2">
        {sales.map((sale, index) => (
          <div
            key={sale.id}
            className="border border-gray-200 rounded-xl overflow-hidden hover:border-gray-300 transition-colors"
          >
            <button
              onClick={() => setExpandedSale(expandedSale === sale.id ? null : sale.id)}
              className="w-full p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between text-left gap-3"
            >
              <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Bird className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 text-sm sm:text-base">{sale.birds_sold} birds</span>
                    {getSaleTypeBadge(sale.sale_type)}
                    {getPaymentStatusBadge(sale.payment_status)}
                  </div>
                  <div className="text-xs sm:text-sm text-gray-500 flex items-center gap-2 flex-wrap mt-1">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 sm:w-4 sm:h-4" />
                      {new Date(sale.sale_date).toLocaleDateString()}
                    </div>
                    {sale.flock && (
                      <>
                        <span className="text-gray-300 hidden sm:inline">|</span>
                        <span className="truncate">{sale.flock.name}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 flex-shrink-0">
                {!hideFinancials && (
                  <span className="font-bold text-green-600 text-sm sm:text-base">{sale.total_amount.toLocaleString()} {currency}</span>
                )}
                {expandedSale === sale.id ? (
                  <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                )}
              </div>
            </button>

            {expandedSale === sale.id && (
              <div className="px-3 sm:px-4 pb-3 sm:pb-4 border-t border-gray-100 pt-3 sm:pt-4 bg-gray-50">
                <div className="grid sm:grid-cols-2 gap-3 sm:gap-4 text-xs sm:text-sm">
                  <div>
                    <p className="text-gray-500 mb-1">Sale Method</p>
                    <p className="font-medium text-gray-900 break-words">
                      {sale.sale_method === 'per_bird' && `Per Bird (${sale.price_per_bird?.toLocaleString()} ${currency}/bird)`}
                      {sale.sale_method === 'per_kg' && `Per Kg (${sale.price_per_kg?.toLocaleString()} ${currency}/kg)`}
                      {sale.sale_method === 'lump_sum' && 'Lump Sum'}
                    </p>
                  </div>
                  {sale.sale_method === 'per_kg' && sale.total_weight_kg && (
                    <div>
                      <p className="text-gray-500 mb-1">Total Weight</p>
                      <p className="font-medium text-gray-900 flex items-center gap-1">
                        <Scale className="w-3 h-3 sm:w-4 sm:h-4" />
                        {sale.total_weight_kg} kg
                      </p>
                    </div>
                  )}
                  {sale.customer_name && (
                    <div>
                      <p className="text-gray-500 mb-1">Customer</p>
                      <p className="font-medium text-gray-900 flex items-center gap-1 break-words">
                        <User className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                        <span>
                          {sale.customer_name}
                          {sale.customer_phone && ` (${sale.customer_phone})`}
                        </span>
                      </p>
                    </div>
                  )}
                  {!hideFinancials && sale.payment_status !== 'paid' && (
                    <div>
                      <p className="text-gray-500 mb-1">Payment Details</p>
                      <p className="font-medium text-gray-900 break-words">
                        Paid: {sale.amount_paid.toLocaleString()} {currency}
                        {sale.amount_pending > 0 && (
                          <span className="text-amber-600 block sm:inline sm:ml-2 mt-1 sm:mt-0">
                            (Pending: {sale.amount_pending.toLocaleString()} {currency})
                          </span>
                        )}
                      </p>
                    </div>
                  )}
                  {sale.notes && (
                    <div className="sm:col-span-2">
                      <p className="text-gray-500 mb-1">Notes</p>
                      <p className="font-medium text-gray-900 break-words">{sale.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
