-- Supabase Cloud schema. Firebase owns identity; UUID auth.users is intentionally not referenced.
CREATE TABLE IF NOT EXISTS public.memoria_nayla (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL, url text NOT NULL,
  tipo text NOT NULL, nombre text NOT NULL, estado text DEFAULT 'completado', metadata jsonb DEFAULT '{}'::jsonb,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.galeria_multimedia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL, url text NOT NULL,
  tipo text NOT NULL, nombre text NOT NULL, creado_en timestamptz NOT NULL DEFAULT now(),
  "esOverlay" boolean NOT NULL DEFAULT false, etiqueta text, fuente text, memoria_id uuid UNIQUE REFERENCES public.memoria_nayla(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS public.proyectos_usuario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL UNIQUE, linea_de_tiempo jsonb NOT NULL DEFAULT '[]'::jsonb, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.api_keys_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), service_provider text NOT NULL, api_key text NOT NULL,
  is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS memoria_nayla_user_id_idx ON public.memoria_nayla(user_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS galeria_multimedia_user_id_idx ON public.galeria_multimedia(user_id, creado_en DESC);
ALTER TABLE public.memoria_nayla ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.galeria_multimedia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proyectos_usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys_pool ENABLE ROW LEVEL SECURITY;
-- The browser uses the Supabase anon key only for database access. Firebase token verification remains server-side.
CREATE POLICY "service role manages memoria" ON public.memoria_nayla FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service role manages gallery" ON public.galeria_multimedia FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service role manages projects" ON public.proyectos_usuario FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service role manages api key pool" ON public.api_keys_pool FOR ALL TO service_role USING (true) WITH CHECK (true);
