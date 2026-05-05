# Multi-Tenancy Audit — `src/` Supabase queries

**Generated:** 2026-05-05 · **Total `.from()` calls:** 765

## Summary

| Risk | Count |
|------|------:|
| HIGH (read leak risk) | 27 |
| HIGH (insert without farm_id) | 35 |
| MEDIUM (id-scoped — add farm_id for defense-in-depth) | 69 |
| LOW (review) | 11 |
| OK | 492 |
| EXEMPT | 131 |

| Operation | Count |
|-----------|------:|
| SELECT | 455 |
| INSERT | 137 |
| UPDATE | 125 |
| DELETE | 34 |
| UPSERT | 7 |
| STORAGE | 7 |

Exempt tables (no per-farm scoping needed): user-level (`profiles`, `subscriptions`), farm-membership tables (`farms`, `farm_members`), global tables (`broadcasts`, `announcements`, `feature_flags`, `support_tickets`), storage buckets.

## HIGH (read leak risk) — 27 call(s)

### `activity_logs` — 1 call(s)

- **SELECT** [`src/components/dashboard/RecentActivityPanel.tsx:37`](src/components/dashboard/RecentActivityPanel.tsx#L37)
  ```ts
          .from('activity_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(5);
  ```

### `feed_inventory` — 1 call(s)

- **SELECT** [`src/components/inventory/InventoryPage.tsx:424`](src/components/inventory/InventoryPage.tsx#L424)
  ```ts
            .from('feed_inventory')
            .select('feed_type_id')
            .eq('id', itemId)
            .single();
  ```

### `flocks` — 1 call(s)

- **SELECT** [`src/components/dashboard/FlockCycleCountdownCard.tsx:38`](src/components/dashboard/FlockCycleCountdownCard.tsx#L38)
  ```ts
          supabase.from('flocks').select('*').eq('id', flockId).maybeSingle(),
          supabase.rpc('get_flock_cycle_status', { p_flock_id: flockId })
        ]);
  ```

### `invoice_items` — 1 call(s)

- **SELECT** [`src/components/sales/EditInvoiceModal.tsx:41`](src/components/sales/EditInvoiceModal.tsx#L41)
  ```ts
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', invoice.id);
  ```

### `marketplace_suppliers` — 2 call(s)

- **SELECT** [`src/components/marketplace/MarketplacePage.tsx:71`](src/components/marketplace/MarketplacePage.tsx#L71)
  ```ts
          .from('marketplace_suppliers')
          .select('id, name, business_name, email, phone, category, description, address, website_url, products, delivery_available, status, is_featured')
          .in('status', ['approved', 'verified'])
          .order('is_featured', { ascending: false })
          .order('created_at', { ascending: false });
  ```
- **SELECT** [`src/components/superadmin/MarketplaceAdmin.tsx:56`](src/components/superadmin/MarketplaceAdmin.tsx#L56)
  ```ts
          .from('marketplace_suppliers')
          .select('*')
          .order('created_at', { ascending: false });
  ```

### `notifications` — 2 call(s)

- **SELECT** [`src/components/notifications/NotificationCenter.tsx:65`](src/components/notifications/NotificationCenter.tsx#L65)
  ```ts
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
  ```
- **SELECT** [`src/components/notifications/NotificationsPage.tsx:27`](src/components/notifications/NotificationsPage.tsx#L27)
  ```ts
        .from('notifications')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(100);
  ```

### `payments` — 2 call(s)

- **SELECT** [`src/components/superadmin/SuperAdminDashboard.tsx:86`](src/components/superadmin/SuperAdminDashboard.tsx#L86)
  ```ts
          supabase.from('payments').select('amount').eq('status', 'completed').gte('created_at', firstOfThisMonth),
          supabase.from('payments').select('amount').eq('status', 'completed').gte('created_at', firstOfLastMonth).lt('created_at', firstOfThisMonth),
        ]);
  ```
- **SELECT** [`src/components/superadmin/SuperAdminDashboard.tsx:87`](src/components/superadmin/SuperAdminDashboard.tsx#L87)
  ```ts
          supabase.from('payments').select('amount').eq('status', 'completed').gte('created_at', firstOfLastMonth).lt('created_at', firstOfThisMonth),
        ]);
  ```

### `payroll_items` — 1 call(s)

- **SELECT** [`src/components/payroll/CreatePayrollRunModal.tsx:81`](src/components/payroll/CreatePayrollRunModal.tsx#L81)
  ```ts
          .from('payroll_items')
          .select('*')
          .eq('payroll_run_id', result.payroll_run_id);
  ```

### `platform_announcements` — 1 call(s)

- **SELECT** [`src/components/superadmin/Announcements.tsx:31`](src/components/superadmin/Announcements.tsx#L31)
  ```ts
          .from('platform_announcements')
          .select('*')
          .order('created_at', { ascending: false });
  ```

### `platform_settings` — 1 call(s)

- **SELECT** [`src/components/superadmin/PlatformSettings.tsx:52`](src/components/superadmin/PlatformSettings.tsx#L52)
  ```ts
          .from('platform_settings')
          .select('*')
          .single();
  ```

### `receipt_items` — 1 call(s)

- **SELECT** [`src/components/sales/ProcessRefundModal.tsx:29`](src/components/sales/ProcessRefundModal.tsx#L29)
  ```ts
        .from('receipt_items')
        .select('*')
        .eq('receipt_id', receipt.id);
  ```

### `referrals` — 1 call(s)

- **SELECT** [`src/components/settings/ReferralSection.tsx:41`](src/components/settings/ReferralSection.tsx#L41)
  ```ts
        .from('referrals')
        .select('status')
        .eq('referrer_id', profile.id)
        .then(({ data }) => setStats({
          total: data?.length ?? 0,
  ```

### `subscription_tiers` — 3 call(s)

- **SELECT** [`src/components/superadmin/BillingSubscriptions.tsx:100`](src/components/superadmin/BillingSubscriptions.tsx#L100)
  ```ts
          .from('subscription_tiers')
          .select('*');
  ```
- **SELECT** [`src/components/superadmin/SuperAdminDashboard.tsx:85`](src/components/superadmin/SuperAdminDashboard.tsx#L85)
  ```ts
          supabase.from('subscription_tiers').select('name, price_monthly'),
          supabase.from('payments').select('amount').eq('status', 'completed').gte('created_at', firstOfThisMonth),
          supabase.from('payments').select('amount').eq('status', 'completed').gte('created_at', firstOfLastMonth).lt('created_at', firstOfThisMonth),
        ]);
  ```
- **SELECT** [`src/components/superadmin/PricingManagement.tsx:37`](src/components/superadmin/PricingManagement.tsx#L37)
  ```ts
          .from('subscription_tiers')
          .select('*')
          .order('price_monthly');
  ```

### `super_admin_impersonation_logs` — 2 call(s)

- **SELECT** [`src/contexts/ImpersonationContext.tsx:71`](src/contexts/ImpersonationContext.tsx#L71)
  ```ts
            .from('super_admin_impersonation_logs')
            .select('id, admin_id, target_user_id, target_farm_id, reason, started_at, ended_at')
            .eq('id', parsed.logId)
            .eq('admin_id', user.id)
            .is('ended_at', null)
  ```
- **SELECT** [`src/contexts/AuthContext.tsx:239`](src/contexts/AuthContext.tsx#L239)
  ```ts
                  .from('super_admin_impersonation_logs')
                  .select('id')
                  .eq('id', impersonation.logId)
                  .eq('admin_id', userId)
                  .is('ended_at', null)
  ```

### `task_templates` — 2 call(s)

- **SELECT** [`src/components/tasks/TaskTemplateSettings.tsx:28`](src/components/tasks/TaskTemplateSettings.tsx#L28)
  ```ts
          .from('task_templates')
          .select('*')
          .order('category', { ascending: true })
          .order('display_order', { ascending: true });
  ```
- **SELECT** [`src/components/tasks/DailyTaskTemplatesOld.tsx:40`](src/components/tasks/DailyTaskTemplatesOld.tsx#L40)
  ```ts
          .from('task_templates')
          .select('*')
          .eq('is_active', true)
          .order('display_order');
  ```

### `tasks` — 1 call(s)

- **SELECT** [`src/utils/unifiedTaskSystem.ts:347`](src/utils/unifiedTaskSystem.ts#L347)
  ```ts
        .from('tasks')
        .select('title_override, task_templates(title)')
        .eq('id', taskId)
        .maybeSingle();
  ```

### `vaccinations` — 2 call(s)

- **SELECT** [`src/components/dashboard/UpcomingHealthEventsCard.tsx:36`](src/components/dashboard/UpcomingHealthEventsCard.tsx#L36)
  ```ts
          .from('vaccinations')
          .select(`
            *,
            flocks!inner(name, farm_id)
          `)
  ```
- **SELECT** [`src/components/dashboard/NextVaccinationCard.tsx:32`](src/components/dashboard/NextVaccinationCard.tsx#L32)
  ```ts
          .from('vaccinations')
          .select('*')
          .eq('flock_id', flock.id)
          .eq('completed', false)
          .gte('scheduled_date', today)
  ```

### `weight_logs` — 2 call(s)

- **SELECT** [`src/components/dashboard/DailySummaryCard.tsx:216`](src/components/dashboard/DailySummaryCard.tsx#L216)
  ```ts
            .from('weight_logs')
            .select('average_weight')
            .in('flock_id', broilerFlockIds)
            .eq('date', selectedDate);
  ```
- **SELECT** [`src/components/dashboard/ProductionCycleWidget.tsx:242`](src/components/dashboard/ProductionCycleWidget.tsx#L242)
  ```ts
        .from('weight_logs')
        .select('average_weight, date')
        .eq('flock_id', flock.id)
        .gte('date', weekStartDate.toISOString().split('T')[0])
        .lte('date', weekEndDate.toISOString().split('T')[0])
  ```

## HIGH (insert without farm_id) — 35 call(s)

### `activity_logs` — 8 call(s)

- **INSERT** [`src/components/tasks/DailyTaskTemplates.tsx:166`](src/components/tasks/DailyTaskTemplates.tsx#L166)
  ```ts
        await supabase.from('activity_logs').insert({
          user_id: currentFarm.id,
          action: `Completed task: ${selectedTask.title}`,
          entity_type: 'task',
          entity_id: selectedTask.id,
  ```
- **INSERT** [`src/components/tasks/DailyTaskTemplatesOld.tsx:120`](src/components/tasks/DailyTaskTemplatesOld.tsx#L120)
  ```ts
        await supabase.from('activity_logs').insert({
          user_id: currentFarm.id,
          action: `Completed daily task: ${template.title}`,
          entity_type: 'task',
          entity_id: template.id,
  ```
- **INSERT** [`src/components/tasks/RecordFeedUsageModal.tsx:98`](src/components/tasks/RecordFeedUsageModal.tsx#L98)
  ```ts
        await supabase.from('activity_logs').insert({
          user_id: user.id,
          action: `Recorded feed usage: ${bagsUsedNum} bags of ${selectedFeed.feed_type}`,
          entity_type: 'feed_stock',
          entity_id: selectedFeedType,
  ```
- **INSERT** [`src/components/expenses/EditExpenseModal.tsx:128`](src/components/expenses/EditExpenseModal.tsx#L128)
  ```ts
        await supabase.from('activity_logs').insert({
          user_id: user!.id,
          action: `Updated ${normalizedCategory} expense to ${amountNum} ${expense.currency}`,
          entity_type: 'expense',
          entity_id: expense.id,
  ```
- **INSERT** [`src/components/expenses/ExpenseTracking.tsx:445`](src/components/expenses/ExpenseTracking.tsx#L445)
  ```ts
        const { error: activityError } = await supabase.from('activity_logs').insert({
          user_id: user!.id,
          action: activityMessage,
          entity_type: 'expense',
          entity_id: selectedExpenseFlock,
  ```
- **INSERT** [`src/components/mortality/LogMortalityModal.tsx:125`](src/components/mortality/LogMortalityModal.tsx#L125)
  ```ts
        const { error: activityError } = await supabase.from('activity_logs').insert({
          user_id: currentFlock.user_id,
          action: `Logged ${mortalityCount} mortality event${mortalityCount > 1 ? 's' : ''}`,
          entity_type: 'mortality',
          entity_id: currentFlock.id,
  ```
- **INSERT** [`src/components/eggs/LogCollectionModal.tsx:182`](src/components/eggs/LogCollectionModal.tsx#L182)
  ```ts
        await supabase.from('activity_logs').insert({
          user_id: user.id,
          action: `Logged egg collection`,
          entity_type: 'egg_collection',
          entity_id: flockId,
  ```
- **INSERT** [`src/components/eggs/LogSaleModal.tsx:231`](src/components/eggs/LogSaleModal.tsx#L231)
  ```ts
        await supabase.from('activity_logs').insert({
          user_id: user.id,
          action: buyerName
            ? `Logged egg sale to ${buyerName}: ${traysNum} trays`
            : `Logged egg sale: ${traysNum} trays`,
  ```

### `bird_sales` — 1 call(s)

- **INSERT** [`src/components/sales/RecordBirdSaleModal.tsx:173`](src/components/sales/RecordBirdSaleModal.tsx#L173)
  ```ts
          .from('bird_sales')
          .insert(saleData)
          .select()
          .single();
  ```

### `egg_collections` — 3 call(s)

- **INSERT** [`src/utils/eggIntervalTaskSync.ts:259`](src/utils/eggIntervalTaskSync.ts#L259)
  ```ts
      .from('egg_collections')
      .insert(insertPayload)
      .select('id')
      .single();
  ```
- **INSERT** [`src/components/dashboard/QuickEggCollectionWidget.tsx:251`](src/components/dashboard/QuickEggCollectionWidget.tsx#L251)
  ```ts
          .from('egg_collections')
          .insert(collectionPayload);
  ```
- **INSERT** [`src/components/dashboard/TodayTasksWidget.tsx:585`](src/components/dashboard/TodayTasksWidget.tsx#L585)
  ```ts
          .from('egg_collections')
          .insert(collectionPayload);
  ```

### `egg_inventory` — 1 call(s)

- **INSERT** [`src/components/dashboard/QuickEggCollectionWidget.tsx:299`](src/components/dashboard/QuickEggCollectionWidget.tsx#L299)
  ```ts
            .from('egg_inventory')
            .insert(inventoryCreatePayload);
  ```

### `egg_sales` — 2 call(s)

- **INSERT** [`src/utils/eggInventory.ts:116`](src/utils/eggInventory.ts#L116)
  ```ts
      .from('egg_sales')
      .insert({
        ...sale,
        revenue_id: revenueData.id,
      })
  ```
- **INSERT** [`src/components/ai/AIAssistantPage.tsx:421`](src/components/ai/AIAssistantPage.tsx#L421)
  ```ts
        const { data: saleData, error: saleInsertErr } = await supabase.from('egg_sales').insert(salePayload).select('id');
        if (saleInsertErr) throw new Error(`Egg sale save failed: ${saleInsertErr.message}`);
  ```

### `expenses` — 1 call(s)

- **INSERT** [`src/components/expenses/ExpenseTracking.tsx:435`](src/components/expenses/ExpenseTracking.tsx#L435)
  ```ts
        const { error: insertError } = await supabase.from('expenses').insert(expensePayload);
  
        if (insertError) {
          throw insertError;
  ```

### `flocks` — 1 call(s)

- **INSERT** [`src/components/flocks/CreateFlockModal.tsx:122`](src/components/flocks/CreateFlockModal.tsx#L122)
  ```ts
          .from('flocks')
          .insert(insertPayload)
          .select()
          .single();
  ```

### `import_items` — 1 call(s)

- **INSERT** [`src/components/import/CSVMappingFlow.tsx:232`](src/components/import/CSVMappingFlow.tsx#L232)
  ```ts
          .from('import_items')
          .insert(items);
  ```

### `inventory_usage` — 2 call(s)

- **INSERT** [`src/components/dashboard/InventoryUsageWidget.tsx:424`](src/components/dashboard/InventoryUsageWidget.tsx#L424)
  ```ts
          .from('inventory_usage')
          .insert(usagePayload);
  ```
- **INSERT** [`src/components/dashboard/TodayTasksWidget.tsx:528`](src/components/dashboard/TodayTasksWidget.tsx#L528)
  ```ts
          .from('inventory_usage')
          .insert(usagePayload);
  ```

### `invoice_items` — 2 call(s)

- **INSERT** [`src/components/sales/EditInvoiceModal.tsx:126`](src/components/sales/EditInvoiceModal.tsx#L126)
  ```ts
              .from('invoice_items')
              .insert({
                invoice_id: invoice.id,
                description: item.description,
                item_type: 'other' as const,
  ```
- **INSERT** [`src/components/sales/CreateInvoiceModal.tsx:93`](src/components/sales/CreateInvoiceModal.tsx#L93)
  ```ts
          .from('invoice_items')
          .insert(itemsData);
  ```

### `marketplace_suppliers` — 2 call(s)

- **INSERT** [`src/components/marketplace/MarketplacePage.tsx:102`](src/components/marketplace/MarketplacePage.tsx#L102)
  ```ts
        const { error } = await supabase.from('marketplace_suppliers').insert({
          user_id: user.id,
          name: supplierForm.businessName,
          business_name: supplierForm.businessName,
          email: supplierForm.email,
  ```
- **INSERT** [`src/components/superadmin/MarketplaceAdmin.tsx:78`](src/components/superadmin/MarketplaceAdmin.tsx#L78)
  ```ts
        const { error } = await supabase.from('marketplace_suppliers').insert({
          name: form.name.trim() || form.business_name.trim(),
          business_name: form.business_name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
  ```

### `mortality_logs` — 2 call(s)

- **INSERT** [`src/components/dashboard/TodayTasksWidget.tsx:471`](src/components/dashboard/TodayTasksWidget.tsx#L471)
  ```ts
          .from('mortality_logs')
          .insert(mortalityPayload);
  ```
- **INSERT** [`src/components/mortality/LogMortalityModal.tsx:101`](src/components/mortality/LogMortalityModal.tsx#L101)
  ```ts
        const { error: insertError } = await supabase.from('mortality_logs').insert(mortalityPayload);
  
        if (insertError) {
          // Check if it's a network error
          if (isNetworkError(insertError)) {
  ```

### `platform_announcements` — 1 call(s)

- **INSERT** [`src/components/superadmin/Announcements.tsx:56`](src/components/superadmin/Announcements.tsx#L56)
  ```ts
          .from('platform_announcements')
          .insert({
            title: announcement.title,
            message: announcement.message,
            target_audience: announcement.target_audience || 'all_owners',
  ```

### `platform_settings` — 1 call(s)

- **UPSERT** [`src/components/superadmin/PlatformSettings.tsx:86`](src/components/superadmin/PlatformSettings.tsx#L86)
  ```ts
          .from('platform_settings')
          .upsert({
            id: 'platform',
            ...settings,
            updated_at: new Date().toISOString(),
  ```

### `receipt_items` — 1 call(s)

- **INSERT** [`src/utils/receiptOperations.ts:57`](src/utils/receiptOperations.ts#L57)
  ```ts
          .from('receipt_items')
          .insert({
            receipt_id: receipt.id,
            product_type: item.productType,
            description: item.description,
  ```

### `shift_templates` — 1 call(s)

- **INSERT** [`src/components/shifts/CreateRecurringShiftModal.tsx:159`](src/components/shifts/CreateRecurringShiftModal.tsx#L159)
  ```ts
            .from('shift_templates')
            .insert(templateData)
            .select()
            .single();
  ```

### `task_templates` — 3 call(s)

- **INSERT** [`src/components/tasks/UnifiedTaskSettings.tsx:153`](src/components/tasks/UnifiedTaskSettings.tsx#L153)
  ```ts
        const { error } = await supabase.from('task_templates').insert(newTemplate);
        if (error) throw error;
  ```
- **INSERT** [`src/components/tasks/UnifiedTaskSettings.tsx:241`](src/components/tasks/UnifiedTaskSettings.tsx#L241)
  ```ts
          const { error } = await supabase.from('task_templates').insert(insertPayload as any);
          if (error) throw error;
  ```
- **INSERT** [`src/components/inventory/CreateDailyUsageTaskModal.tsx:73`](src/components/inventory/CreateDailyUsageTaskModal.tsx#L73)
  ```ts
        const { error: insertError } = await supabase.from('task_templates').insert(taskTemplatePayload);
  
        if (insertError) {
          console.error('CREATE_TASK_TEMPLATE_FAILED:', { error: insertError, payload: taskTemplatePayload });
  ```

### `tasks` — 1 call(s)

- **INSERT** [`src/utils/smartTasks.ts:196`](src/utils/smartTasks.ts#L196)
  ```ts
        .from('tasks')
        .insert(tasksToCreate)
        .select();
  ```

### `vet_logs` — 1 call(s)

- **INSERT** [`src/components/vet/VetLog.tsx:124`](src/components/vet/VetLog.tsx#L124)
  ```ts
          const { error } = await supabase.from('vet_logs').insert(payload);
          if (error) throw error;
  ```

## MEDIUM (id-scoped — add farm_id for defense-in-depth) — 69 call(s)

### `egg_collections` — 3 call(s)

- **UPDATE** [`src/utils/receiptOperations.ts:161`](src/utils/receiptOperations.ts#L161)
  ```ts
        .from('egg_collections')
        .update({
          trays: collection.trays - toDeduct,
        })
        .eq('id', collection.id);
  ```
- **DELETE** [`src/components/eggs/EditEggCollectionModal.tsx:151`](src/components/eggs/EditEggCollectionModal.tsx#L151)
  ```ts
        const { error } = await supabase.from('egg_collections').delete().eq('id', record.id);
        if (error) throw error;
  ```
- **UPDATE** [`src/components/eggs/EditEggCollectionModal.tsx:191`](src/components/eggs/EditEggCollectionModal.tsx#L191)
  ```ts
          .from('egg_collections')
          .update({
            flock_id: formData.flock_id || null,
            collection_date: formData.collection_date,
            collected_on: formData.collection_date,
  ```

### `egg_sales` — 2 call(s)

- **DELETE** [`src/components/eggs/EditEggSaleModal.tsx:141`](src/components/eggs/EditEggSaleModal.tsx#L141)
  ```ts
        const { error } = await supabase.from('egg_sales').delete().eq('id', record.id);
        if (error) throw error;
  ```
- **UPDATE** [`src/components/eggs/EditEggSaleModal.tsx:174`](src/components/eggs/EditEggSaleModal.tsx#L174)
  ```ts
          .from('egg_sales')
          .update({
            sold_on: formData.sale_date,
            sale_date: formData.sale_date,
            trays,
  ```

### `expenses` — 2 call(s)

- **UPDATE** [`src/components/expenses/EditExpenseModal.tsx:99`](src/components/expenses/EditExpenseModal.tsx#L99)
  ```ts
          .from('expenses')
          .update({
            category: normalizedCategory,
            amount: amountNum,
            description: description.trim(),
  ```
- **DELETE** [`src/components/expenses/ExpenseTracking.tsx:158`](src/components/expenses/ExpenseTracking.tsx#L158)
  ```ts
          .from('expenses')
          .delete()
          .eq('id', expense.id);
  ```

### `feed_inventory` — 3 call(s)

- **UPDATE** [`src/components/weight/EditFeedWaterModal.tsx:121`](src/components/weight/EditFeedWaterModal.tsx#L121)
  ```ts
          .from('feed_inventory')
          .update({ quantity: newQty, updated_at: new Date().toISOString() })
          .eq('id', fi.id);
  ```
- **UPDATE** [`src/components/dashboard/InventoryUsageWidget.tsx:448`](src/components/dashboard/InventoryUsageWidget.tsx#L448)
  ```ts
              .from('feed_inventory')
              .update(updatePayload)
              .eq('id', selectedItem.id);
  ```
- **UPDATE** [`src/components/inventory/InventoryPage.tsx:482`](src/components/inventory/InventoryPage.tsx#L482)
  ```ts
          .from('feed_inventory')
          .update({
            quantity: newStock,
            updated_at: new Date().toISOString(),
          })
  ```

### `feed_stock` — 2 call(s)

- **UPDATE** [`src/components/tasks/RecordFeedUsageModal.tsx:72`](src/components/tasks/RecordFeedUsageModal.tsx#L72)
  ```ts
          .from('feed_stock')
          .update({
            current_stock_bags: newStock,
            last_updated: new Date().toISOString(),
          })
  ```
- **UPDATE** [`src/components/ai/AIAssistantPage.tsx:537`](src/components/ai/AIAssistantPage.tsx#L537)
  ```ts
          await supabase.from('feed_stock').update({ current_stock_bags: Math.max(0, (stock[0].current_stock_bags || 0) - (logAction.bags_used || 0)) }).eq('id', stock[0].id);
        }
  
      } else if (logAction.type === 'COMPLETE_TASK') {
        const hint = logAction.task_title_hint || '';
  ```

### `flocks` — 6 call(s)

- **UPDATE** [`src/components/aquaculture/StockingEventsPage.tsx:176`](src/components/aquaculture/StockingEventsPage.tsx#L176)
  ```ts
        await supabase.from('flocks').update({ current_count: newCount }).eq('id', formFlockId);
      }
  
      setSubmitting(false);
  ```
- **UPDATE** [`src/components/flocks/FlockManagement.tsx:161`](src/components/flocks/FlockManagement.tsx#L161)
  ```ts
          .from('flocks')
          .update({
            status: 'active',
            archived_at: null,
            archived_reason: null,
  ```
- **DELETE** [`src/components/flocks/FlockManagement.tsx:185`](src/components/flocks/FlockManagement.tsx#L185)
  ```ts
          .from('flocks')
          .delete()
          .eq('id', flockId);
  ```
- **DELETE** [`src/components/flocks/ArchiveFlockModal.tsx:38`](src/components/flocks/ArchiveFlockModal.tsx#L38)
  ```ts
            .from('flocks')
            .delete()
            .eq('id', flock.id);
  ```
- **UPDATE** [`src/components/flocks/ArchiveFlockModal.tsx:62`](src/components/flocks/ArchiveFlockModal.tsx#L62)
  ```ts
          .from('flocks')
          .update(updateData)
          .eq('id', flock.id);
  ```
- **UPDATE** [`src/components/flocks/EditFlockModal.tsx:36`](src/components/flocks/EditFlockModal.tsx#L36)
  ```ts
          .from('flocks')
          .update({
            arrival_date: arrivalDate,
            initial_count: initialCount,
            purchase_price_per_bird: purchasePriceNum,
  ```

### `import_items` — 2 call(s)

- **UPDATE** [`src/components/import/ProposedImportReview.tsx:164`](src/components/import/ProposedImportReview.tsx#L164)
  ```ts
        .from('import_items')
        .update({ linked_flock_id: flockId })
        .eq('id', itemId);
  ```
- **UPDATE** [`src/components/import/ProposedImportReview.tsx:671`](src/components/import/ProposedImportReview.tsx#L671)
  ```ts
                .from('import_items')
                .update({
                  payload: updated.payload,
                  linked_flock_id: updated.linked_flock_id,
                  status: 'edited',
  ```

### `invoice_items` — 1 call(s)

- **UPDATE** [`src/components/sales/EditInvoiceModal.tsx:114`](src/components/sales/EditInvoiceModal.tsx#L114)
  ```ts
              .from('invoice_items')
              .update({
                description: item.description,
                quantity: item.quantity,
                unit_price: item.unit_price,
  ```

### `marketplace_suppliers` — 3 call(s)

- **UPDATE** [`src/components/superadmin/MarketplaceAdmin.tsx:107`](src/components/superadmin/MarketplaceAdmin.tsx#L107)
  ```ts
        .from('marketplace_suppliers')
        .update({ status: newStatus })
        .eq('id', supplierId);
  ```
- **UPDATE** [`src/components/superadmin/MarketplaceAdmin.tsx:117`](src/components/superadmin/MarketplaceAdmin.tsx#L117)
  ```ts
        .from('marketplace_suppliers')
        .update({ is_featured: !isFeatured })
        .eq('id', supplierId);
  ```
- **DELETE** [`src/components/superadmin/MarketplaceAdmin.tsx:126`](src/components/superadmin/MarketplaceAdmin.tsx#L126)
  ```ts
      const { error } = await supabase.from('marketplace_suppliers').delete().eq('id', id);
      if (error) { showToast('Failed to delete', 'error'); return; }
  ```

### `mortality_spike_alerts` — 1 call(s)

- **UPDATE** [`src/components/dashboard/DashboardHome.tsx:525`](src/components/dashboard/DashboardHome.tsx#L525)
  ```ts
      await supabase.from('mortality_spike_alerts').update({ acknowledged: true, acknowledged_at: new Date().toISOString() }).eq('id', id);
    };
  ```

### `notifications` — 3 call(s)

- **UPDATE** [`src/components/notifications/NotificationCenter.tsx:270`](src/components/notifications/NotificationCenter.tsx#L270)
  ```ts
      await supabase.from('notifications').update({ read: true, read_at: new Date().toISOString() }).eq('id', id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  ```
- **UPDATE** [`src/components/notifications/NotificationsPage.tsx:37`](src/components/notifications/NotificationsPage.tsx#L37)
  ```ts
      await supabase.from('notifications').update({ read: true }).eq('id', id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  ```
- **DELETE** [`src/components/notifications/NotificationsPage.tsx:49`](src/components/notifications/NotificationsPage.tsx#L49)
  ```ts
      await supabase.from('notifications').delete().eq('id', id);
      setNotifications(prev => prev.filter(n => n.id !== id));
  ```

### `other_inventory_items` — 4 call(s)

- **UPDATE** [`src/components/dashboard/InventoryUsageWidget.tsx:461`](src/components/dashboard/InventoryUsageWidget.tsx#L461)
  ```ts
              .from('other_inventory_items')
              .update(updatePayload)
              .eq('id', selectedItem.id);
  ```
- **DELETE** [`src/components/inventory/InventoryPage.tsx:543`](src/components/inventory/InventoryPage.tsx#L543)
  ```ts
              await supabase.from('other_inventory_items').delete().eq('id', row.id);
            }
          }
        };
  ```
- **UPDATE** [`src/components/inventory/InventoryPage.tsx:550`](src/components/inventory/InventoryPage.tsx#L550)
  ```ts
            .from('other_inventory_items')
            .update({
              name: nameTrimmed,
              quantity: qty,
              unit: otherUnit || 'units',
  ```
- **UPDATE** [`src/components/inventory/InventoryPage.tsx:577`](src/components/inventory/InventoryPage.tsx#L577)
  ```ts
            .from('other_inventory_items')
            .update({
              name: nameTrimmed,
              quantity: qty,
              unit: otherUnit || (existing as any).unit || 'units',
  ```

### `pay_stubs` — 1 call(s)

- **UPDATE** [`src/components/payroll/PayStubs.tsx:131`](src/components/payroll/PayStubs.tsx#L131)
  ```ts
          .from('pay_stubs')
          .update({ viewed_at: new Date().toISOString() })
          .eq('id', stub.id);
  ```

### `payroll_adjustments` — 1 call(s)

- **DELETE** [`src/components/payroll/PayrollAdjustments.tsx:205`](src/components/payroll/PayrollAdjustments.tsx#L205)
  ```ts
          .from('payroll_adjustments')
          .delete()
          .eq('id', id);
  ```

### `payroll_runs` — 1 call(s)

- **UPDATE** [`src/components/payroll/CreatePayrollRunModal.tsx:135`](src/components/payroll/CreatePayrollRunModal.tsx#L135)
  ```ts
          .from('payroll_runs')
          .update({ status: 'cancelled' })
          .eq('id', payrollRunId);
  ```

### `receipt_items` — 1 call(s)

- **UPDATE** [`src/utils/receiptOperations.ts:185`](src/utils/receiptOperations.ts#L185)
  ```ts
      .from('receipt_items')
      .update({ inventory_deducted: true })
      .eq('id', receiptItemId);
  ```

### `revenues` — 1 call(s)

- **UPDATE** [`src/components/eggs/EditEggSaleModal.tsx:230`](src/components/eggs/EditEggSaleModal.tsx#L230)
  ```ts
            .from('revenues')
            .update({
              amount: totalAmount,
              revenue_date: formData.sale_date,
              description: formData.customer_name
  ```

### `sales_invoices` — 3 call(s)

- **UPDATE** [`src/components/sales/InvoiceList.tsx:43`](src/components/sales/InvoiceList.tsx#L43)
  ```ts
          .from('sales_invoices')
          .update({
            status: 'paid',
            amount_paid: invoice.total,
            payment_date: new Date().toISOString().split('T')[0],
  ```
- **DELETE** [`src/components/sales/InvoiceList.tsx:65`](src/components/sales/InvoiceList.tsx#L65)
  ```ts
          .from('sales_invoices')
          .delete()
          .eq('id', invoice.id);
  ```
- **UPDATE** [`src/components/sales/EditInvoiceModal.tsx:84`](src/components/sales/EditInvoiceModal.tsx#L84)
  ```ts
          .from('sales_invoices')
          .update({
            customer_id: customerId || null,
            invoice_date: invoiceDate,
            due_date: dueDate || null,
  ```

### `shift_templates` — 3 call(s)

- **UPDATE** [`src/components/shifts/CreateRecurringShiftModal.tsx:152`](src/components/shifts/CreateRecurringShiftModal.tsx#L152)
  ```ts
            .from('shift_templates')
            .update(templateData)
            .eq('id', editingTemplate.id);
  ```
- **UPDATE** [`src/components/shifts/RecurringShiftsList.tsx:93`](src/components/shifts/RecurringShiftsList.tsx#L93)
  ```ts
          .from('shift_templates')
          .update({ is_active: !template.is_active })
          .eq('id', template.id);
  ```
- **DELETE** [`src/components/shifts/RecurringShiftsList.tsx:117`](src/components/shifts/RecurringShiftsList.tsx#L117)
  ```ts
          .from('shift_templates')
          .delete()
          .eq('id', template.id);
  ```

### `subscription_tiers` — 1 call(s)

- **UPDATE** [`src/components/superadmin/PricingManagement.tsx:58`](src/components/superadmin/PricingManagement.tsx#L58)
  ```ts
          .from('subscription_tiers')
          .update(updates)
          .eq('id', tierId);
  ```

### `task_templates` — 11 call(s)

- **UPDATE** [`src/components/settings/TaskTemplatesSettings.tsx:61`](src/components/settings/TaskTemplatesSettings.tsx#L61)
  ```ts
          .from('task_templates')
          .update({ is_enabled: !currentEnabled })
          .eq('id', templateId);
  ```
- **UPDATE** [`src/components/settings/TaskTemplatesSettings.tsx:76`](src/components/settings/TaskTemplatesSettings.tsx#L76)
  ```ts
          .from('task_templates')
          .update({ type_category: newCategory })
          .eq('id', templateId);
  ```
- **DELETE** [`src/components/settings/TaskTemplatesSettings.tsx:93`](src/components/settings/TaskTemplatesSettings.tsx#L93)
  ```ts
          .from('task_templates')
          .delete()
          .eq('id', templateId);
  ```
- **UPDATE** [`src/components/tasks/TaskTemplateSettings.tsx:59`](src/components/tasks/TaskTemplateSettings.tsx#L59)
  ```ts
          .from('task_templates')
          .update(updates)
          .eq('id', templateId);
  ```
- **UPDATE** [`src/components/tasks/UnifiedTaskSettings.tsx:102`](src/components/tasks/UnifiedTaskSettings.tsx#L102)
  ```ts
          .from('task_templates')
          .update({ is_active: nextEnabled, is_enabled: nextEnabled })
          .eq('id', template.id);
  ```
- **DELETE** [`src/components/tasks/UnifiedTaskSettings.tsx:122`](src/components/tasks/UnifiedTaskSettings.tsx#L122)
  ```ts
          .from('task_templates')
          .delete()
          .eq('id', templateId);
  ```
- **UPDATE** [`src/components/tasks/UnifiedTaskSettings.tsx:249`](src/components/tasks/UnifiedTaskSettings.tsx#L249)
  ```ts
            .from('task_templates')
            .update({
              title: template.title,
              description: template.description,
              category: template.category,
  ```
- **UPDATE** [`src/components/tasks/UnifiedTaskSettings.tsx:298`](src/components/tasks/UnifiedTaskSettings.tsx#L298)
  ```ts
          .from('task_templates')
          .update({
            title: template.title,
            description: template.description,
            category: template.category,
  ```
- **UPDATE** [`src/components/tasks/CompactTaskSettings.tsx:52`](src/components/tasks/CompactTaskSettings.tsx#L52)
  ```ts
        .from('task_templates')
        .update({ is_active: isActive })
        .eq('id', id);
  ```
- **DELETE** [`src/components/tasks/CompactTaskSettings.tsx:60`](src/components/tasks/CompactTaskSettings.tsx#L60)
  ```ts
      await supabase.from('task_templates').delete().eq('id', id);
      setTemplates(prev => prev.filter(t => t.id !== id));
  ```
- **UPDATE** [`src/components/tasks/CompactTaskSettings.tsx:240`](src/components/tasks/CompactTaskSettings.tsx#L240)
  ```ts
                  .from('task_templates')
                  .update(updated)
                  .eq('id', updated.id);
  ```

### `tasks` — 7 call(s)

- **UPDATE** [`src/utils/unifiedTaskSystem.ts:335`](src/utils/unifiedTaskSystem.ts#L335)
  ```ts
        .from('tasks')
        .update({
          status: 'completed',
          completed_at: now,
          completed_by: userId,
  ```
- **UPDATE** [`src/utils/unifiedTaskSystem.ts:379`](src/utils/unifiedTaskSystem.ts#L379)
  ```ts
        .from('tasks')
        .update({
          is_archived: true,
          archived_at: now,
          archived_by: userId,
  ```
- **UPDATE** [`src/components/tasks/egg/EggIntervalEntryModal.tsx:178`](src/components/tasks/egg/EggIntervalEntryModal.tsx#L178)
  ```ts
            .from('tasks')
            .update({
              status: 'completed',
              completed_at: completedAt,
              completed_by: completedBy,
  ```
- **UPDATE** [`src/components/dashboard/TodayTasksWidget.tsx:319`](src/components/dashboard/TodayTasksWidget.tsx#L319)
  ```ts
          .from('tasks')
          .update({
            status: newStatus,
            completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
            completed_by: newStatus === 'completed' && user ? user.id : null
  ```
- **UPDATE** [`src/components/dashboard/TodayTasksWidget.tsx:367`](src/components/dashboard/TodayTasksWidget.tsx#L367)
  ```ts
          .from('tasks')
          .update({
            scheduled_time: editTime,
            // scheduled_for is DATE in your schema
            scheduled_for: dueDate,
  ```
- **DELETE** [`src/components/dashboard/TodayTasksWidget.tsx:392`](src/components/dashboard/TodayTasksWidget.tsx#L392)
  ```ts
          .from('tasks')
          .delete()
          .eq('id', taskId);
  ```
- **UPDATE** [`src/components/worker/WorkerDashboard.tsx:170`](src/components/worker/WorkerDashboard.tsx#L170)
  ```ts
          .from('tasks')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            completed_by: user!.id,
  ```

### `team_contacts` — 2 call(s)

- **DELETE** [`src/components/settings/TeamContactsSettings.tsx:119`](src/components/settings/TeamContactsSettings.tsx#L119)
  ```ts
          .from('team_contacts')
          .delete()
          .eq('id', contactId);
  ```
- **UPDATE** [`src/components/settings/TeamContactsSettings.tsx:134`](src/components/settings/TeamContactsSettings.tsx#L134)
  ```ts
          .from('team_contacts')
          .update({ can_receive_reports: !currentValue })
          .eq('id', contactId);
  ```

### `vaccinations` — 1 call(s)

- **UPDATE** [`src/components/vaccinations/VaccinationSchedule.tsx:155`](src/components/vaccinations/VaccinationSchedule.tsx#L155)
  ```ts
        .from('vaccinations')
        .update({
          completed: !vaccination.completed,
          administered_date: !vaccination.completed ? dateToUse : null,
        })
  ```

### `vet_logs` — 2 call(s)

- **UPDATE** [`src/components/vet/VetLog.tsx:120`](src/components/vet/VetLog.tsx#L120)
  ```ts
          const { error } = await supabase.from('vet_logs').update(payload).eq('id', editingId);
          if (error) throw error;
  ```
- **DELETE** [`src/components/vet/VetLog.tsx:139`](src/components/vet/VetLog.tsx#L139)
  ```ts
      const { error } = await supabase.from('vet_logs').delete().eq('id', id);
      if (error) { toast.error('Failed to delete'); return; }
  ```

### `weight_logs` — 2 call(s)

- **DELETE** [`src/components/weight/WeightHistoryView.tsx:99`](src/components/weight/WeightHistoryView.tsx#L99)
  ```ts
          .from('weight_logs')
          .delete()
          .eq('id', logId);
  ```
- **UPDATE** [`src/components/weight/WeightHistoryView.tsx:128`](src/components/weight/WeightHistoryView.tsx#L128)
  ```ts
          .from('weight_logs')
          .update({ date: editDate })
          .eq('id', logId);
  ```

## LOW (review) — 11 call(s)

### `import_items` — 1 call(s)

- **UPDATE** [`src/components/import/ProposedImportReview.tsx:221`](src/components/import/ProposedImportReview.tsx#L221)
  ```ts
          .from('import_items')
          .update({ status: 'discarded' })
          .in('id', discardedIds);
  ```

### `invoice_items` — 1 call(s)

- **DELETE** [`src/components/sales/EditInvoiceModal.tsx:106`](src/components/sales/EditInvoiceModal.tsx#L106)
  ```ts
          .from('invoice_items')
          .delete()
          .eq('invoice_id', invoice.id)
          .not('id', 'in', `(${existingItemIds.join(',')})`);
  ```

### `notifications` — 2 call(s)

- **UPDATE** [`src/components/notifications/NotificationCenter.tsx:276`](src/components/notifications/NotificationCenter.tsx#L276)
  ```ts
      await supabase.from('notifications').update({ read: true, read_at: new Date().toISOString() }).eq('user_id', user?.id).eq('read', false);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  ```
- **UPDATE** [`src/components/notifications/NotificationsPage.tsx:44`](src/components/notifications/NotificationsPage.tsx#L44)
  ```ts
      await supabase.from('notifications').update({ read: true }).in('id', unread);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  ```

### `tasks` — 7 call(s)

- **DELETE** [`src/utils/unifiedTaskSystem.ts:170`](src/utils/unifiedTaskSystem.ts#L170)
  ```ts
      await supabaseClient.from('tasks').delete().in('id', chunk);
    }
  }
  
  export async function ensureTasksGeneratedForDate(
  ```
- **DELETE** [`src/utils/unifiedTaskSystem.ts:447`](src/utils/unifiedTaskSystem.ts#L447)
  ```ts
        await supabaseClient.from('tasks').delete().in('id', ids);
      }
    } catch {
      // Non-blocking — ignore errors
    }
  ```
- **UPDATE** [`src/components/tasks/BulkTaskOperations.tsx:23`](src/components/tasks/BulkTaskOperations.tsx#L23)
  ```ts
          .from('tasks')
          .update({
            completed: true,
            completed_at: new Date().toISOString(),
            status: 'completed',
  ```
- **DELETE** [`src/components/tasks/BulkTaskOperations.tsx:49`](src/components/tasks/BulkTaskOperations.tsx#L49)
  ```ts
          .from('tasks')
          .delete()
          .in('id', taskIds);
  ```
- **UPDATE** [`src/components/ai/AIAssistantPage.tsx:339`](src/components/ai/AIAssistantPage.tsx#L339)
  ```ts
            await supabase.from('tasks').update({ status: 'completed' }).in('id', mortTasks.map((t: any) => t.id));
          }
        } catch {}
  
      } else if (logAction.type === 'LOG_EGGS') {
  ```
- **UPDATE** [`src/components/ai/AIAssistantPage.tsx:378`](src/components/ai/AIAssistantPage.tsx#L378)
  ```ts
            await supabase.from('tasks').update({ status: 'completed' }).in('id', eggTasks.map((t: any) => t.id));
          }
        } catch {}
  
      } else if (logAction.type === 'LOG_EGG_SALE') {
  ```
- **UPDATE** [`src/components/ai/AIAssistantPage.tsx:546`](src/components/ai/AIAssistantPage.tsx#L546)
  ```ts
          await supabase.from('tasks').update({ status: 'completed' }).in('id', matchedTasks.map((t: any) => t.id));
        }
  
      } else if (logAction.type === 'CREATE_TASK') {
        if (!logAction.title) throw new Error('Task title is required');
  ```
