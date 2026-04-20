/*
  # Fix Farms RLS Policies - 403 Error Resolution

  1. Changes Made
    - Drop all existing farms RLS policies to start fresh
    - Create new streamlined policies without problematic status checks
    
  2. New Policies
    - Super admins can view all farms
    - Farm owners can view/insert/update/delete their own farms
    - Farm members can view farms they belong to (simplified, no status check)
    
  3. Security
    - RLS remains enabled on farms table
    - All policies properly check authentication
    - Clear separation between owner and member permissions
*/

-- Ensure RLS is enabled
ALTER TABLE public.farms ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DO $$
BEGIN
  DROP POLICY IF EXISTS "Super admins can view all farms" ON public.farms;
  DROP POLICY IF EXISTS "Farm owners can view their farms" ON public.farms;
  DROP POLICY IF EXISTS "Farm members can view their farms" ON public.farms;
  DROP POLICY IF EXISTS "Farm owners can update their farms" ON public.farms;
  DROP POLICY IF EXISTS "Farm owners can delete their farms" ON public.farms;
  DROP POLICY IF EXISTS "Farm owners can insert farms" ON public.farms;
END $$;

-- 1) Super admins can view ALL farms
CREATE POLICY "Super admins can view all farms"
ON public.farms FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.is_super_admin = true
  )
);

-- 2) Farm owners can view their farms
CREATE POLICY "Farm owners can view their farms"
ON public.farms FOR SELECT
TO authenticated
USING (owner_id = auth.uid());

-- 3) Farm members can view farms they belong to (NO status reference)
CREATE POLICY "Farm members can view their farms"
ON public.farms FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.farm_members fm
    WHERE fm.farm_id = farms.id
      AND fm.user_id = auth.uid()
  )
);

-- Owners can insert/update/delete their farms
CREATE POLICY "Farm owners can insert farms"
ON public.farms FOR INSERT
TO authenticated
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Farm owners can update their farms"
ON public.farms FOR UPDATE
TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Farm owners can delete their farms"
ON public.farms FOR DELETE
TO authenticated
USING (owner_id = auth.uid());
