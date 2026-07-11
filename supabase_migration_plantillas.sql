CREATE TABLE IF NOT EXISTS public.plantillas_usuario (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    nombre TEXT NOT NULL,
    codigo_script TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.plantillas_usuario ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own plantillas" ON public.plantillas_usuario
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own plantillas" ON public.plantillas_usuario
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own plantillas" ON public.plantillas_usuario
    FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own plantillas" ON public.plantillas_usuario
    FOR DELETE
    USING (auth.uid() = user_id);

-- Also allow service_role full access just in case
CREATE POLICY "Enable service role full access for plantillas" ON public.plantillas_usuario
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
