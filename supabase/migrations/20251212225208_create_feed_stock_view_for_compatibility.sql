/*
  # Create Feed Stock View for Backward Compatibility
  
  1. Changes
    - Create a `feed_stock` view that joins `feed_types` and `feed_inventory`
    - This provides backward compatibility for existing frontend code
  
  2. Purpose
    - Allow frontend code to continue using `feed_stock` references
    - Maps old schema to new `feed_types` + `feed_inventory` structure
*/

CREATE OR REPLACE VIEW feed_stock AS
SELECT 
  fi.id,
  fi.farm_id,
  ft.name AS feed_type,
  fi.quantity AS current_stock_bags,
  fi.quantity AS bags_in_stock,
  ft.unit,
  ft.kg_per_unit,
  ft.description,
  fi.updated_at AS last_updated
FROM feed_inventory fi
INNER JOIN feed_types ft ON fi.feed_type_id = ft.id;
