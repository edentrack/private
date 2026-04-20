/*
  # Fix All Tenant Policies to Use Helper Functions

  1. Changes
    - Create a helper function to get user's farm IDs without RLS
    - Update all tenant-based policies to use the helper function
    - This prevents infinite recursion when policies query farm_members

  2. Tables Updated
    - flocks, expenses, tasks, task_templates
    - egg_collections, egg_sales
    - feed_inventory, feed_types, feed_usage_logs
    - customers, notifications
    - mortality_logs, activity_logs
    - other_inventory_items, other_inventory_movements
    - team_activity_log, team_invitations
    - worker_shifts, worker_pay_rates
*/

-- Create helper function to get user's farm IDs (bypasses RLS)
CREATE OR REPLACE FUNCTION get_user_farm_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT farm_id FROM farm_members
  WHERE user_id = auth.uid() AND is_active = true;
$$;

-- Fix flocks policy
DROP POLICY IF EXISTS "Tenant access by farm_id" ON flocks;
CREATE POLICY "Tenant access by farm_id"
  ON flocks FOR ALL TO authenticated
  USING (farm_id IN (SELECT get_user_farm_ids()))
  WITH CHECK (farm_id IN (SELECT get_user_farm_ids()));

-- Fix expenses policy
DROP POLICY IF EXISTS "Tenant access by farm_id" ON expenses;
CREATE POLICY "Tenant access by farm_id"
  ON expenses FOR ALL TO authenticated
  USING (farm_id IN (SELECT get_user_farm_ids()))
  WITH CHECK (farm_id IN (SELECT get_user_farm_ids()));

-- Fix tasks policy
DROP POLICY IF EXISTS "Tenant access by farm_id" ON tasks;
CREATE POLICY "Tenant access by farm_id"
  ON tasks FOR ALL TO authenticated
  USING (farm_id IN (SELECT get_user_farm_ids()))
  WITH CHECK (farm_id IN (SELECT get_user_farm_ids()));

-- Fix task_templates policy
DROP POLICY IF EXISTS "Tenant access by farm_id" ON task_templates;
CREATE POLICY "Tenant access by farm_id"
  ON task_templates FOR ALL TO authenticated
  USING (farm_id IN (SELECT get_user_farm_ids()))
  WITH CHECK (farm_id IN (SELECT get_user_farm_ids()));

-- Fix egg_collections policy
DROP POLICY IF EXISTS "Tenant access by farm_id" ON egg_collections;
CREATE POLICY "Tenant access by farm_id"
  ON egg_collections FOR ALL TO authenticated
  USING (farm_id IN (SELECT get_user_farm_ids()))
  WITH CHECK (farm_id IN (SELECT get_user_farm_ids()));

-- Fix egg_sales policy
DROP POLICY IF EXISTS "Tenant access by farm_id" ON egg_sales;
CREATE POLICY "Tenant access by farm_id"
  ON egg_sales FOR ALL TO authenticated
  USING (farm_id IN (SELECT get_user_farm_ids()))
  WITH CHECK (farm_id IN (SELECT get_user_farm_ids()));

-- Fix feed_inventory policy
DROP POLICY IF EXISTS "Tenant access by farm_id" ON feed_inventory;
CREATE POLICY "Tenant access by farm_id"
  ON feed_inventory FOR ALL TO authenticated
  USING (farm_id IN (SELECT get_user_farm_ids()))
  WITH CHECK (farm_id IN (SELECT get_user_farm_ids()));

-- Fix feed_types policy
DROP POLICY IF EXISTS "Tenant access by farm_id" ON feed_types;
CREATE POLICY "Tenant access by farm_id"
  ON feed_types FOR ALL TO authenticated
  USING (farm_id IN (SELECT get_user_farm_ids()))
  WITH CHECK (farm_id IN (SELECT get_user_farm_ids()));

-- Fix feed_usage_logs policy
DROP POLICY IF EXISTS "Tenant access by farm_id" ON feed_usage_logs;
CREATE POLICY "Tenant access by farm_id"
  ON feed_usage_logs FOR ALL TO authenticated
  USING (farm_id IN (SELECT get_user_farm_ids()))
  WITH CHECK (farm_id IN (SELECT get_user_farm_ids()));

-- Fix customers policy
DROP POLICY IF EXISTS "Tenant access by farm_id" ON customers;
CREATE POLICY "Tenant access by farm_id"
  ON customers FOR ALL TO authenticated
  USING (farm_id IN (SELECT get_user_farm_ids()))
  WITH CHECK (farm_id IN (SELECT get_user_farm_ids()));

-- Fix notifications policy
DROP POLICY IF EXISTS "Tenant access by farm_id" ON notifications;
CREATE POLICY "Tenant access by farm_id"
  ON notifications FOR ALL TO authenticated
  USING (farm_id IN (SELECT get_user_farm_ids()))
  WITH CHECK (farm_id IN (SELECT get_user_farm_ids()));

-- Fix mortality_logs policy
DROP POLICY IF EXISTS "Tenant access by farm_id" ON mortality_logs;
CREATE POLICY "Tenant access by farm_id"
  ON mortality_logs FOR ALL TO authenticated
  USING (farm_id IN (SELECT get_user_farm_ids()))
  WITH CHECK (farm_id IN (SELECT get_user_farm_ids()));

-- Fix activity_logs policy
DROP POLICY IF EXISTS "Tenant access by farm_id" ON activity_logs;
CREATE POLICY "Tenant access by farm_id"
  ON activity_logs FOR ALL TO authenticated
  USING (farm_id IN (SELECT get_user_farm_ids()))
  WITH CHECK (farm_id IN (SELECT get_user_farm_ids()));

-- Fix other_inventory_items policy
DROP POLICY IF EXISTS "Tenant access by farm_id" ON other_inventory_items;
CREATE POLICY "Tenant access by farm_id"
  ON other_inventory_items FOR ALL TO authenticated
  USING (farm_id IN (SELECT get_user_farm_ids()))
  WITH CHECK (farm_id IN (SELECT get_user_farm_ids()));

-- Fix other_inventory_movements policy
DROP POLICY IF EXISTS "Tenant access by farm_id" ON other_inventory_movements;
CREATE POLICY "Tenant access by farm_id"
  ON other_inventory_movements FOR ALL TO authenticated
  USING (farm_id IN (SELECT get_user_farm_ids()))
  WITH CHECK (farm_id IN (SELECT get_user_farm_ids()));

-- Fix team_activity_log policies
DROP POLICY IF EXISTS "Farm members can view activity log" ON team_activity_log;
DROP POLICY IF EXISTS "Farm members can insert activity log" ON team_activity_log;
CREATE POLICY "Farm members can view activity log"
  ON team_activity_log FOR SELECT TO authenticated
  USING (farm_id IN (SELECT get_user_farm_ids()));
CREATE POLICY "Farm members can insert activity log"
  ON team_activity_log FOR INSERT TO authenticated
  WITH CHECK (farm_id IN (SELECT get_user_farm_ids()));

-- Fix team_invitations policies
DROP POLICY IF EXISTS "Farm members can view invitations" ON team_invitations;
DROP POLICY IF EXISTS "Farm owners can insert invitations" ON team_invitations;
CREATE POLICY "Farm members can view invitations"
  ON team_invitations FOR SELECT TO authenticated
  USING (farm_id IN (SELECT get_user_farm_ids()));
CREATE POLICY "Farm admins can insert invitations"
  ON team_invitations FOR INSERT TO authenticated
  WITH CHECK (user_is_farm_admin(farm_id));

-- Fix worker_shifts policies
DROP POLICY IF EXISTS "Farm members can view shifts" ON worker_shifts;
DROP POLICY IF EXISTS "Farm owners can manage shifts" ON worker_shifts;
CREATE POLICY "Farm members can view shifts"
  ON worker_shifts FOR SELECT TO authenticated
  USING (farm_id IN (SELECT get_user_farm_ids()));
CREATE POLICY "Farm admins can manage shifts"
  ON worker_shifts FOR ALL TO authenticated
  USING (user_is_farm_admin(farm_id))
  WITH CHECK (user_is_farm_admin(farm_id));

-- Fix worker_pay_rates policies
DROP POLICY IF EXISTS "Farm members can view pay rates" ON worker_pay_rates;
DROP POLICY IF EXISTS "Farm owners can manage pay rates" ON worker_pay_rates;
CREATE POLICY "Farm members can view pay rates"
  ON worker_pay_rates FOR SELECT TO authenticated
  USING (farm_id IN (SELECT get_user_farm_ids()));
CREATE POLICY "Farm admins can manage pay rates"
  ON worker_pay_rates FOR ALL TO authenticated
  USING (user_is_farm_admin(farm_id))
  WITH CHECK (user_is_farm_admin(farm_id));