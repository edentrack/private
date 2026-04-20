/*
  # Create Bird Sales Flock Count Trigger

  1. Purpose
    - Automatically update flock current_count when bird sales are recorded
    - Ensure data consistency between bird_sales and flocks tables
    - Prevent overselling (cannot sell more birds than available)

  2. Trigger Logic
    - On INSERT: Subtract birds_sold from flock's current_count
    - On UPDATE: Adjust difference if birds_sold changes
    - On DELETE: Add back the birds_sold to flock's current_count

  3. Validation
    - Check that birds_sold doesn't exceed current_count
    - Raise exception if validation fails
*/

CREATE OR REPLACE FUNCTION update_flock_count_on_sale()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (SELECT current_count FROM flocks WHERE id = NEW.flock_id) < NEW.birds_sold THEN
      RAISE EXCEPTION 'Cannot sell more birds than available in flock';
    END IF;
    
    UPDATE flocks 
    SET current_count = current_count - NEW.birds_sold,
        updated_at = now()
    WHERE id = NEW.flock_id;
    
    RETURN NEW;
    
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.flock_id = OLD.flock_id THEN
      UPDATE flocks 
      SET current_count = current_count + OLD.birds_sold - NEW.birds_sold,
          updated_at = now()
      WHERE id = NEW.flock_id;
    ELSE
      UPDATE flocks 
      SET current_count = current_count + OLD.birds_sold,
          updated_at = now()
      WHERE id = OLD.flock_id;
      
      IF (SELECT current_count FROM flocks WHERE id = NEW.flock_id) < NEW.birds_sold THEN
        RAISE EXCEPTION 'Cannot sell more birds than available in flock';
      END IF;
      
      UPDATE flocks 
      SET current_count = current_count - NEW.birds_sold,
          updated_at = now()
      WHERE id = NEW.flock_id;
    END IF;
    
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE flocks 
    SET current_count = current_count + OLD.birds_sold,
        updated_at = now()
    WHERE id = OLD.flock_id;
    
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_flock_count_on_sale ON bird_sales;

CREATE TRIGGER trigger_update_flock_count_on_sale
  AFTER INSERT OR UPDATE OR DELETE ON bird_sales
  FOR EACH ROW
  EXECUTE FUNCTION update_flock_count_on_sale();

CREATE OR REPLACE FUNCTION create_revenue_from_bird_sale()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO revenues (
      farm_id,
      flock_id,
      amount,
      source,
      sale_date,
      notes
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
        sale_date = NEW.sale_date,
        notes = 'Bird sale: ' || NEW.birds_sold || ' birds',
        updated_at = now()
    WHERE farm_id = OLD.farm_id 
      AND flock_id = OLD.flock_id 
      AND source = 'bird_sale'
      AND sale_date = OLD.sale_date;
    
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM revenues 
    WHERE farm_id = OLD.farm_id 
      AND flock_id = OLD.flock_id 
      AND source = 'bird_sale'
      AND sale_date = OLD.sale_date;
    
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_create_revenue_from_bird_sale ON bird_sales;

CREATE TRIGGER trigger_create_revenue_from_bird_sale
  AFTER INSERT OR UPDATE OR DELETE ON bird_sales
  FOR EACH ROW
  EXECUTE FUNCTION create_revenue_from_bird_sale();
