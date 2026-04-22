import { useEffect, useState } from 'react';
import { Plus, DollarSign, Calendar, Edit2, Trash2, Zap, Download, ShoppingBag, Pill, Wrench, Box, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { Expense, ExpenseCategory, Currency, Flock, InventoryLinkType, InventoryType } from '../../types/database';
import { FlockSwitcher } from '../common/FlockSwitcher';
import { EditExpenseModal } from './EditExpenseModal';
import { InventoryLinkSection } from './InventoryLinkSection';
import { CreateDailyUsageTaskModal } from '../inventory/CreateDailyUsageTaskModal';
import { recordInventoryIncrease } from '../../utils/inventoryMovements';
import { canViewInventoryCosts } from '../../utils/permissions';
import { shouldHideFinancialData } from '../../utils/navigationPermissions';
import { usePermissions } from '../../contexts/PermissionsContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const EXPENSE_CATEGORIES: ExpenseCategory[] = ['feed', 'medication', 'equipment', 'labor', 'chicks purchase', 'transport', 'other'];

const getCategoryLabel = (cat: string, t: (key: string) => string): string => {
  const categoryMap: Record<string, string> = {
    'feed': t('expenses.categories.feed'),
    'medication': t('expenses.categories.medication'),
    'equipment': t('expenses.categories.equipment'),
    'labor': t('expenses.categories.labor'),
    'chicks purchase': t('expenses.categories.chicks_purchase'),
    'transport': t('expenses.categories.transport'),
    'chicks transport': t('expenses.categories.transport'), // Legacy support - map old category to Transport
    'other': t('expenses.categories.other')
  };
  return categoryMap[cat] || cat;
};

export function ExpenseTracking() {
  const { t } = useTranslation();
  const { user, profile, currentFarm, currentRole } = useAuth();
  const { farmPermissions } = usePermissions();
  const [selectedFlockId, setSelectedFlockId] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory>('other');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [currency, setCurrency] = useState<Currency>('CFA');
  const [selectedExpenseFlock, setSelectedExpenseFlock] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [paidFromProfit, setPaidFromProfit] = useState(false);
  const hideFinancials = shouldHideFinancialData(currentRole, farmPermissions);

  const [inventoryEnabled, setInventoryEnabled] = useState(false);
  const [inventoryType, setInventoryType] = useState<InventoryLinkType>('none');
  const [inventoryItemId, setInventoryItemId] = useState('');
  const [inventoryQuantity, setInventoryQuantity] = useState('');
  const [inventoryUnit, setInventoryUnit] = useState('bags');
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('');

  const [showTaskSuggestion, setShowTaskSuggestion] = useState(false);
  const [newInventoryItem, setNewInventoryItem] = useState<{
    id: string;
    name: string;
    type: InventoryType;
    unit: string;
  } | null>(null);
  const [totalExpensesAmount, setTotalExpensesAmount] = useState(0);
  const [categoryTotals, setCategoryTotals] = useState<Record<string, number>>({});
  const [visibleExpenseCount, setVisibleExpenseCount] = useState(5);
  const [expandedExpenseId, setExpandedExpenseId] = useState<string | null>(null);
  const [totalRevenueGenerated, setTotalRevenueGenerated] = useState(0);

  const canManageExpenses = currentRole === 'owner' || currentRole === 'manager';

  const loadRevenueGenerated = async () => {
    if (!currentFarm?.id) return;
    let query = supabase
      .from('revenues')
      .select('amount')
      .eq('farm_id', currentFarm.id);
    if (selectedFlockId) {
      query = query.eq('flock_id', selectedFlockId);
    }
    const { data } = await query;
    const totalRevenue = (data || []).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
    setTotalRevenueGenerated(totalRevenue);
  };

  const loadFlocks = async () => {
    const { data } = await supabase
      .from('flocks')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    setFlocks(data || []);
    if (data && data.length > 0 && !selectedExpenseFlock) {
      setSelectedExpenseFlock(data[0].id);
    }
  };

  const loadExpenses = async () => {
    // Load ALL expenses since day 1 (no date filter, no limit)
    let query = supabase
      .from('expenses')
      .select('*')
      .order('incurred_on', { ascending: false });

    if (selectedFlockId) {
      query = query.eq('flock_id', selectedFlockId);
    }

    const { data } = await query;
    setExpenses(data || []);
  };

  const handleDeleteExpense = async (expense: Expense) => {
    if (!canManageExpenses) return;
    const confirmed = window.confirm(
      t('expenses.confirm_delete_expense', {
        amount: convertAmount(expense.amount),
        currency,
        description: expense.description || '',
      }) || 'Delete this expense?'
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      await supabase
        .from('expenses')
        .delete()
        .eq('id', expense.id);
      await loadExpenses();
      await loadTotalExpenses();
      await loadCategoryTotals();
      await loadRevenueGenerated();
    } catch (err) {
      console.error('Error deleting expense:', err);
      setError('Failed to delete expense. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadTotalExpenses = async () => {
    if (!currentFarm?.id) return;

    let query = supabase
      .from('expenses')
      .select('amount, category')
      .eq('farm_id', currentFarm.id);

    if (selectedFlockId) {
      query = query.eq('flock_id', selectedFlockId);
    }

    const { data } = await query;
    // Exclude "chicks purchase" and "chicks transport" from expense totals (we'll use flocks table instead)
    // But include "transport" category expenses directly
    const total = (data || []).reduce((sum, e) => {
      const cat = (e.category || '').toLowerCase();
      if (cat === 'chicks purchase' || cat === 'chicks transport') {
        return sum; // Skip old chicks transport - we'll count from flocks table
      }
      return sum + parseFloat((e.amount || 0).toString());
    }, 0);
    
    // Include flock-derived chick costs (source of truth - flocks table)
    // Note: flock transport costs will be added to "transport" category, not "chicks transport"
    const chickCosts = await getChickCostsFromFlocks(selectedFlockId);
    setTotalExpensesAmount(total + chickCosts.purchase + chickCosts.transport);
  };

  const loadCategoryTotals = async () => {
    if (!currentFarm?.id) return;

    let query = supabase
      .from('expenses')
      .select('category, amount, flock_id')
      .eq('farm_id', currentFarm.id);

    if (selectedFlockId) {
      query = query.eq('flock_id', selectedFlockId);
    }

    const { data } = await query;
    const totals: Record<string, number> = {};
    (data || []).forEach((row: any) => {
      const key = (row.category || 'other').toLowerCase();
      // Skip "chicks purchase" and old "chicks transport" from expense entries (we'll use flocks table instead)
      // But include new "transport" category expenses directly
      if (key === 'chicks purchase' || key === 'chicks transport') {
        return;
      }
      const amt = Number(row.amount || 0);
      totals[key] = (totals[key] || 0) + amt;
    });

    // Use flock-derived chicks purchase costs (source of truth - flocks table)
    const chickCosts = await getChickCostsFromFlocks(selectedFlockId);
    totals['chicks purchase'] = chickCosts.purchase;
    
    // Add flock transport costs to "transport" category (consolidate all transport)
    // This includes both old "chicks transport" from flocks and any new "transport" expenses
    totals['transport'] = (totals['transport'] || 0) + chickCosts.transport;

    setCategoryTotals(totals);
  };

  // Compute chick purchase/transport costs from flocks table only (source of truth)
  const getChickCostsFromFlocks = async (flockId?: string | null) => {
    const { data: flocksData } = await supabase
      .from('flocks')
      .select('id, initial_count, purchase_price_per_bird, purchase_transport_cost, status')
      .eq('farm_id', currentFarm?.id);

    // Only active flocks; optionally a single flock
    const relevant = (flocksData || []).filter(f => f.status === 'active')
      .filter(f => !flockId || f.id === flockId);

    const purchase = relevant.reduce((sum, f: any) => {
      const count = Number(f.initial_count || 0);
      const price = Number(f.purchase_price_per_bird || 0);
      if (!Number.isFinite(count) || !Number.isFinite(price) || count <= 0 || price <= 0) return sum;
      return sum + (count * price);
    }, 0);

    const transport = relevant.reduce((sum, f: any) => {
      const val = Number(f.purchase_transport_cost || 0);
      if (!Number.isFinite(val) || val <= 0) return sum;
      return sum + val;
    }, 0);

    return { purchase, transport };
  };

  useEffect(() => {
    if (user) {
      loadExpenses();
      loadTotalExpenses();
      loadCategoryTotals();
      loadFlocks();
      loadRevenueGenerated();
    }
    
    // Reset visible count to 5 when component unmounts or when selectedFlockId changes
    return () => {
      setVisibleExpenseCount(5);
      setExpandedExpenseId(null);
    };
  }, [user, selectedFlockId, currentFarm?.id]);

  useEffect(() => {
    if (currentFarm?.currency_code || currentFarm?.currency) {
      setCurrency(currentFarm.currency_code || currentFarm.currency);
    }
  }, [currentFarm]);

  const handleAdd = async () => {
    if (!amount || !selectedExpenseFlock || !description) {
      setError('Please fill in all required fields');
      return;
    }

    const amountNum = parseFloat(amount);
    if (amountNum <= 0) {
      setError('Amount must be greater than 0');
      return;
    }

    if (inventoryEnabled) {
      if (!inventoryQuantity || parseFloat(inventoryQuantity) <= 0) {
        setError('Please enter a valid quantity');
        return;
      }
      if (!inventoryItemId) {
        setError('Please select or create an inventory item');
        return;
      }
      if (inventoryItemId === 'new' && !newItemName.trim()) {
        setError('Please enter a name for the new inventory item');
        return;
      }
      if (inventoryItemId === 'new' && inventoryType === 'other' && !newItemCategory) {
        setError('Please select a category for the new inventory item');
        return;
      }
    }

    setLoading(true);
    setError('');
    try {
      const selectedFlock = flocks.find(f => f.id === selectedExpenseFlock);
      let finalInventoryItemId: string | null = null;
      const quantityNum = inventoryEnabled ? parseFloat(inventoryQuantity) : 0;
      let isNewItem = false;
      let createdItemName = '';
      let createdItemType: InventoryType | null = null;

      if (inventoryEnabled && inventoryType !== 'none') {
        if (inventoryItemId === 'new') {
          isNewItem = true;
          createdItemName = newItemName.trim();

          if (inventoryType === 'feed') {
            const { data: newFeedType, error: feedTypeError } = await supabase
              .from('feed_types')
              .insert({
                farm_id: currentFarm!.id,
                name: newItemName.trim(),
                unit: inventoryUnit,
              })
              .select()
              .single();

            if (feedTypeError) throw feedTypeError;
            finalInventoryItemId = newFeedType.id;
            createdItemType = 'feed';

            const { error: inventoryError } = await supabase
              .from('feed_inventory')
              .insert({
                farm_id: currentFarm!.id,
                feed_type_id: newFeedType.id,
                quantity: quantityNum,
              });

            if (inventoryError) throw inventoryError;
          } else if (inventoryType === 'other') {
            const { data: newOtherItem, error: otherError } = await supabase
              .from('other_inventory_items')
              .insert({
                farm_id: currentFarm!.id,
                name: newItemName.trim(),
                category: newItemCategory,
                quantity: quantityNum,
                unit: inventoryUnit,
              })
              .select()
              .single();

            if (otherError) throw otherError;
            finalInventoryItemId = newOtherItem.id;
            createdItemType = 'other';
          }

          if (finalInventoryItemId && createdItemType) {
            await recordInventoryIncrease(
              currentFarm!.id,
              user!.id,
              createdItemType,
              finalInventoryItemId,
              quantityNum,
              inventoryUnit,
              'expense'
            );
          }
        } else {
          finalInventoryItemId = inventoryItemId;

          if (inventoryType === 'feed') {
            await recordInventoryIncrease(
              currentFarm!.id,
              user!.id,
              'feed',
              inventoryItemId,
              quantityNum,
              inventoryUnit,
              'expense'
            );
          } else if (inventoryType === 'other') {
            await recordInventoryIncrease(
              currentFarm!.id,
              user!.id,
              'other',
              inventoryItemId,
              quantityNum,
              inventoryUnit,
              'expense'
            );
          }
        }
      }

      const expensePayload = {
        user_id: user!.id,
        farm_id: currentFarm!.id,
        flock_id: selectedExpenseFlock,
        category: category.toLowerCase(),
        amount: amountNum,
        currency,
        description,
        incurred_on: date,
        inventory_link_type: inventoryEnabled ? inventoryType : 'none',
        inventory_item_id: finalInventoryItemId,
        inventory_quantity: inventoryEnabled ? quantityNum : null,
        inventory_unit: inventoryEnabled ? inventoryUnit : null,
        paid_from_profit: paidFromProfit,
      };

      const { error: insertError } = await supabase.from('expenses').insert(expensePayload);

      if (insertError) {
        throw insertError;
      }

      const activityMessage = inventoryEnabled && inventoryType !== 'none'
        ? `Added ${category} expense of ${amountNum} ${currency} and updated inventory (${quantityNum} ${inventoryUnit})`
        : `Added ${category} expense of ${amountNum} ${currency}`;

      const { error: activityError } = await supabase.from('activity_logs').insert({
        user_id: user!.id,
        action: activityMessage,
        entity_type: 'expense',
        entity_id: selectedExpenseFlock,
        details: {
          flock_name: selectedFlock?.name,
          category,
          amount: amountNum,
          currency,
          date,
          inventory_linked: inventoryEnabled,
          inventory_type: inventoryType,
          inventory_quantity: quantityNum,
        }
      });

      if (activityError && import.meta.env.DEV) console.warn('Activity log error:', activityError);

      setAmount('');
      setDescription('');
      setInventoryEnabled(false);
      setInventoryType('none');
      setInventoryItemId('');
      setInventoryQuantity('');
      setNewItemName('');
      setNewItemCategory('');
      setPaidFromProfit(false);
      setShowAddForm(false);
      await loadExpenses();
      await loadTotalExpenses();
      await loadCategoryTotals();
      await loadRevenueGenerated();

      if (isNewItem && finalInventoryItemId && createdItemType && currentRole) {
        const canManage = canViewInventoryCosts(currentRole);
        if (canManage) {
          setNewInventoryItem({
            id: finalInventoryItemId,
            name: createdItemName,
            type: createdItemType,
            unit: inventoryUnit,
          });
          setShowTaskSuggestion(true);
        }
      }
    } catch (err: any) {
      const errorParts = [
        err?.message,
        err?.details,
        err?.hint,
        err?.code,
      ].filter(Boolean);

      const errorMessage = errorParts.length > 0
        ? `Failed to add expense: ${errorParts.join(' | ')}`
        : 'Failed to add expense';

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const getCategoryTotal = (cat: ExpenseCategory) => {
    const key = cat.toLowerCase();
    return categoryTotals[key] || 0;
  };

  // Use the total from all expenses, not just the displayed ones
  const totalExpenses = totalExpensesAmount;
  const totalPaidFromProfit = expenses.reduce((sum, expense) => {
    if (!expense.paid_from_profit) return sum;
    return sum + Number(expense.amount || 0);
  }, 0);
  const remainingProfitBalance = totalRevenueGenerated - totalPaidFromProfit;

  const farmCurrency = (currentFarm?.currency_code || currentFarm?.currency || 'XAF') as Currency;

  const toggleCurrency = () => {
    const newCurrency: Currency = currency === 'USD' ? farmCurrency : 'USD';
    setCurrency(newCurrency);
  };

  const convertAmount = (amt: number) => {
    if (currency === 'USD') {
      return (amt / 600).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    }
    return amt.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  };

  const handleFlockChange = (flockId: string | null) => {
    setSelectedFlockId(flockId);
  };

  const getFlockName = (flockId: string | null) => {
    if (!flockId) return t('expenses.unassigned');
    const flock = flocks.find(f => f.id === flockId);
    return flock?.name || t('expenses.unknown');
  };

  const handleExport = () => {
    if (!currentFarm) return;

    // Initialize PDF
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    let yPos = margin;

    // Brand colors
    const primaryColor = [75, 61, 36]; // agri-brown
    const accentColor = [255, 221, 0]; // neon
    const textColor = [26, 26, 26]; // dark text

    // Calculate comprehensive statistics
    const totalAmount = totalExpensesAmount;
    const expensesByCategory: Record<string, number> = {};
    const expensesByFlock: Record<string, { count: number; total: number }> = {};
    const expensesByMonth: Record<string, { total: number; expenses: Expense[] }> = {};
    const allExpenseAmounts: number[] = [];

    expenses.forEach(expense => {
      const cat = expense.category.toLowerCase();
      // Skip old "chicks purchase" and "chicks transport" - will add from flocks table
      // Include new "transport" category expenses directly
      if (cat !== 'chicks purchase' && cat !== 'chicks transport') {
        expensesByCategory[cat] = (expensesByCategory[cat] || 0) + Number(expense.amount || 0);
      }
      
      const flockName = expense.flock_id ? getFlockName(expense.flock_id) : t('expenses.unassigned');
      if (!expensesByFlock[flockName]) {
        expensesByFlock[flockName] = { count: 0, total: 0 };
      }
      expensesByFlock[flockName].count++;
      expensesByFlock[flockName].total += Number(expense.amount || 0);
      
      const expenseDate = new Date(expense.incurred_on || expense.date || '');
      const monthKey = expenseDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
      if (!expensesByMonth[monthKey]) {
        expensesByMonth[monthKey] = { total: 0, expenses: [] };
      }
      expensesByMonth[monthKey].total += Number(expense.amount || 0);
      expensesByMonth[monthKey].expenses.push(expense);
      
      allExpenseAmounts.push(Number(expense.amount || 0));
    });

    // Add flock-derived costs to category totals
    const chickCosts = categoryTotals;
    if (chickCosts['chicks purchase']) expensesByCategory['chicks purchase'] = chickCosts['chicks purchase'];
    // Add flock transport costs to "transport" category (consolidate all transport)
    if (chickCosts['transport'] || chickCosts['chicks transport']) {
      expensesByCategory['transport'] = (expensesByCategory['transport'] || 0) + (chickCosts['transport'] || 0) + (chickCosts['chicks transport'] || 0);
    }

    // Calculate statistics
    const avgExpense = expenses.length > 0 ? totalAmount / expenses.length : 0;
    const largestExpense = allExpenseAmounts.length > 0 ? Math.max(...allExpenseAmounts) : 0;
    
    // Find date range
    const sortedExpenses = [...expenses].sort((a, b) => {
      const dateA = new Date(a.incurred_on || a.date || '').getTime();
      const dateB = new Date(b.incurred_on || b.date || '').getTime();
      return dateA - dateB;
    });
    const firstDate = sortedExpenses.length > 0 
      ? new Date(sortedExpenses[0].incurred_on || sortedExpenses[0].date || '').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    // Use current date as end date to show the report period correctly
    const lastDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    // Helper function to add page header if needed
    const checkPageBreak = (requiredSpace: number) => {
      if (yPos + requiredSpace > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        yPos = margin;
      }
    };

    // HEADER
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, pageWidth, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('EDENTRACK', margin, 18);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Expense Report', margin, 24);
    
    yPos = 40;

    // Farm Info
    doc.setTextColor(...textColor);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(currentFarm.name || 'My Farm', margin, yPos);
    yPos += 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Period: ${firstDate} to ${lastDate}`, margin, yPos);
    yPos += 5;
    doc.text(`Filter: ${selectedFlockId ? getFlockName(selectedFlockId) : 'All Flocks'}`, margin, yPos);
    yPos += 5;
    doc.text(`Generated: ${new Date().toLocaleString()}`, margin, yPos);
    yPos += 10;

    // EXECUTIVE SUMMARY (Compact)
    checkPageBreak(35);
    doc.setFillColor(...accentColor);
    doc.rect(margin, yPos - 5, pageWidth - 2 * margin, 8, 'F');
    doc.setTextColor(...textColor);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('SUMMARY', margin + 3, yPos);
    yPos += 10;

    const summaryData = [
      ['Total Expenses', `${totalAmount.toLocaleString()} ${currency}`],
      ['Total Records', expenses.length.toString()],
      ['Average per Record', `${avgExpense.toFixed(2)} ${currency}`],
      ['Largest Expense', `${largestExpense.toLocaleString()} ${currency}`],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [['Metric', 'Value']],
      body: summaryData,
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [245, 245, 245], textColor: textColor, fontStyle: 'bold' },
      margin: { left: margin, right: margin },
    });
    yPos = (doc as any).lastAutoTable.finalY + 8;

    // EXPENSES BY CATEGORY
    checkPageBreak(50);
    doc.setFillColor(...accentColor);
    doc.rect(margin, yPos - 5, pageWidth - 2 * margin, 8, 'F');
    doc.setTextColor(...textColor);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('BY CATEGORY', margin + 3, yPos);
    yPos += 10;

    const categoryData = EXPENSE_CATEGORIES.map(cat => {
      const catKey = cat.toLowerCase();
      const amount = expensesByCategory[catKey] || categoryTotals[catKey] || 0;
      const percentage = totalAmount > 0 ? ((amount / totalAmount) * 100).toFixed(1) : '0.0';
      const recordCount = expenses.filter(e => e.category.toLowerCase() === catKey).length;
      return [getCategoryLabel(cat, t), `${amount.toLocaleString()} ${currency}`, `${percentage}%`, recordCount.toString()];
    });
    categoryData.push(['TOTAL', `${totalAmount.toLocaleString()} ${currency}`, '100.0%', expenses.length.toString()]);

    autoTable(doc, {
      startY: yPos,
      head: [['Category', 'Amount', '%', 'Records']],
      body: categoryData,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      margin: { left: margin, right: margin },
    });
    yPos = (doc as any).lastAutoTable.finalY + 8;

    // EXPENSES BY FLOCK
    checkPageBreak(40);
    doc.setFillColor(...accentColor);
    doc.rect(margin, yPos - 5, pageWidth - 2 * margin, 8, 'F');
    doc.setTextColor(...textColor);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('BY FLOCK', margin + 3, yPos);
    yPos += 10;

    const sortedFlockEntries = Object.entries(expensesByFlock).sort((a, b) => b[1].total - a[1].total);
    const flockData = sortedFlockEntries.map(([flockName, data]) => {
      const percentage = totalAmount > 0 ? ((data.total / totalAmount) * 100).toFixed(1) : '0.0';
      const avg = data.count > 0 ? (data.total / data.count).toFixed(0) : '0';
      return [flockName, `${data.total.toLocaleString()} ${currency}`, data.count.toString(), `${avg} ${currency}`, `${percentage}%`];
    });
    flockData.push(['TOTAL', `${totalAmount.toLocaleString()} ${currency}`, expenses.length.toString(), `${avgExpense.toFixed(0)} ${currency}`, '100.0%']);

    autoTable(doc, {
      startY: yPos,
      head: [['Flock', 'Total', 'Records', 'Avg', '%']],
      body: flockData,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      margin: { left: margin, right: margin },
    });
    yPos = (doc as any).lastAutoTable.finalY + 8;

    // EXPENSES BY MONTH WITH DETAILS (User's favorite section)
    const sortedMonths = Object.entries(expensesByMonth).sort((a, b) => {
      return new Date(a[0]).getTime() - new Date(b[0]).getTime();
    });

    sortedMonths.forEach(([month, monthData]) => {
      checkPageBreak(60);
      doc.setFillColor(...accentColor);
      doc.rect(margin, yPos - 5, pageWidth - 2 * margin, 8, 'F');
      doc.setTextColor(...textColor);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      const percentage = totalAmount > 0 ? ((monthData.total / totalAmount) * 100).toFixed(1) : '0.0';
      doc.text(`${month} - ${monthData.total.toLocaleString()} ${currency} (${percentage}%)`, margin + 3, yPos);
      yPos += 10;

      // Sort month expenses by date
      const monthExpenses = [...monthData.expenses].sort((a, b) => {
        const dateA = new Date(a.incurred_on || a.date || '').getTime();
        const dateB = new Date(b.incurred_on || b.date || '').getTime();
        return dateB - dateA;
      });

      const monthTableData = monthExpenses.map(expense => {
        const date = new Date(expense.incurred_on || expense.date || '').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const category = getCategoryLabel(expense.category, t);
        const description = (expense.description || '').substring(0, 30) + (expense.description && expense.description.length > 30 ? '...' : '');
        const amount = expense.amount?.toString() || '0';
        const flock = expense.flock_id ? getFlockName(expense.flock_id) : t('expenses.unassigned');
        const fromProfit = expense.paid_from_profit ? 'Yes' : 'No';
        return [date, category, description, `${amount} ${expense.currency || currency}`, flock, fromProfit];
      });

      autoTable(doc, {
        startY: yPos,
        head: [['Date', 'Category', 'Description', 'Amount', 'Flock', 'From Profit']],
        body: monthTableData,
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
        alternateRowStyles: { fillColor: [252, 252, 252] },
        margin: { left: margin, right: margin },
      });
      yPos = (doc as any).lastAutoTable.finalY + 8;
    });

    // TOP 10 EXPENSES
    checkPageBreak(50);
    doc.setFillColor(...accentColor);
    doc.rect(margin, yPos - 5, pageWidth - 2 * margin, 8, 'F');
    doc.setTextColor(...textColor);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('TOP 10 LARGEST EXPENSES', margin + 3, yPos);
    yPos += 10;

    const topExpenses = [...expenses]
      .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
      .slice(0, 10);

    const topExpensesData = topExpenses.map((expense, index) => {
      const date = new Date(expense.incurred_on || expense.date || '').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const category = getCategoryLabel(expense.category, t);
      const description = (expense.description || '').substring(0, 25) + (expense.description && expense.description.length > 25 ? '...' : '');
      const amount = expense.amount?.toString() || '0';
      const flock = expense.flock_id ? getFlockName(expense.flock_id) : t('expenses.unassigned');
      const fromProfit = expense.paid_from_profit ? 'Yes' : 'No';
      return [`#${index + 1}`, date, category, description, `${amount} ${expense.currency || currency}`, flock, fromProfit];
    });

    autoTable(doc, {
      startY: yPos,
      head: [['Rank', 'Date', 'Category', 'Description', 'Amount', 'Flock', 'From Profit']],
      body: topExpensesData,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
      alternateRowStyles: { fillColor: [252, 252, 252] },
      margin: { left: margin, right: margin },
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;

    // Footer on all pages
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, doc.internal.pageSize.getHeight() - 10, { align: 'right' });
      doc.text(`EDENTRACK Expense Report`, margin, doc.internal.pageSize.getHeight() - 10);
    }

    // Save PDF
    const farmName = currentFarm.name?.replace(/[^a-zA-Z0-9]/g, '_') || 'farm';
    const flockName = selectedFlockId ? `_${getFlockName(selectedFlockId).replace(/[^a-zA-Z0-9]/g, '_')}` : '';
    doc.save(`Expense_Report_${farmName}${flockName}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div data-tour="expense-header" className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('expenses.title')}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{t('expenses.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {currentRole && currentRole !== 'viewer' && (
            <>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="btn-primary inline-flex items-center"
                title={t('expenses.add_expense_tooltip')}
              >
                <Plus className="w-5 h-5 mr-2" />
                {t('expenses.add_expense')}
              </button>
              <button
                onClick={handleExport}
                className="px-4 py-2 bg-white text-gray-900 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-2 font-medium"
                title={t('expenses.export_tooltip')}
              >
                <Download className="w-4 h-4 text-gray-900" />
                <span className="hidden sm:inline text-gray-900">{t('expenses.export')}</span>
              </button>
            </>
          )}
        </div>
      </div>

      <FlockSwitcher
        selectedFlockId={selectedFlockId}
        onFlockChange={handleFlockChange}
        showAllOption={true}
        label={t('expenses.filter_by_flock')}
      />

      {/* Quick Actions */}
      <div className="animate-fade-in-up">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-5 h-5 text-yellow-500" />
          <h3 className="text-lg font-bold text-gray-900">{t('expenses.quick_actions')}</h3>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            onClick={() => {
              setCategory('feed');
              setInventoryEnabled(true);
              setInventoryType('feed');
              setShowAddForm(true);
            }}
            className="bg-white border border-gray-200 rounded-lg p-2.5 hover:bg-gray-50 transition-colors text-left"
            title={t('expenses.record_feed_purchase_tooltip')}
          >
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <ShoppingBag className="w-4 h-4 text-orange-600" />
              </div>
              <h4 className="font-semibold text-gray-900 text-sm">{t('expenses.record_feed_purchase')}</h4>
            </div>
          </button>

          <button
            onClick={() => {
              setCategory('medication');
              setInventoryEnabled(true);
              setInventoryType('other');
              setNewItemCategory('Medication');
              setShowAddForm(true);
            }}
            className="bg-white border border-gray-200 rounded-lg p-2.5 hover:bg-gray-50 transition-colors text-left"
            title={t('expenses.record_medication_purchase_tooltip')}
          >
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Pill className="w-4 h-4 text-blue-600" />
              </div>
              <h4 className="font-semibold text-gray-900 text-sm">{t('expenses.record_medication_purchase')}</h4>
            </div>
          </button>

          <button
            onClick={() => {
              setCategory('equipment');
              setInventoryEnabled(true);
              setInventoryType('other');
              setNewItemCategory('Equipment');
              setShowAddForm(true);
            }}
            className="bg-white border border-gray-200 rounded-lg p-2.5 hover:bg-gray-50 transition-colors text-left"
            title={t('expenses.record_equipment_purchase_tooltip')}
          >
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Wrench className="w-4 h-4 text-purple-600" />
              </div>
              <h4 className="font-semibold text-gray-900 text-sm">{t('expenses.record_equipment_purchase')}</h4>
            </div>
          </button>

          <button
            onClick={() => {
              setCategory('other');
              setInventoryEnabled(true);
              setInventoryType('other');
              setNewItemCategory('Supplies');
              setShowAddForm(true);
            }}
            className="bg-white border border-gray-200 rounded-lg p-2.5 hover:bg-gray-50 transition-colors text-left"
            title={t('expenses.record_supplies_purchase_tooltip')}
          >
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Box className="w-4 h-4 text-green-600" />
              </div>
              <h4 className="font-semibold text-gray-900 text-sm">{t('expenses.record_supplies_purchase')}</h4>
            </div>
          </button>
        </div>
      </div>

      {showAddForm && (
        <div className="bg-white rounded-2xl shadow-soft p-4 animate-fade-in-up">
          <h3 className="text-base font-bold text-gray-900 mb-3">{t('expenses.new_expense')}</h3>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs mb-3">
              {error}
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); handleAdd(); }} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-gray-900 mb-1">
                  {t('expenses.flock')} <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedExpenseFlock}
                  onChange={(e) => setSelectedExpenseFlock(e.target.value)}
                  required
                  className="w-full px-2.5 py-1.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-all text-xs"
                >
                  <option value="">{t('expenses.select_a_flock')}</option>
                  {flocks.map((flock) => (
                    <option key={flock.id} value={flock.id}>
                      {flock.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-900 mb-1">
                  {t('expenses.expense_category')}
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                  className="w-full px-2.5 py-1.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-all text-xs"
                >
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {getCategoryLabel(cat, t)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-gray-900 mb-1">
                  Amount ({currency}) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  className="w-full px-2.5 py-1.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-all text-xs"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-900 mb-1">
                  {t('expenses.date')}
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-all text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-900 mb-1">
                {t('expenses.description')} <span className="text-red-500">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                className="w-full px-2.5 py-1.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-xs resize-none"
                rows={2}
                placeholder={t('expenses.description_placeholder')}
              />
            </div>

            <label className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg bg-gray-50">
              <input
                type="checkbox"
                checked={paidFromProfit}
                onChange={(e) => setPaidFromProfit(e.target.checked)}
                className="w-4 h-4"
              />
              <div>
                <div className="text-xs font-semibold text-gray-900">Paid from revenue balance</div>
                <div className="text-[10px] text-gray-600">
                  When checked, this expense reduces your revenue balance tracker below.
                </div>
              </div>
            </label>

            <InventoryLinkSection
              enabled={inventoryEnabled}
              onEnabledChange={setInventoryEnabled}
              inventoryType={inventoryType}
              onInventoryTypeChange={setInventoryType}
              selectedItemId={inventoryItemId}
              onSelectedItemIdChange={setInventoryItemId}
              quantity={inventoryQuantity}
              onQuantityChange={setInventoryQuantity}
              unit={inventoryUnit}
              onUnitChange={setInventoryUnit}
              newItemName={newItemName}
              onNewItemNameChange={setNewItemName}
              newItemCategory={newItemCategory}
              onNewItemCategoryChange={setNewItemCategory}
            />

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setError('');
                  setPaidFromProfit(false);
                }}
                className="flex-1 px-3 py-2 bg-white text-gray-900 border border-gray-300 rounded-lg text-xs font-semibold hover:bg-gray-50 transition-colors"
                title={t('expenses.cancel_adding_expense')}
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={loading || !amount || !selectedExpenseFlock || !description}
                className="flex-1 px-3 py-2 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-lg text-xs font-semibold hover:from-amber-700 hover:to-orange-700 disabled:from-gray-400 disabled:to-gray-500 transition-all shadow-sm hover:shadow-md"
                title={t('expenses.save_expense')}
              >
                {loading ? t('expenses.adding') : t('expenses.add_expense')}
              </button>
            </div>
          </form>
        </div>
      )}

      {!hideFinancials && (
        <div className="section-card-yellow animate-fade-in-up">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-gray-900">
              {selectedFlockId ? t('expenses.flock_spending') : t('expenses.total_spending')}
            </h3>
            <button
              onClick={toggleCurrency}
              className="px-3 py-1.5 bg-white/60 hover:bg-white rounded-lg text-xs font-medium transition-colors text-gray-900"
              title={t('expenses.switch_currency')}
            >
              {currency} ⇄ {currency === 'USD' ? farmCurrency : 'USD'}
            </button>
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-1.5">
            {convertAmount(totalExpenses)} <span className="text-lg font-semibold text-gray-600">{currency}</span>
          </div>
          <div className="text-xs text-gray-600">
            {selectedFlockId
              ? t('expenses.for_flock', { flock: getFlockName(selectedFlockId) })
              : t('expenses.all_flocks_combined')}
            {currency === 'USD' && ` • ≈ ${totalExpenses.toLocaleString('en-US')} CFA`}
          </div>
        </div>
      )}

      {!hideFinancials && (
        <div className="section-card animate-fade-in-up">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="text-base font-bold text-gray-900">Revenue Balance</h3>
            <div className="text-xs text-gray-600">
              Remaining: <span className={`font-semibold ${remainingProfitBalance < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                {convertAmount(remainingProfitBalance)} {currency}
              </span>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-2 text-xs text-gray-700">
            <div className="p-2 bg-white border border-gray-200 rounded-lg">
              Revenue generated: <span className="ml-1 font-semibold text-gray-900">{convertAmount(totalRevenueGenerated)} {currency}</span>
            </div>
            <div className="p-2 bg-white border border-gray-200 rounded-lg">
              Used from revenue: <span className="ml-1 font-semibold text-gray-900">{convertAmount(totalPaidFromProfit)} {currency}</span>
            </div>
            <div className="p-2 bg-white border border-gray-200 rounded-lg">
              Balance left: <span className={`ml-1 font-semibold ${remainingProfitBalance < 0 ? 'text-red-600' : 'text-gray-900'}`}>{convertAmount(remainingProfitBalance)} {currency}</span>
            </div>
          </div>
          {remainingProfitBalance < 0 && (
            <p className="text-[11px] text-red-600 mt-2">
              Expenses marked as from revenue exceed revenue generated.
            </p>
          )}
        </div>
      )}

      {!hideFinancials && (
        <div className="section-card animate-fade-in-up">
          <h3 className="text-lg font-bold text-gray-900 mb-4">{t('expenses.by_category')}</h3>
          <div className="grid md:grid-cols-2 gap-3">
            {EXPENSE_CATEGORIES.map((cat, index) => {
              const total = getCategoryTotal(cat);
              const percentage = totalExpenses > 0 ? (total / totalExpenses) * 100 : 0;
              return (
                <div key={cat} className="p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900 text-sm">{getCategoryLabel(cat, t)}</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {convertAmount(total)} {currency}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5 mb-1">
                    <div
                      className="bg-amber-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-gray-500">
                    {percentage.toFixed(1)}{t('expenses.of_total')}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="section-card animate-fade-in-up">
        <h3 className="text-xl font-bold text-gray-900 mb-6">{t('expenses.recent_expenses')}</h3>
        {expenses.length === 0 ? (
          <div className="text-center py-12">
            <div className="icon-circle-yellow w-16 h-16 mx-auto mb-4">
              <DollarSign className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">{t('expenses.no_expenses_yet')}</h3>
            <p className="text-gray-500 text-sm max-w-sm mx-auto">
              {selectedFlockId
                ? t('expenses.no_expenses_for_flock_message')
                : t('expenses.no_expenses_recorded_message')}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {expenses.slice(0, visibleExpenseCount).map((expense) => {
              const isExpanded = expandedExpenseId === expense.id;
              const expenseDate = expense.incurred_on || expense.date || '';
              return (
              <div
                key={expense.id}
                className="flex flex-col gap-1 p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <button
                  onClick={() => setExpandedExpenseId(isExpanded ? null : expense.id)}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-5 h-5 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <DollarSign className="w-3 h-3 text-gray-900" />
                    </div>
                    <span className="font-medium text-gray-900 text-xs whitespace-nowrap">
                      {getCategoryLabel(expense.category, t)}
                    </span>
                    {(expense.kind === 'chicks_purchase' || expense.kind === 'chicks_transport') && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-100 text-gray-900 flex-shrink-0">
                        {t('expenses.auto_from_flock')}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-500 whitespace-nowrap flex-shrink-0">
                      {new Date(expenseDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {hideFinancials ? (
                      <span className="text-gray-400 italic text-[10px]">{t('expenses.hidden')}</span>
                    ) : (
                      <div className="text-xs font-semibold text-gray-900 whitespace-nowrap">
                        {convertAmount(expense.amount)} {currency}
                      </div>
                    )}
                    <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="pl-7 space-y-1.5 pt-1">
                    {expense.description && (
                      <p className="text-xs text-gray-600">{expense.description}</p>
                    )}
                    <div className="flex items-center gap-2 text-[10px] text-gray-500">
                      <Calendar className="w-3 h-3" />
                      {new Date(expenseDate).toLocaleDateString()}
                      {expense.paid_from_profit && (
                        <span className="px-1.5 py-0.5 bg-green-100 rounded text-[9px] font-medium text-green-700">
                          From revenue
                        </span>
                      )}
                      {expense.flock_id && (
                        <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[9px] font-medium text-gray-700">
                          {getFlockName(expense.flock_id)}
                        </span>
                      )}
                    </div>
                    {canManageExpenses && (
                      <div className="pt-1 flex gap-2">
                        <button
                          onClick={() => setEditingExpense(expense)}
                          className="px-2 py-1 bg-white border border-gray-200 rounded text-[10px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                          title={t('expenses.edit_expense_tooltip')}
                        >
                          <Edit2 className="w-3 h-3 inline mr-1" />
                          {t('expenses.edit_expense')}
                        </button>
                        <button
                          onClick={() => handleDeleteExpense(expense)}
                          className="px-2 py-1 bg-red-50 border border-red-200 rounded text-[10px] font-medium text-red-600 hover:bg-red-100 transition-colors"
                          title={t('expenses.delete_expense') || 'Delete expense'}
                        >
                          <Trash2 className="w-3 h-3 inline mr-1" />
                          {t('common.delete')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
            })}

            {expenses.length > visibleExpenseCount && (
              <div className="pt-2">
                <button
                  onClick={() => setVisibleExpenseCount(prev => Math.min(prev + 5, expenses.length))}
                  className="w-full text-center text-sm font-semibold text-neon-600 hover:text-neon-800 transition-colors py-2"
                >
                  {t('common.show_more')} ({expenses.length - visibleExpenseCount} {t('common.more')})
                </button>
              </div>
            )}
            {visibleExpenseCount > 5 && (
              <div className="pt-1">
                <button
                  onClick={() => setVisibleExpenseCount(5)}
                  className="w-full text-center text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors py-1"
                >
                  {t('common.show_less')} ({t('common.back_to_top')})
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {editingExpense && (
        <EditExpenseModal
          expense={editingExpense}
          isOpen={!!editingExpense}
          onClose={() => setEditingExpense(null)}
          onSave={async () => {
            await loadExpenses();
            await loadTotalExpenses();
            await loadCategoryTotals();
            await loadRevenueGenerated();
            setEditingExpense(null);
          }}
        />
      )}

      {newInventoryItem && (
        <CreateDailyUsageTaskModal
          isOpen={showTaskSuggestion}
          onClose={() => {
            setShowTaskSuggestion(false);
            setNewInventoryItem(null);
          }}
          onSuccess={() => {
            setShowTaskSuggestion(false);
            setNewInventoryItem(null);
          }}
          itemName={newInventoryItem.name}
          itemId={newInventoryItem.id}
          inventoryType={newInventoryItem.type}
          unit={newInventoryItem.unit}
        />
      )}
    </div>
  );
}
