/*
  # Add Growth Targets to Farms
  
  1. Changes
    - Add `broiler_growth_targets` JSONB column for week-by-week weight targets
    - Add `layer_growth_targets` JSONB column for layer growth targets
    - Add `market_ready_min_age` for minimum market age in weeks
    - Add `market_ready_min_weight` for minimum market weight
    - Add `market_ready_optimal_weight` for optimal market weight
    
  2. Purpose
    - Allow farms to customize growth targets based on breed, climate, and feed quality
    - Used in weight analysis and market readiness calculations
    - Defaults are based on Cobb 500 breed standards for broilers
*/

-- Add growth target columns to farms table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'farms' AND column_name = 'broiler_growth_targets'
  ) THEN
    ALTER TABLE farms ADD COLUMN broiler_growth_targets JSONB DEFAULT '{
      "1": {"weight": 0.15, "description": "Chick starter phase"},
      "2": {"weight": 0.35, "description": "Early growth"},
      "3": {"weight": 0.60, "description": "Rapid growth begins"},
      "4": {"weight": 1.00, "description": "Switch to grower feed"},
      "5": {"weight": 1.50, "description": "Pre-market growth"},
      "6": {"weight": 2.00, "description": "Near market weight"},
      "7": {"weight": 2.50, "description": "Market ready - optimal"},
      "8": {"weight": 2.80, "description": "Market ready - maximum"}
    }';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'farms' AND column_name = 'layer_growth_targets'
  ) THEN
    ALTER TABLE farms ADD COLUMN layer_growth_targets JSONB DEFAULT '{
      "1": {"weight": 0.15, "description": "Chick starter phase"},
      "2": {"weight": 0.35, "description": "Early growth"},
      "4": {"weight": 0.50, "description": "Grower phase begins"},
      "8": {"weight": 0.90, "description": "Mid grower phase"},
      "12": {"weight": 1.20, "description": "Late grower phase"},
      "16": {"weight": 1.45, "description": "Pre-layer phase"},
      "18": {"weight": 1.55, "description": "Point of lay"},
      "20": {"weight": 1.60, "description": "Peak production"}
    }';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'farms' AND column_name = 'market_ready_min_age'
  ) THEN
    ALTER TABLE farms ADD COLUMN market_ready_min_age INTEGER DEFAULT 6;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'farms' AND column_name = 'market_ready_min_weight'
  ) THEN
    ALTER TABLE farms ADD COLUMN market_ready_min_weight NUMERIC(10,2) DEFAULT 2.0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'farms' AND column_name = 'market_ready_optimal_weight'
  ) THEN
    ALTER TABLE farms ADD COLUMN market_ready_optimal_weight NUMERIC(10,2) DEFAULT 2.5;
  END IF;
END $$;