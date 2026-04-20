/*
  # Add set_farm_member_active RPC

  Team Management uses this to deactivate/reactivate members.
  If the RPC is missing (404), run this migration.
*/

CREATE OR REPLACE FUNCTION public.set_farm_member_active(
  p_farm_member_id uuid,
  p_is_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_farm_id uuid;
  v_user_id uuid;
BEGIN
  SELECT farm_id, user_id INTO v_farm_id, v_user_id
  FROM farm_members
  WHERE id = p_farm_member_id;

  IF v_farm_id IS NULL THEN
    RAISE EXCEPTION 'Farm member not found';
  END IF;

  IF v_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot change your own active status';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM farm_members
    WHERE farm_id = v_farm_id
      AND user_id = auth.uid()
      AND role = 'owner'
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Only farm owners can change member status';
  END IF;

  UPDATE farm_members
  SET is_active = p_is_active, updated_at = now()
  WHERE id = p_farm_member_id;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'team_activity_log') THEN
    INSERT INTO team_activity_log (farm_id, actor_user_id, target_user_id, event_type, details)
    VALUES (v_farm_id, auth.uid(), v_user_id, 'status_changed', jsonb_build_object('is_active', p_is_active));
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_farm_member_active(uuid, boolean) TO authenticated;
