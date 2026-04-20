-- Create Platform Announcements Table

CREATE TABLE IF NOT EXISTS platform_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  target_audience TEXT DEFAULT 'all_owners' CHECK (target_audience IN ('all_owners', 'pro_tier', 'enterprise_tier', 'free_tier', 'specific_farms')) NOT NULL,
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sent')) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE platform_announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage announcements"
  ON platform_announcements
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE POLICY "Users can view relevant announcements"
  ON platform_announcements
  FOR SELECT
  TO authenticated
  USING (
    status = 'sent' AND
    (
      target_audience = 'all_owners' OR
      (target_audience = 'pro_tier' AND EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.subscription_tier = 'pro'
      )) OR
      (target_audience = 'enterprise_tier' AND EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.subscription_tier = 'enterprise'
      )) OR
      (target_audience = 'free_tier' AND EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.subscription_tier = 'free'
      ))
    )
  );

CREATE INDEX IF NOT EXISTS idx_platform_announcements_status ON platform_announcements(status);
CREATE INDEX IF NOT EXISTS idx_platform_announcements_target ON platform_announcements(target_audience);
CREATE INDEX IF NOT EXISTS idx_platform_announcements_scheduled ON platform_announcements(scheduled_for) WHERE scheduled_for IS NOT NULL;












