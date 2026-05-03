-- Update free tier to allow 2 active flocks (was 1)
UPDATE subscription_tiers SET max_flocks = 2 WHERE name = 'free';
