-- Migration file to create ai_operation_logs table

CREATE TABLE IF NOT EXISTS public.ai_operation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    provider TEXT NOT NULL,
    error_message TEXT NOT NULL
);

-- Add Row Level Security policies if needed (optional for simple logs, but good practice to allow service role to insert)
ALTER TABLE public.ai_operation_logs ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Enable service role full access" ON public.ai_operation_logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Optionally allow anon or authenticated to insert if called from client, but since we are doing it server-side, service_role is enough.
