-- =============================================================================
-- Force PostgREST schema cache reload.
-- The April 28 migrations altered egg_sales/egg_collections column constraints
-- inside DO $$ blocks. PostgREST was not notified, leaving its schema cache
-- stale and rejecting inserts for columns it no longer recognises.
-- =============================================================================

NOTIFY pgrst, 'reload schema';
