-- Migration file for Universal Memory and Social Identities

CREATE TABLE IF NOT EXISTS public.identidades_sociales_universales (
    id_global UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    personaje_id TEXT DEFAULT 'Nayla',
    plataforma TEXT NOT NULL,
    plataforma_user_id TEXT,
    alias TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.historial_interacciones_ia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_global_usuario UUID REFERENCES public.identidades_sociales_universales(id_global),
    mensaje_usuario TEXT,
    respuesta_ia TEXT,
    plataforma_origen TEXT,
    contexto_programa TEXT,
    fecha TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.identidades_sociales_universales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historial_interacciones_ia ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Enable service role full access for identidades" ON public.identidades_sociales_universales
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Enable service role full access for historial" ON public.historial_interacciones_ia
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
