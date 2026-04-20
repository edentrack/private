-- Track expenses paid out of profit cash/pool.
-- This adds:
-- 1) expenses.paid_from_profit (boolean)
-- 2) farms.profit_pool_opening_balance (numeric)

ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS paid_from_profit boolean NOT NULL DEFAULT false;

ALTER TABLE farms
ADD COLUMN IF NOT EXISTS profit_pool_opening_balance numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN expenses.paid_from_profit IS
'True when this expense is paid from the farm profit pool/cash balance.';

COMMENT ON COLUMN farms.profit_pool_opening_balance IS
'Starting balance for profit pool cash used to track remaining amount after profit-funded expenses.';
