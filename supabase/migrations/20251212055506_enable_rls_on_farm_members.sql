/*
  # Enable RLS on Farm Members Table

  1. Changes
    - Enable Row Level Security on farm_members table

  Note: RLS was disabled on this table, which prevented the policies from working
*/

ALTER TABLE farm_members ENABLE ROW LEVEL SECURITY;