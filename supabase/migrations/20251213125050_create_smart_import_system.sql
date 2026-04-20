/*
  # Smart Upload / Import System

  1. New Tables
    - `imports` - Parent record for each import session
      - `id` (uuid, primary key)
      - `farm_id` (uuid, required, references farms)
      - `created_by` (uuid, references auth.users)
      - `scope` (text: 'farm' | 'existing_flock' | 'new_flock')
      - `target_flock_id` (uuid, nullable, references flocks)
      - `status` (text: 'draft' | 'ready' | 'committed' | 'failed')
      - `name` (text, optional description)
      - `created_at`, `updated_at` timestamps

    - `import_files` - Files uploaded for an import
      - `id` (uuid, primary key)
      - `import_id` (uuid, references imports)
      - `farm_id` (uuid, required)
      - `storage_path` (text, path in storage bucket)
      - `file_name` (text, original filename)
      - `mime_type` (text)
      - `file_size` (bigint, bytes)
      - `file_hash` (text, sha256 for deduplication)
      - `pages` (int, nullable, for PDFs)
      - `created_at` timestamp

    - `import_items` - Extracted rows/entities from files
      - `id` (uuid, primary key)
      - `import_id` (uuid, references imports)
      - `farm_id` (uuid, required)
      - `entity_type` (text: 'flock'|'expense'|'inventory'|'production'|'task_template')
      - `payload` (jsonb, normalized candidate data)
      - `confidence` (numeric 0-1)
      - `needs_review` (boolean)
      - `source_excerpt` (text, original text snippet)
      - `user_overrides` (jsonb, nullable)
      - `status` (text: 'proposed'|'edited'|'discarded'|'imported'|'failed')
      - `error_message` (text, nullable)
      - `linked_flock_id` (uuid, nullable, resolved flock link)
      - `created_at` timestamp

    - `farm_documents` - General document storage linked to farm/flock
      - `id` (uuid, primary key)
      - `farm_id` (uuid, required)
      - `storage_path` (text)
      - `title` (text)
      - `tags` (text array)
      - `linked_flock_id` (uuid, nullable)
      - `created_by` (uuid)
      - `created_at` timestamp

    - `audit_log` - Audit trail for all import and other actions
      - `id` (uuid, primary key)
      - `farm_id` (uuid, required)
      - `actor_id` (uuid, who performed action)
      - `action` (text, e.g., 'import.commit', 'expense.create')
      - `entity_type` (text)
      - `entity_id` (uuid, nullable)
      - `details` (jsonb, additional context)
      - `created_at` timestamp

  2. Security
    - Enable RLS on all tables
    - Only farm members can access their farm's imports
    - Owners/Managers can commit imports
    - Workers can create drafts but not commit (configurable)

  3. Indexes
    - On farm_id for all tables
    - On import_id for import_files and import_items
    - On file_hash for deduplication

  4. Helper Functions
    - get_user_farm_role() to get current user's role in a farm
    - log_audit_entry() to create audit log entries
*/

-- Helper function to get user's role in a farm
CREATE OR REPLACE FUNCTION get_user_farm_role(p_farm_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text
  FROM farm_members
  WHERE farm_id = p_farm_id
    AND user_id = auth.uid()
    AND is_active = true
  LIMIT 1;
$$;

-- Create imports table
CREATE TABLE IF NOT EXISTS imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id),
  scope text NOT NULL DEFAULT 'farm' CHECK (scope IN ('farm', 'existing_flock', 'new_flock')),
  target_flock_id uuid REFERENCES flocks(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'committed', 'failed')),
  name text,
  ai_enabled boolean DEFAULT true,
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create import_files table
CREATE TABLE IF NOT EXISTS import_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint,
  file_hash text,
  pages int,
  extracted_text text,
  created_at timestamptz DEFAULT now()
);

-- Create import_items table
CREATE TABLE IF NOT EXISTS import_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('flock', 'expense', 'inventory', 'production', 'task_template')),
  payload jsonb NOT NULL DEFAULT '{}',
  confidence numeric(3,2) DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  needs_review boolean DEFAULT true,
  source_excerpt text,
  user_overrides jsonb,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'edited', 'discarded', 'imported', 'failed')),
  error_message text,
  linked_flock_id uuid REFERENCES flocks(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Create farm_documents table
CREATE TABLE IF NOT EXISTS farm_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  title text NOT NULL,
  tags text[] DEFAULT '{}',
  linked_flock_id uuid REFERENCES flocks(id) ON DELETE SET NULL,
  linked_import_id uuid REFERENCES imports(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Create audit_log table
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_imports_farm_id ON imports(farm_id);
CREATE INDEX IF NOT EXISTS idx_imports_status ON imports(status);
CREATE INDEX IF NOT EXISTS idx_imports_created_by ON imports(created_by);

CREATE INDEX IF NOT EXISTS idx_import_files_import_id ON import_files(import_id);
CREATE INDEX IF NOT EXISTS idx_import_files_farm_id ON import_files(farm_id);
CREATE INDEX IF NOT EXISTS idx_import_files_file_hash ON import_files(file_hash);

CREATE INDEX IF NOT EXISTS idx_import_items_import_id ON import_items(import_id);
CREATE INDEX IF NOT EXISTS idx_import_items_farm_id ON import_items(farm_id);
CREATE INDEX IF NOT EXISTS idx_import_items_entity_type ON import_items(entity_type);
CREATE INDEX IF NOT EXISTS idx_import_items_status ON import_items(status);

CREATE INDEX IF NOT EXISTS idx_farm_documents_farm_id ON farm_documents(farm_id);
CREATE INDEX IF NOT EXISTS idx_farm_documents_linked_flock ON farm_documents(linked_flock_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_farm_id ON audit_log(farm_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_id ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);

-- Enable RLS
ALTER TABLE imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for imports
CREATE POLICY "Farm members can view their imports"
  ON imports FOR SELECT
  TO authenticated
  USING (is_farm_member(farm_id));

CREATE POLICY "Farm members can create imports"
  ON imports FOR INSERT
  TO authenticated
  WITH CHECK (is_farm_member(farm_id));

CREATE POLICY "Import creator or managers can update imports"
  ON imports FOR UPDATE
  TO authenticated
  USING (
    is_farm_member(farm_id) AND (
      created_by = auth.uid() OR
      get_user_farm_role(farm_id) IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    is_farm_member(farm_id) AND (
      created_by = auth.uid() OR
      get_user_farm_role(farm_id) IN ('owner', 'manager')
    )
  );

CREATE POLICY "Managers can delete imports"
  ON imports FOR DELETE
  TO authenticated
  USING (
    is_farm_member(farm_id) AND
    get_user_farm_role(farm_id) IN ('owner', 'manager')
  );

-- RLS Policies for import_files
CREATE POLICY "Farm members can view their import files"
  ON import_files FOR SELECT
  TO authenticated
  USING (is_farm_member(farm_id));

CREATE POLICY "Farm members can upload import files"
  ON import_files FOR INSERT
  TO authenticated
  WITH CHECK (is_farm_member(farm_id));

CREATE POLICY "Farm members can delete their import files"
  ON import_files FOR DELETE
  TO authenticated
  USING (
    is_farm_member(farm_id) AND
    get_user_farm_role(farm_id) IN ('owner', 'manager')
  );

-- RLS Policies for import_items
CREATE POLICY "Farm members can view their import items"
  ON import_items FOR SELECT
  TO authenticated
  USING (is_farm_member(farm_id));

CREATE POLICY "Farm members can create import items"
  ON import_items FOR INSERT
  TO authenticated
  WITH CHECK (is_farm_member(farm_id));

CREATE POLICY "Farm members can update import items"
  ON import_items FOR UPDATE
  TO authenticated
  USING (is_farm_member(farm_id))
  WITH CHECK (is_farm_member(farm_id));

CREATE POLICY "Managers can delete import items"
  ON import_items FOR DELETE
  TO authenticated
  USING (
    is_farm_member(farm_id) AND
    get_user_farm_role(farm_id) IN ('owner', 'manager')
  );

-- RLS Policies for farm_documents
CREATE POLICY "Farm members can view their documents"
  ON farm_documents FOR SELECT
  TO authenticated
  USING (is_farm_member(farm_id));

CREATE POLICY "Farm members can upload documents"
  ON farm_documents FOR INSERT
  TO authenticated
  WITH CHECK (is_farm_member(farm_id));

CREATE POLICY "Document creator or managers can update documents"
  ON farm_documents FOR UPDATE
  TO authenticated
  USING (
    is_farm_member(farm_id) AND (
      created_by = auth.uid() OR
      get_user_farm_role(farm_id) IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    is_farm_member(farm_id) AND (
      created_by = auth.uid() OR
      get_user_farm_role(farm_id) IN ('owner', 'manager')
    )
  );

CREATE POLICY "Managers can delete documents"
  ON farm_documents FOR DELETE
  TO authenticated
  USING (
    is_farm_member(farm_id) AND
    get_user_farm_role(farm_id) IN ('owner', 'manager')
  );

-- RLS Policies for audit_log (read-only for members, insert via functions)
CREATE POLICY "Farm members can view audit log"
  ON audit_log FOR SELECT
  TO authenticated
  USING (is_farm_member(farm_id));

CREATE POLICY "Farm members can create audit entries"
  ON audit_log FOR INSERT
  TO authenticated
  WITH CHECK (is_farm_member(farm_id));

-- Function to log audit entries
CREATE OR REPLACE FUNCTION log_audit_entry(
  p_farm_id uuid,
  p_action text,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_details jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audit_id uuid;
BEGIN
  INSERT INTO audit_log (farm_id, actor_id, action, entity_type, entity_id, details)
  VALUES (p_farm_id, auth.uid(), p_action, p_entity_type, p_entity_id, p_details)
  RETURNING id INTO v_audit_id;
  
  RETURN v_audit_id;
END;
$$;

-- Trigger to update imports.updated_at
CREATE OR REPLACE FUNCTION update_imports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_imports_updated_at ON imports;
CREATE TRIGGER trigger_imports_updated_at
  BEFORE UPDATE ON imports
  FOR EACH ROW
  EXECUTE FUNCTION update_imports_updated_at();
