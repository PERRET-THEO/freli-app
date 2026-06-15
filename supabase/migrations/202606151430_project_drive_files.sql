-- Suivi des fichiers uploadés vers Google Drive (upload automatique fin onboarding).
CREATE TABLE IF NOT EXISTS project_drive_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  checklist_item_id UUID REFERENCES checklist_items(id) ON DELETE SET NULL,
  source_kind TEXT NOT NULL,
  source_key TEXT NOT NULL,
  drive_file_id TEXT NOT NULL,
  drive_file_name TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (project_id, source_kind, source_key)
);

ALTER TABLE project_drive_files ENABLE ROW LEVEL SECURITY;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS google_drive_files_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS google_drive_sync_status TEXT;
