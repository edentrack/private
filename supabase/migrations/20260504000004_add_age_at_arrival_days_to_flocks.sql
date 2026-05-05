/*
  # Add age_at_arrival_days to flocks

  Lets farmers record the age animals already had when stocked/received.
  0 (default) = freshly hatched / day-old / day-of-stocking (existing behaviour).

  Examples:
    126  = 18-week-old point-of-lay pullets
     42  = 6-week-old catfish fingerlings
      0  = day-old chicks / freshly hatched fry (default)

  All age/week computations use getFlockAgeDays(flock) from
  src/utils/flockAge.ts, which adds this offset to (today - arrival_date).
*/

ALTER TABLE flocks
  ADD COLUMN IF NOT EXISTS age_at_arrival_days integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN flocks.age_at_arrival_days IS
  'Age of animals in days when first recorded. 0 = day-old/freshly stocked.';
