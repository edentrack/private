-- Re-apply broadcasts table creation (original migration was tracked but SQL never ran)
CREATE TABLE IF NOT EXISTS broadcasts (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message     TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'critical')),
  target      TEXT NOT NULL DEFAULT 'all' CHECK (target IN ('all', 'free', 'paid')),
  active      BOOLEAN NOT NULL DEFAULT true,
  dismissable BOOLEAN NOT NULL DEFAULT true,
  expires_at  TIMESTAMPTZ,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS broadcast_dismissals (
  broadcast_id UUID REFERENCES broadcasts(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  dismissed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (broadcast_id, user_id)
);

ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_dismissals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'broadcasts' AND policyname = 'broadcasts_read') THEN
    CREATE POLICY "broadcasts_read" ON broadcasts
      FOR SELECT USING (active = true AND (expires_at IS NULL OR expires_at > NOW()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'broadcasts' AND policyname = 'broadcasts_superadmin_write') THEN
    CREATE POLICY "broadcasts_superadmin_write" ON broadcasts
      FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'broadcast_dismissals' AND policyname = 'dismissals_own_read') THEN
    CREATE POLICY "dismissals_own_read" ON broadcast_dismissals
      FOR SELECT USING (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'broadcast_dismissals' AND policyname = 'dismissals_own_insert') THEN
    CREATE POLICY "dismissals_own_insert" ON broadcast_dismissals
      FOR INSERT WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
