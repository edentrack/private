/*
  # Add 'viewer' role to membership_role enum

  1. Changes
    - Adds 'viewer' as a new value to the membership_role enum type
    - This role allows read-only access to most modules

  2. Security
    - No changes to RLS policies needed - existing policies work with the new role
*/

ALTER TYPE membership_role ADD VALUE IF NOT EXISTS 'viewer';
