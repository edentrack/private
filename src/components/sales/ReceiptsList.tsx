import { useState, useEffect } from 'react';
import { Receipt, Calendar, User, DollarSign, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { SalesReceipt, ReceiptItem, ReceiptRefund } from '../../types/database';
import { ProcessRefundModal } from './ProcessRefundModal';
import { shouldHideFinancialData } from '../../utils/navigationPermissions';

interface ReceiptsListProps {
  refreshTrigger: number;
}

export function ReceiptsList({ refreshTrigger }: ReceiptsListProps) {
  const { profile, currentFarm, currentRole } = useAuth();
  const [receipts, setReceipts] = useState<(SalesReceipt & { items: ReceiptItem[]; refunds: ReceiptRefund[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [refundingReceipt, setRefundingReceipt] = useState<SalesReceipt | null>(null);
  const [expandedReceipts, setExpandedReceipts] = useState<Set<string>>(new Set());
  const hideFinancials = shouldHideFinancialData(currentRole);

  useEffect(() => {
    loadReceipts();
  }, [currentFarm?.id, refreshTrigger]);

  const loadReceipts = async () => {
    if (!currentFarm?.id) return;

    setLoading(true);

    const { data: receiptsData } = await supabase
      .from('sales_receipts')
      .select('*')
      .eq('farm_id', currentFarm.id)
      .order('created_at', { ascending: false });

    if (receiptsData) {
      const receiptsWithDetails = await Promise.all(
        receiptsData.map(async (receipt) => {
          const { data: items } = await supabase
            .from('receipt_items')
            .select('*')
            .eq('receipt_id', receipt.id);

          const { data: refunds } = await supabase
            .from('receipt_refunds')
            .select('*')
            .eq('receipt_id', receipt.id);

          return {
            ...receipt,
            items: items || [],
            refunds: refunds || [],
          };
        })
      );

      setReceipts(receiptsWithDetails);
    }

    setLoading(false);
  };

  const isRefunded = (receipt: SalesReceipt & { refunds: ReceiptRefund[] }) => {
    return receipt.refunds.length > 0;
  };

  const getTotalRefunded = (receipt: SalesReceipt & { refunds: ReceiptRefund[] }) => {
    return receipt.refunds.reduce((sum, refund) => sum + refund.refund_amount, 0);
  };

  const toggleExpanded = (receiptId: string) => {
    setExpandedReceipts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(receiptId)) {
        newSet.delete(receiptId);
      } else {
        newSet.add(receiptId);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-12 text-center">
        <div className="text-gray-500">Loading receipts...</div>
      </div>
    );
  }

  if (receipts.length === 0) {
    return (
      <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-12 text-center">
        <Receipt className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Receipts Yet</h3>
        <p className="text-gray-500">Create your first sales receipt to get started</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {receipts.map((receipt) => {
          const refunded = isRefunded(receipt);
          const totalRefunded = getTotalRefunded(receipt);
          const netAmount = receipt.total - totalRefunded;
          const isExpanded = expandedReceipts.has(receipt.id);

          return (
            <div
              key={receipt.id}
              className={`bg-white rounded-3xl shadow-sm border-2 transition-all ${
                refunded ? 'border-red-200 bg-red-50/30' : 'border-gray-200 hover:shadow-md'
              }`}
            >
              <div
                onClick={() => toggleExpanded(receipt.id)}
                className="flex items-start justify-between p-6 cursor-pointer"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      refunded ? 'bg-red-100' : 'bg-green-100'
                    }`}>
                      <Receipt className={`w-6 h-6 ${refunded ? 'text-red-600' : 'text-green-600'}`} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">#{receipt.receipt_number}</h3>
                      {refunded && (
                        <span className="inline-block px-3 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">
                          Refunded
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {receipt.customer_name && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <User className="w-4 h-4" />
                        {receipt.customer_name}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Calendar className="w-4 h-4" />
                      {new Date(receipt.sale_date).toLocaleDateString()}
                    </div>
                    {!isExpanded && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <DollarSign className="w-4 h-4" />
                        {receipt.items.length} item{receipt.items.length !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-right flex items-start gap-3">
                  <div>
                    <div className="text-sm text-gray-500 mb-1">Total</div>
                    {hideFinancials ? (
                      <div className="text-xl font-bold text-gray-400 italic">Hidden</div>
                    ) : (
                      <>
                        <div className="text-3xl font-bold text-gray-900">
                          {profile?.currency_preference} {receipt.total.toLocaleString()}
                        </div>
                        {refunded && (
                          <div className="text-sm text-red-600 mt-2">
                            Refunded: {profile?.currency_preference} {totalRefunded.toLocaleString()}
                          </div>
                        )}
                        {refunded && netAmount > 0 && (
                          <div className="text-sm text-gray-600 mt-1">
                            Net: {profile?.currency_preference} {netAmount.toLocaleString()}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <button
                    className="mt-2 text-gray-400 hover:text-gray-600 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpanded(receipt.id);
                    }}
                  >
                    {isExpanded ? (
                      <ChevronUp className="w-6 h-6" />
                    ) : (
                      <ChevronDown className="w-6 h-6" />
                    )}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <>
                  <div className="border-t border-gray-200 pt-4 px-6">
                    <div className="text-sm font-medium text-gray-700 mb-3">Items</div>
                    <div className="space-y-2">
                      {receipt.items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between text-sm bg-gray-50 p-3 rounded-lg">
                          <div className="flex items-center gap-3">
                            <span className="px-2 py-1 bg-white border border-gray-200 rounded text-xs font-medium capitalize">
                              {item.product_type}
                            </span>
                            <span className="text-gray-900">{item.description}</span>
                            {!hideFinancials && (
                              <span className="text-gray-500">
                                {item.quantity} {item.unit} × {profile?.currency_preference} {item.unit_price.toLocaleString()}
                              </span>
                            )}
                          </div>
                          {hideFinancials ? (
                            <span className="text-gray-400 italic text-xs">Hidden</span>
                          ) : (
                            <span className="font-semibold text-gray-900">
                              {profile?.currency_preference} {item.total.toLocaleString()}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {receipt.notes && (
                    <div className="border-t border-gray-200 pt-4 px-6 mt-4">
                      <div className="text-sm text-gray-600">
                        <span className="font-medium">Notes:</span> {receipt.notes}
                      </div>
                    </div>
                  )}

                  {!refunded && (
                    <div className="border-t border-gray-200 pt-4 px-6 mt-4 pb-6">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRefundingReceipt(receipt);
                        }}
                        className="px-6 py-2 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors"
                      >
                        Process Refund
                      </button>
                    </div>
                  )}

                  {refunded && receipt.refunds.length > 0 && (
                    <div className="border-t border-red-200 pt-4 mt-4 bg-red-50 px-6 py-4 rounded-b-3xl">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <div className="font-medium text-red-900 mb-1">Refund Details</div>
                          {receipt.refunds.map((refund) => (
                            <div key={refund.id} className="text-sm text-red-800">
                              {hideFinancials ? (
                                <div>Amount: <span className="text-gray-400 italic">Hidden</span></div>
                              ) : (
                                <div>Amount: {profile?.currency_preference} {refund.refund_amount.toLocaleString()}</div>
                              )}
                              <div>Reason: {refund.refund_reason}</div>
                              <div className="text-xs text-red-600 mt-1">
                                {new Date(refund.refunded_at).toLocaleString()}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {refundingReceipt && (
        <ProcessRefundModal
          receipt={refundingReceipt}
          onClose={() => setRefundingReceipt(null)}
          onRefunded={() => {
            setRefundingReceipt(null);
            loadReceipts();
          }}
        />
      )}
    </>
  );
}
