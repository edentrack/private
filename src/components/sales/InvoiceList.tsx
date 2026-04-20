import { useState } from 'react';
import { Calendar, User, Edit, Trash2, CheckCircle } from 'lucide-react';
import { SalesInvoice, Customer } from '../../types/database';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { EditInvoiceModal } from './EditInvoiceModal';

interface InvoiceListProps {
  invoices: SalesInvoice[];
  customers: Customer[];
  onRefresh: () => void;
}

export function InvoiceList({ invoices, customers, onRefresh }: InvoiceListProps) {
  const { profile } = useAuth();
  const [editingInvoice, setEditingInvoice] = useState<SalesInvoice | null>(null);

  const getCustomerName = (customerId: string | null) => {
    if (!customerId) return 'Walk-in Customer';
    return customers.find((c) => c.id === customerId)?.name || 'Unknown';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-700';
      case 'sent':
        return 'bg-blue-100 text-blue-700';
      case 'overdue':
        return 'bg-red-100 text-red-700';
      case 'cancelled':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-yellow-100 text-yellow-700';
    }
  };

  const handleMarkAsPaid = async (invoice: SalesInvoice) => {
    if (!confirm('Mark this invoice as paid?')) return;

    try {
      const { error } = await supabase
        .from('sales_invoices')
        .update({
          status: 'paid',
          amount_paid: invoice.total,
          payment_date: new Date().toISOString().split('T')[0],
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoice.id);

      if (error) throw error;
      onRefresh();
    } catch (error) {
      console.error('Error marking invoice as paid:', error);
      alert('Failed to update invoice');
    }
  };

  const handleDelete = async (invoice: SalesInvoice) => {
    if (!confirm(`Delete invoice #${invoice.invoice_number}? This cannot be undone.`)) return;

    try {
      const { error } = await supabase
        .from('sales_invoices')
        .delete()
        .eq('id', invoice.id);

      if (error) throw error;
      onRefresh();
    } catch (error) {
      console.error('Error deleting invoice:', error);
      alert('Failed to delete invoice');
    }
  };

  if (invoices.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No invoices yet. Create your first invoice to get started.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3 sm:space-y-4">
        {invoices.map((invoice) => (
          <div key={invoice.id} className="border border-gray-200 rounded-xl p-3 sm:p-4 hover:shadow-md transition-shadow">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-4 gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 sm:gap-3 mb-2 flex-wrap">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900">#{invoice.invoice_number}</h3>
                  <span className={`px-2 sm:px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(invoice.status)}`}>
                    {invoice.status}
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
                    <User className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                    <span className="truncate">{getCustomerName(invoice.customer_id)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
                    <Calendar className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                    {new Date(invoice.invoice_date).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <div className="sm:text-right flex-shrink-0">
                <div className="text-xs sm:text-sm text-gray-500">Total</div>
                <div className="text-xl sm:text-2xl font-bold text-gray-900 break-words">
                  {profile?.currency_preference} {invoice.total.toLocaleString()}
                </div>
                {invoice.status !== 'paid' && invoice.amount_paid > 0 && (
                  <div className="text-xs sm:text-sm text-gray-600 mt-1 break-words">
                    Paid: {profile?.currency_preference} {invoice.amount_paid.toLocaleString()}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-3 sm:pt-4 border-t border-gray-100">
              <button
                onClick={() => setEditingInvoice(invoice)}
                className="flex-1 px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors inline-flex items-center justify-center gap-2 text-sm"
              >
                <Edit className="w-3 h-3 sm:w-4 sm:h-4" />
                Edit
              </button>

              {invoice.status !== 'paid' && (
                <button
                  onClick={() => handleMarkAsPaid(invoice)}
                  className="flex-1 px-3 sm:px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors inline-flex items-center justify-center gap-2 text-sm"
                >
                  <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                  Mark Paid
                </button>
              )}

              <button
                onClick={() => handleDelete(invoice)}
                className="sm:flex-initial px-3 sm:px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors inline-flex items-center justify-center gap-2 text-sm"
              >
                <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {editingInvoice && (
        <EditInvoiceModal
          invoice={editingInvoice}
          customers={customers}
          onClose={() => setEditingInvoice(null)}
          onUpdated={() => {
            setEditingInvoice(null);
            onRefresh();
          }}
        />
      )}
    </>
  );
}
