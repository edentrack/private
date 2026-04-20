/*
  # Backfill Chick Purchase and Transport Expenses

  1. Purpose
    - Create missing expense records for flocks that have purchase data
    - Only processes flocks where purchase_price_per_bird or purchase_transport_cost is set
    - Skips flocks that already have expenses with matching kind values
    - Maintains multi-tenant boundaries with proper farm_id filtering

  2. Process
    - Iterates through all flocks with purchase data
    - Calculates total purchase cost: initial_count * purchase_price_per_bird
    - Creates "Chicks Purchase" expense if missing
    - Creates "Chicks Transport" expense if transport cost exists and missing

  3. Safety
    - Uses INSERT only where expenses don't exist
    - Respects existing expenses with kind='chicks_purchase' or 'chicks_transport'
    - No data deletion or updates to existing records
*/

DO $$
DECLARE
  flock_record RECORD;
  existing_purchase_expense_id uuid;
  existing_transport_expense_id uuid;
  total_purchase_cost numeric;
BEGIN
  FOR flock_record IN 
    SELECT 
      f.id as flock_id,
      f.user_id,
      f.farm_id,
      f.name,
      f.type,
      f.arrival_date,
      f.initial_count,
      f.purchase_price_per_bird,
      f.purchase_transport_cost,
      p.currency_preference
    FROM flocks f
    JOIN profiles p ON p.farm_id = f.farm_id
    WHERE (f.purchase_price_per_bird IS NOT NULL AND f.purchase_price_per_bird > 0)
       OR (f.purchase_transport_cost IS NOT NULL AND f.purchase_transport_cost > 0)
  LOOP
    IF flock_record.purchase_price_per_bird > 0 AND flock_record.initial_count > 0 THEN
      SELECT id INTO existing_purchase_expense_id
      FROM expenses
      WHERE flock_id = flock_record.flock_id
        AND kind = 'chicks_purchase'
      LIMIT 1;

      IF existing_purchase_expense_id IS NULL THEN
        total_purchase_cost := flock_record.purchase_price_per_bird * flock_record.initial_count;

        INSERT INTO expenses (
          user_id,
          farm_id,
          flock_id,
          kind,
          category,
          amount,
          currency,
          description,
          date,
          created_at
        ) VALUES (
          flock_record.user_id,
          flock_record.farm_id,
          flock_record.flock_id,
          'chicks_purchase',
          'Chicks Purchase',
          total_purchase_cost,
          flock_record.currency_preference,
          'Purchase of ' || flock_record.initial_count || ' ' || flock_record.type || ' chicks at ' || flock_record.purchase_price_per_bird || ' per bird',
          flock_record.arrival_date,
          NOW()
        );

        RAISE NOTICE 'Created purchase expense for flock % (% birds at % each = %)', 
          flock_record.name, 
          flock_record.initial_count, 
          flock_record.purchase_price_per_bird, 
          total_purchase_cost;
      END IF;
    END IF;

    IF flock_record.purchase_transport_cost > 0 THEN
      SELECT id INTO existing_transport_expense_id
      FROM expenses
      WHERE flock_id = flock_record.flock_id
        AND kind = 'chicks_transport'
      LIMIT 1;

      IF existing_transport_expense_id IS NULL THEN
        INSERT INTO expenses (
          user_id,
          farm_id,
          flock_id,
          kind,
          category,
          amount,
          currency,
          description,
          date,
          created_at
        ) VALUES (
          flock_record.user_id,
          flock_record.farm_id,
          flock_record.flock_id,
          'chicks_transport',
          'Chicks Transport',
          flock_record.purchase_transport_cost,
          flock_record.currency_preference,
          'Transport cost for ' || flock_record.initial_count || ' ' || flock_record.type || ' chicks',
          flock_record.arrival_date,
          NOW()
        );

        RAISE NOTICE 'Created transport expense for flock % (%)', 
          flock_record.name, 
          flock_record.purchase_transport_cost;
      END IF;
    END IF;
  END LOOP;

  RAISE NOTICE 'Backfill complete';
END $$;
