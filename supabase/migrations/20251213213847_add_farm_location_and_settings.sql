/*
  # Add Farm Location and Enhanced Settings

  1. Changes to farms table
    - Add location fields (address, city, region, country, coordinates)
    - Add operations settings (broilers_enabled, layers_enabled)
    - Add broiler and layer configuration settings
    - Add regional preferences

  2. Changes to profiles table
    - Add onboarding_completed flag
    - Add preferred_language

  3. Purpose
    - Enable farm location tracking for delivery estimates
    - Support multilingual interface
    - Configure farm-specific settings for broiler/layer operations
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farms' AND column_name = 'address_line1') THEN
    ALTER TABLE farms ADD COLUMN address_line1 VARCHAR(255);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farms' AND column_name = 'address_line2') THEN
    ALTER TABLE farms ADD COLUMN address_line2 VARCHAR(255);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farms' AND column_name = 'city') THEN
    ALTER TABLE farms ADD COLUMN city VARCHAR(100);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farms' AND column_name = 'region_state') THEN
    ALTER TABLE farms ADD COLUMN region_state VARCHAR(100);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farms' AND column_name = 'country') THEN
    ALTER TABLE farms ADD COLUMN country VARCHAR(100);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farms' AND column_name = 'postal_code') THEN
    ALTER TABLE farms ADD COLUMN postal_code VARCHAR(20);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farms' AND column_name = 'latitude') THEN
    ALTER TABLE farms ADD COLUMN latitude DECIMAL(10,8);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farms' AND column_name = 'longitude') THEN
    ALTER TABLE farms ADD COLUMN longitude DECIMAL(11,8);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farms' AND column_name = 'location_notes') THEN
    ALTER TABLE farms ADD COLUMN location_notes TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farms' AND column_name = 'location_sharing_consent') THEN
    ALTER TABLE farms ADD COLUMN location_sharing_consent BOOLEAN DEFAULT FALSE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farms' AND column_name = 'weight_unit') THEN
    ALTER TABLE farms ADD COLUMN weight_unit VARCHAR(5) DEFAULT 'kg';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farms' AND column_name = 'date_format') THEN
    ALTER TABLE farms ADD COLUMN date_format VARCHAR(20) DEFAULT 'DD/MM/YYYY';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farms' AND column_name = 'time_format') THEN
    ALTER TABLE farms ADD COLUMN time_format VARCHAR(10) DEFAULT '24h';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farms' AND column_name = 'broilers_enabled') THEN
    ALTER TABLE farms ADD COLUMN broilers_enabled BOOLEAN DEFAULT TRUE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farms' AND column_name = 'layers_enabled') THEN
    ALTER TABLE farms ADD COLUMN layers_enabled BOOLEAN DEFAULT TRUE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farms' AND column_name = 'broiler_selling_method') THEN
    ALTER TABLE farms ADD COLUMN broiler_selling_method VARCHAR(20) DEFAULT 'per_bird';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farms' AND column_name = 'broiler_price_per_bird') THEN
    ALTER TABLE farms ADD COLUMN broiler_price_per_bird DECIMAL(10,2) DEFAULT 2500;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farms' AND column_name = 'broiler_price_per_kg') THEN
    ALTER TABLE farms ADD COLUMN broiler_price_per_kg DECIMAL(10,2) DEFAULT 3000;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farms' AND column_name = 'broiler_target_weight') THEN
    ALTER TABLE farms ADD COLUMN broiler_target_weight DECIMAL(5,2) DEFAULT 2.5;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farms' AND column_name = 'broiler_target_age_weeks') THEN
    ALTER TABLE farms ADD COLUMN broiler_target_age_weeks INTEGER DEFAULT 6;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farms' AND column_name = 'layer_egg_pricing') THEN
    ALTER TABLE farms ADD COLUMN layer_egg_pricing VARCHAR(20) DEFAULT 'per_egg';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farms' AND column_name = 'layer_price_per_egg') THEN
    ALTER TABLE farms ADD COLUMN layer_price_per_egg DECIMAL(10,2) DEFAULT 125;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farms' AND column_name = 'layer_expected_laying_start') THEN
    ALTER TABLE farms ADD COLUMN layer_expected_laying_start INTEGER DEFAULT 18;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farms' AND column_name = 'layer_peak_production_target') THEN
    ALTER TABLE farms ADD COLUMN layer_peak_production_target INTEGER DEFAULT 90;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'onboarding_completed') THEN
    ALTER TABLE profiles ADD COLUMN onboarding_completed BOOLEAN DEFAULT FALSE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'preferred_language') THEN
    ALTER TABLE profiles ADD COLUMN preferred_language VARCHAR(5) DEFAULT 'en';
  END IF;
END $$;
