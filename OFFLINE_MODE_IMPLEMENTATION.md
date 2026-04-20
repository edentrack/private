# Offline Mode & PDF Reports Implementation Guide

## ✅ What Has Been Implemented

### 1. Offline Database System
- **IndexedDB Database** (`src/lib/offlineDB.ts`)
  - Stores pending create/update/delete operations
  - Local cache for offline viewing
  - Automatic sync queue management

### 2. Offline Sync Service
- **Sync Manager** (`src/lib/offlineSync.ts`)
  - Automatic sync when connection restored
  - Retry mechanism (max 5 retries)
  - Manual sync trigger
  - Status reporting

### 3. PDF Report Generator
- **PDF Generator** (`src/utils/pdfGenerator.ts`)
  - Professional formatted reports
  - Multi-page support
  - Tables with autoTable
  - Brand colors (agri-brown, neon)
  - Comprehensive sections: Flocks, Expenses, Sales, Mortality, Tasks, Inventory

### 4. UI Components
- **Offline Indicator** (`src/components/common/OfflineIndicator.tsx`)
  - Shows connection status
  - Pending sync count
  - Manual sync button
  - Success/error notifications

### 5. React Hook
- **useOfflineMode Hook** (`src/hooks/useOfflineMode.ts`)
  - `createRecord()` - Create with offline support
  - `updateRecord()` - Update with offline support
  - `deleteRecord()` - Delete with offline support
  - Automatic online/offline detection

### 6. Service Worker
- **Enhanced Service Worker** (`public/sw-enhanced.js`)
  - Caches static assets
  - Network-first for API calls
  - Cache-first for static files
  - Offline page fallback

---

## 📦 Installation Required

Run this command to install dependencies:

```bash
npm install dexie dexie-react-hooks jspdf jspdf-autotable
```

---

## 🔧 How to Use Offline Mode in Your Forms

### Example: Expense Form Integration

```tsx
import { useOfflineMode } from '../../hooks/useOfflineMode';
import { useToast } from '../../contexts/ToastContext';

function ExpenseForm() {
  const { createRecord } = useOfflineMode();
  const { showToast } = useToast();

  const handleSubmit = async (expenseData) => {
    try {
      const result = await createRecord('expenses', expenseData);
      
      if (result._pending) {
        showToast('Expense saved offline - will sync when online', 'info');
      } else {
        showToast('Expense saved successfully', 'success');
      }
      
      // Form continues to work normally
      resetForm();
    } catch (error) {
      showToast('Error saving expense', 'error');
    }
  };

  // ... rest of form
}
```

### Example: Update Record

```tsx
const { updateRecord } = useOfflineMode();

const handleUpdate = async (id, updatedData) => {
  const result = await updateRecord('flocks', id, updatedData);
  
  if (result._pending) {
    showToast('Update queued for sync', 'info');
  }
};
```

### Example: Delete Record

```tsx
const { deleteRecord } = useOfflineMode();

const handleDelete = async (id) => {
  await deleteRecord('tasks', id);
  showToast('Task deleted - will sync when online', 'info');
};
```

---

## 📄 How to Use PDF Reports

### In Insights/Analytics Page

The PDF export has been added to `ComprehensiveFarmReport.tsx`. Users can click "Download PDF" to generate a detailed report.

### Custom PDF Report

```tsx
import { downloadPDFReport } from '../../utils/pdfGenerator';

const reportData = {
  farmName: 'My Farm',
  reportType: 'daily', // or 'weekly', 'monthly', 'custom'
  startDate: '2025-01-01',
  endDate: '2025-01-31',
  flocks: flocksData,
  expenses: expensesData,
  sales: salesData,
  stats: {
    totalRevenue: 100000,
    totalExpenses: 50000,
    netProfit: 50000,
    // ... other stats
  },
};

downloadPDFReport(reportData, 'my-report.pdf', 'XAF');
```

---

## 🚀 Features

### Offline Mode Features:
1. **Automatic Queueing**: All create/update/delete operations are queued when offline
2. **Auto-Sync**: Automatically syncs when connection is restored
3. **Manual Sync**: Users can trigger sync manually via the indicator
4. **Retry Logic**: Failed syncs retry up to 5 times
5. **Status Indicator**: Always visible status of sync operations
6. **No Data Loss**: Everything is saved locally first

### PDF Report Features:
1. **Professional Formatting**: Brand colors, proper headers, tables
2. **Multi-Section**: Flocks, Expenses, Sales, Mortality, Tasks, Inventory
3. **Multi-Page**: Automatically handles page breaks
4. **Summary Stats**: Key metrics at the top
5. **Detailed Breakdown**: Complete data tables
6. **Export Ready**: One-click download

---

## 🔌 Integration Checklist

To fully integrate offline mode, update these components:

- [x] DashboardLayout (indicator added)
- [ ] ExpenseTracking (add useOfflineMode)
- [ ] CreateFlockModal (add useOfflineMode)
- [ ] SalesManagement (add useOfflineMode)
- [ ] Task creation forms (add useOfflineMode)
- [ ] Mortality logging (add useOfflineMode)
- [ ] Weight tracking (add useOfflineMode)
- [ ] Egg collection (add useOfflineMode)
- [ ] Inventory operations (add useOfflineMode)

---

## 📱 Testing Offline Mode

1. **Chrome DevTools**:
   - Open DevTools (F12)
   - Go to Network tab
   - Select "Offline" from throttling dropdown
   - Try creating/updating records
   - Check OfflineIndicator shows pending count
   - Go back online
   - Watch automatic sync

2. **Service Worker**:
   - Application tab → Service Workers
   - Check registration
   - Test cache storage

---

## 🎨 UI Elements

The OfflineIndicator appears in the bottom-right corner:
- **Offline**: Amber banner "Offline Mode"
- **Pending Sync**: Blue banner with count and sync button
- **Sync Complete**: Green success message

---

## 📝 Notes

- Offline mode uses IndexedDB (no external dependencies required after install)
- PDF generation uses jsPDF (client-side, no server required)
- Service Worker caches resources for faster loading
- All sync operations are logged for debugging

---

## 🐛 Troubleshooting

**Sync not working?**
- Check browser console for errors
- Verify Supabase connection when online
- Check network tab for failed requests

**PDF not generating?**
- Ensure jspdf is installed
- Check browser console for errors
- Verify data structure matches expected format

**Offline indicator not showing?**
- Check service worker is registered
- Verify DashboardLayout imports OfflineIndicator
- Check browser console for errors

---

## 🔄 Next Steps

1. Install dependencies: `npm install dexie dexie-react-hooks jspdf jspdf-autotable`
2. Test offline mode with DevTools
3. Integrate `useOfflineMode` into remaining forms
4. Test PDF generation from Insights page
5. Deploy and monitor sync operations

---

**Status**: ✅ Core infrastructure complete, ready for form integration!
