/*
  # Revert: Workers must NOT read farm_permissions

  Only owners and managers should read farm_permissions.
  Workers see where to input data via role-based nav (dashboard, my-work, tasks, shifts, etc.);
  that does not require reading farm_permissions.
*/
DROP POLICY IF EXISTS "Farm members can view their farm permissions" ON public.farm_permissions;
