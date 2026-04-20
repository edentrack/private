/*
  # Create Platform Settings Table

  ## Overview
  Stores global platform settings including maintenance mode, feature flags, and app version management.

  ## Tables
    - `platform_settings` - Single row table for platform-wide settings

  ## Security
    - RLS enabled
    - Only super admins can read/write
*/

-- Create platform_settings table
CREATE TABLE IF NOT EXISTS platform_settings (
  id TEXT PRIMARY KEY DEFAULT 'platform',
  maintenance_mode BOOLEAN DEFAULT false NOT NULL,
  maintenance_message TEXT DEFAULT 'The platform is currently under maintenance. Please check back soon.',
  app_version TEXT DEFAULT '1.0.0' NOT NULL,
  min_app_version TEXT DEFAULT '1.0.0' NOT NULL,
  feature_flags JSONB DEFAULT '{
    "ai_assistant": true,
    "smart_upload": true,
    "marketplace": true,
    "voice_commands": true,
    "weather_integration": true,
    "predictive_analytics": true
  }'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Only super admins can read platform settings
CREATE POLICY "Super admins can view platform settings"
  ON platform_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Policy: Only super admins can update platform settings
CREATE POLICY "Super admins can update platform settings"
  ON platform_settings
  FOR UPDATE
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

-- Policy: Only super admins can insert platform settings
CREATE POLICY "Super admins can insert platform settings"
  ON platform_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_platform_settings_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_platform_settings_updated
  BEFORE UPDATE ON platform_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_platform_settings_timestamp();

-- Insert default settings
INSERT INTO platform_settings (id)
VALUES ('platform')
ON CONFLICT (id) DO NOTHING;












