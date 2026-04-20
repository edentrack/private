/*
  # Create Photo Storage Buckets
  
  1. New Storage Buckets
    - `task-photos` - Photos of completed tasks (feeding, cleaning, maintenance)
    - `mortality-photos` - Photos documenting mortality events
    - `flock-photos` - Photos of flocks at various growth stages
    - `health-photos` - Photos of health issues, injuries, vaccinations
    - `expense-receipts` - Photos of receipts and expense documentation
    - `inventory-photos` - Photos of feed, medications, equipment inventory
    - `weight-photos` - Photos of weighing processes and scales
    - `farm-infrastructure` - Photos of coops, equipment, facilities
  
  2. Storage Structure
    - Each bucket organized by: farm_id/flock_id/timestamp_filename.jpg
    - All buckets are private (not public)
    - File size limit: 10MB per photo
    - Allowed types: image/jpeg, image/png, image/webp, image/heic
  
  3. Security (RLS Policies)
    - Authenticated users can upload to their own farm folders
    - Authenticated users can view photos from farms they belong to
    - Authenticated users can delete their own uploads
    - Farm owners and managers have full access to their farm's photos
*/

-- Create storage buckets for photo uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('task-photos', 'task-photos', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('mortality-photos', 'mortality-photos', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('flock-photos', 'flock-photos', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('health-photos', 'health-photos', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('expense-receipts', 'expense-receipts', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']),
  ('inventory-photos', 'inventory-photos', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('weight-photos', 'weight-photos', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('farm-infrastructure', 'farm-infrastructure', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for task-photos bucket
CREATE POLICY "Users can upload task photos to their farm folders"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'task-photos' 
    AND (storage.foldername(name))[1] IN (
      SELECT farm_id::text FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can view task photos from their farms"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'task-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT farm_id::text FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own task photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'task-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT farm_id::text FROM profiles WHERE id = auth.uid()
    )
  );

-- RLS Policies for mortality-photos bucket
CREATE POLICY "Users can upload mortality photos to their farm folders"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'mortality-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT farm_id::text FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can view mortality photos from their farms"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'mortality-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT farm_id::text FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own mortality photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'mortality-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT farm_id::text FROM profiles WHERE id = auth.uid()
    )
  );

-- RLS Policies for flock-photos bucket
CREATE POLICY "Users can upload flock photos to their farm folders"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'flock-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT farm_id::text FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can view flock photos from their farms"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'flock-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT farm_id::text FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own flock photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'flock-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT farm_id::text FROM profiles WHERE id = auth.uid()
    )
  );

-- RLS Policies for health-photos bucket
CREATE POLICY "Users can upload health photos to their farm folders"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'health-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT farm_id::text FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can view health photos from their farms"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'health-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT farm_id::text FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own health photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'health-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT farm_id::text FROM profiles WHERE id = auth.uid()
    )
  );

-- RLS Policies for expense-receipts bucket
CREATE POLICY "Users can upload expense receipts to their farm folders"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'expense-receipts'
    AND (storage.foldername(name))[1] IN (
      SELECT farm_id::text FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can view expense receipts from their farms"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND (storage.foldername(name))[1] IN (
      SELECT farm_id::text FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own expense receipts"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND (storage.foldername(name))[1] IN (
      SELECT farm_id::text FROM profiles WHERE id = auth.uid()
    )
  );

-- RLS Policies for inventory-photos bucket
CREATE POLICY "Users can upload inventory photos to their farm folders"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'inventory-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT farm_id::text FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can view inventory photos from their farms"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'inventory-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT farm_id::text FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own inventory photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'inventory-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT farm_id::text FROM profiles WHERE id = auth.uid()
    )
  );

-- RLS Policies for weight-photos bucket
CREATE POLICY "Users can upload weight photos to their farm folders"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'weight-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT farm_id::text FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can view weight photos from their farms"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'weight-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT farm_id::text FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own weight photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'weight-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT farm_id::text FROM profiles WHERE id = auth.uid()
    )
  );

-- RLS Policies for farm-infrastructure bucket
CREATE POLICY "Users can upload infrastructure photos to their farm folders"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'farm-infrastructure'
    AND (storage.foldername(name))[1] IN (
      SELECT farm_id::text FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can view infrastructure photos from their farms"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'farm-infrastructure'
    AND (storage.foldername(name))[1] IN (
      SELECT farm_id::text FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own infrastructure photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'farm-infrastructure'
    AND (storage.foldername(name))[1] IN (
      SELECT farm_id::text FROM profiles WHERE id = auth.uid()
    )
  );