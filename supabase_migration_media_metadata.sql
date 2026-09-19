-- Persist media dimensions, aspect ratio and duration detected by the editor.
ALTER TABLE public.galeria_multimedia
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.galeria_multimedia.metadata IS
  'Media metadata detected by the editor: width, height, aspect ratio label and duration.';
