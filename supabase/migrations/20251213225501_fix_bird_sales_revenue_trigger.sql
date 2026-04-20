/*
  # Fix Bird Sales Revenue Trigger

  1. Updates
    - Fix create_revenue_from_bird_sale() function to use correct column names
    - Change 'source' to 'source_type'
    - Change 'sale_date' to 'revenue_date'
    - Change 'notes' to 'description'

  2. Purpose
    - Align trigger with actual revenues table structure
    - Fix "column source does not exist" error
*/

CREATE OR REPLACE FUNCTION create_revenue_from_bird_sale()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO revenues (
      farm_id,
      flock_id,
      amount,
      source_type,
      revenue_date,
      description
    ) VALUES (
      NEW.farm_id,
      NEW.flock_id,
      NEW.amount_paid,
      'bird_sale',
      NEW.sale_date,
      'Bird sale: ' || NEW.birds_sold || ' birds'
    );

    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE revenues
    SET amount = NEW.amount_paid,
        revenue_date = NEW.sale_date,
        description = 'Bird sale: ' || NEW.birds_sold || ' birds',
        updated_at = now()
    WHERE farm_id = OLD.farm_id
      AND flock_id = OLD.flock_id
      AND source_type = 'bird_sale'
      AND revenue_date = OLD.sale_date;

    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM revenues
    WHERE farm_id = OLD.farm_id
      AND flock_id = OLD.flock_id
      AND source_type = 'bird_sale'
      AND revenue_date = OLD.sale_date;

    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;