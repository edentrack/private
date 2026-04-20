/*
  # Create Storage Bucket for Imports

  1. Storage
    - Creates 'imports' bucket for storing uploaded files
    - Files stored at: farm/{farm_id}/imports/{import_id}/{file_hash}_{file_name}

  2. Security
    - Only authenticated users can upload
    - Only farm members can access their farm's import files
*/

-- Create the imports bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'imports',
  'imports',
  false,
  52428800,
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic', 
        'text/csv', 'application/vnd.ms-excel', 
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Policy: Farm members can upload files to their farm's folder
CREATE POLICY "Farm members can upload import files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'imports' AND
  (storage.foldername(name))[1] = 'farm' AND
  is_farm_member((storage.foldername(name))[2]::uuid)
);

-- Policy: Farm members can read their farm's import files
CREATE POLICY "Farm members can read import files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'imports' AND
  (storage.foldername(name))[1] = 'farm' AND
  is_farm_member((storage.foldername(name))[2]::uuid)
);

-- Policy: Farm managers can delete import files
CREATE POLICY "Managers can delete import files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'imports' AND
  (storage.foldername(name))[1] = 'farm' AND
  is_farm_member((storage.foldername(name))[2]::uuid) AND
  get_user_farm_role((storage.foldername(name))[2]::uuid) IN ('owner', 'manager')
);
