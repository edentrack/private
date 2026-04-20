/*
  # Super admins can read all tenant data (for support/impersonation)

  When a super admin uses "View As" to impersonate a user, the app loads data
  for the target farm (flocks, tasks, eggs, etc.). Those queries run with the
  super admin's auth.uid(), so RLS was blocking because get_user_farm_ids()
  only returns farms the super admin is a member of.

  This migration adds a SELECT-only policy on each tenant table so that
  is_requester_super_admin() can read any row. The super admin still cannot
  INSERT/UPDATE/DELETE as another farm (they use the app in read-only or
  support mode). This fixes the blank dashboard when "View As" is active.
*/

-- Ensure the helper exists (from create_super_admin_impersonation_system)
CREATE OR REPLACE FUNCTION public.is_requester_super_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND is_super_admin = true
  );
END;
$$;

-- farm_members: super admins can read any membership (needed to load target user's context)
DROP POLICY IF EXISTS "Super admins can read all farm_members" ON public.farm_members;
CREATE POLICY "Super admins can read all farm_members"
  ON public.farm_members FOR SELECT TO authenticated
  USING (public.is_requester_super_admin());

-- flocks
DROP POLICY IF EXISTS "Super admins can read all flocks" ON public.flocks;
CREATE POLICY "Super admins can read all flocks"
  ON public.flocks FOR SELECT TO authenticated
  USING (public.is_requester_super_admin());

-- expenses
DROP POLICY IF EXISTS "Super admins can read all expenses" ON public.expenses;
CREATE POLICY "Super admins can read all expenses"
  ON public.expenses FOR SELECT TO authenticated
  USING (public.is_requester_super_admin());

-- tasks
DROP POLICY IF EXISTS "Super admins can read all tasks" ON public.tasks;
CREATE POLICY "Super admins can read all tasks"
  ON public.tasks FOR SELECT TO authenticated
  USING (public.is_requester_super_admin());

-- task_templates
DROP POLICY IF EXISTS "Super admins can read all task_templates" ON public.task_templates;
CREATE POLICY "Super admins can read all task_templates"
  ON public.task_templates FOR SELECT TO authenticated
  USING (public.is_requester_super_admin());

-- egg_collections
DROP POLICY IF EXISTS "Super admins can read all egg_collections" ON public.egg_collections;
CREATE POLICY "Super admins can read all egg_collections"
  ON public.egg_collections FOR SELECT TO authenticated
  USING (public.is_requester_super_admin());

-- egg_sales
DROP POLICY IF EXISTS "Super admins can read all egg_sales" ON public.egg_sales;
CREATE POLICY "Super admins can read all egg_sales"
  ON public.egg_sales FOR SELECT TO authenticated
  USING (public.is_requester_super_admin());

-- feed_inventory
DROP POLICY IF EXISTS "Super admins can read all feed_inventory" ON public.feed_inventory;
CREATE POLICY "Super admins can read all feed_inventory"
  ON public.feed_inventory FOR SELECT TO authenticated
  USING (public.is_requester_super_admin());

-- feed_types (often joined with farm-scoped data)
DROP POLICY IF EXISTS "Super admins can read all feed_types" ON public.feed_types;
CREATE POLICY "Super admins can read all feed_types"
  ON public.feed_types FOR SELECT TO authenticated
  USING (public.is_requester_super_admin());

-- feed_usage_logs
DROP POLICY IF EXISTS "Super admins can read all feed_usage_logs" ON public.feed_usage_logs;
CREATE POLICY "Super admins can read all feed_usage_logs"
  ON public.feed_usage_logs FOR SELECT TO authenticated
  USING (public.is_requester_super_admin());

-- customers
DROP POLICY IF EXISTS "Super admins can read all customers" ON public.customers;
CREATE POLICY "Super admins can read all customers"
  ON public.customers FOR SELECT TO authenticated
  USING (public.is_requester_super_admin());

-- notifications
DROP POLICY IF EXISTS "Super admins can read all notifications" ON public.notifications;
CREATE POLICY "Super admins can read all notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (public.is_requester_super_admin());

-- mortality_logs
DROP POLICY IF EXISTS "Super admins can read all mortality_logs" ON public.mortality_logs;
CREATE POLICY "Super admins can read all mortality_logs"
  ON public.mortality_logs FOR SELECT TO authenticated
  USING (public.is_requester_super_admin());

-- activity_logs
DROP POLICY IF EXISTS "Super admins can read all activity_logs" ON public.activity_logs;
CREATE POLICY "Super admins can read all activity_logs"
  ON public.activity_logs FOR SELECT TO authenticated
  USING (public.is_requester_super_admin());

-- other_inventory_items
DROP POLICY IF EXISTS "Super admins can read all other_inventory_items" ON public.other_inventory_items;
CREATE POLICY "Super admins can read all other_inventory_items"
  ON public.other_inventory_items FOR SELECT TO authenticated
  USING (public.is_requester_super_admin());

-- other_inventory_movements
DROP POLICY IF EXISTS "Super admins can read all other_inventory_movements" ON public.other_inventory_movements;
CREATE POLICY "Super admins can read all other_inventory_movements"
  ON public.other_inventory_movements FOR SELECT TO authenticated
  USING (public.is_requester_super_admin());

-- team_activity_log
DROP POLICY IF EXISTS "Super admins can read all team_activity_log" ON public.team_activity_log;
CREATE POLICY "Super admins can read all team_activity_log"
  ON public.team_activity_log FOR SELECT TO authenticated
  USING (public.is_requester_super_admin());

-- team_invitations
DROP POLICY IF EXISTS "Super admins can read all team_invitations" ON public.team_invitations;
CREATE POLICY "Super admins can read all team_invitations"
  ON public.team_invitations FOR SELECT TO authenticated
  USING (public.is_requester_super_admin());

-- worker_shifts
DROP POLICY IF EXISTS "Super admins can read all worker_shifts" ON public.worker_shifts;
CREATE POLICY "Super admins can read all worker_shifts"
  ON public.worker_shifts FOR SELECT TO authenticated
  USING (public.is_requester_super_admin());

-- worker_pay_rates
DROP POLICY IF EXISTS "Super admins can read all worker_pay_rates" ON public.worker_pay_rates;
CREATE POLICY "Super admins can read all worker_pay_rates"
  ON public.worker_pay_rates FOR SELECT TO authenticated
  USING (public.is_requester_super_admin());

-- inventory_usage (dashboard daily usage)
DROP POLICY IF EXISTS "Super admins can read all inventory_usage" ON public.inventory_usage;
CREATE POLICY "Super admins can read all inventory_usage"
  ON public.inventory_usage FOR SELECT TO authenticated
  USING (public.is_requester_super_admin());

-- feed_givings
DROP POLICY IF EXISTS "Super admins can read all feed_givings" ON public.feed_givings;
CREATE POLICY "Super admins can read all feed_givings"
  ON public.feed_givings FOR SELECT TO authenticated
  USING (public.is_requester_super_admin());

-- weight_logs (or layer_weight_logs - add both if both exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'weight_logs') THEN
    DROP POLICY IF EXISTS "Super admins can read all weight_logs" ON public.weight_logs;
    EXECUTE 'CREATE POLICY "Super admins can read all weight_logs" ON public.weight_logs FOR SELECT TO authenticated USING (public.is_requester_super_admin())';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'layer_weight_logs') THEN
    DROP POLICY IF EXISTS "Super admins can read all layer_weight_logs" ON public.layer_weight_logs;
    EXECUTE 'CREATE POLICY "Super admins can read all layer_weight_logs" ON public.layer_weight_logs FOR SELECT TO authenticated USING (public.is_requester_super_admin())';
  END IF;
END $$;

-- revenues
DROP POLICY IF EXISTS "Super admins can read all revenues" ON public.revenues;
CREATE POLICY "Super admins can read all revenues"
  ON public.revenues FOR SELECT TO authenticated
  USING (public.is_requester_super_admin());

-- vaccinations
DROP POLICY IF EXISTS "Super admins can read all vaccinations" ON public.vaccinations;
CREATE POLICY "Super admins can read all vaccinations"
  ON public.vaccinations FOR SELECT TO authenticated
  USING (public.is_requester_super_admin());

-- egg_inventory
DROP POLICY IF EXISTS "Super admins can read all egg_inventory" ON public.egg_inventory;
CREATE POLICY "Super admins can read all egg_inventory"
  ON public.egg_inventory FOR SELECT TO authenticated
  USING (public.is_requester_super_admin());
