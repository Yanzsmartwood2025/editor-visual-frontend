CREATE TABLE public.error_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    endpoint TEXT NOT NULL,
    error_message TEXT NOT NULL,
    payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
