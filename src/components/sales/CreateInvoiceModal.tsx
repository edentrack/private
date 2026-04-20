import { useState } from 'react';
import { X, FileText, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';;
import { Customer } from '../../types/database';

interface CreateInvoiceModalProps {
  customers: Customer[];
  onClose: () => void;
  onCreated: () => void;
}

interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
}

export function CreateInvoiceModal({ customers, onClose, onCreated }: CreateInvoiceModalProps) {
  const { t } = useTranslation();
  const { user, profile, currentFarm } = useAuth();
  const [customerId, setCustomerId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [items, setItems] = useState<InvoiceItem[]>([
    { description: '', quantity: 1, unit_price: 0 },
  ]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const addItem = () => {
    setItems([...items, { description: '', quantity: 1, unit_price: 0 }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const calculateSubtotal = () => {
    return items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !currentFarm?.id) return;

    setLoading(true);
    setError('');

    try {
      const subtotal = calculateSubtotal();
      const invoiceNumber = `INV-${Date.now()}`;

      const { data: invoice, error: invoiceError } = await supabase
        .from('sales_invoices')
        .insert({
          farm_id: currentFarm.id,
          customer_id: customerId || null,
          invoice_number: invoiceNumber,
          invoice_date: invoiceDate,
          due_date: dueDate || null,
          status: 'draft',
          subtotal,
          tax: 0,
          total: subtotal,
          amount_paid: 0,
          notes,
          created_by: user.id,
        })
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      const itemsData = items.map((item) => ({
        invoice_id: invoice.id,
        description: item.description,
        item_type: 'other' as const,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total: item.quantity * item.unit_price,
      }));

      const { error: itemsError } = await supabase
        .from('invoice_items')
        .insert(itemsData);

      if (itemsError) throw itemsError;

      onCreated();
    } catch (err: any) {
      setError(err.message || 'Failed to create invoice');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-3xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <FileText className="w-5 h-5 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">{t('sales.create_invoice')}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('sales.customer')}</label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent"
              >
                <option value="">{t('sales.walk_in_customer')}</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('sales.invoice_date')} *</label>
              <input
                type="date"
                required
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('sales.due_date')}</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-700">{t('sales.items')}</label>
              <button
                type="button"
                onClick={addItem}
                className="text-sm text-[#3D5F42] hover:text-[#2F4A34] font-medium inline-flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                {t('sales.add_item')}
              </button>
            </div>
            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={index} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                  <input
                    type="text"
                    required
                    placeholder={t('sales.description')}
                    value={item.description}
                    onChange={(e) => updateItem(index, 'description', e.target.value)}
                    className="sm:col-span-6 px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent"
                  />
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    placeholder={t('sales.quantity')}
                    value={item.quantity}
                    onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value))}
                    className="sm:col-span-2 px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent"
                  />
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    placeholder={t('sales.unit_price')}
                    value={item.unit_price}
                    onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value))}
                    className="sm:col-span-3 px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    disabled={items.length === 1}
                    className="sm:col-span-1 p-2 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('sales.notes')}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent"
            />
          </div>

          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex justify-between items-center">
              <span className="text-lg font-medium text-gray-700">{t('common.total')}</span>
              <span className="text-2xl font-bold text-gray-900">
                {profile?.currency_preference} {calculateSubtotal().toLocaleString()}
              </span>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50"
            >
              {t('sales.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-[#3D5F42] text-white px-6 py-3 rounded-xl font-medium hover:bg-[#2F4A34] disabled:opacity-50"
            >
              {loading ? (t('sales.creating') || 'Creating...') : t('sales.create_invoice')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
