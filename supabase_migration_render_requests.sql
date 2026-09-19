-- Durable server-side ledger for per-user render rate limiting and render status auditing.
CREATE TABLE IF NOT EXISTS public.render_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'started'
    CHECK (status IN ('started', 'completed', 'failed')),
  output_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS render_requests_user_created_idx
  ON public.render_requests (user_id, created_at DESC);

ALTER TABLE public.render_requests ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.render_requests IS
  'Server-side render request ledger used for durable per-user rate limiting and render audit status.';


-- Explicitly deny client access. The server service-role client bypasses RLS.
DROP POLICY IF EXISTS render_requests_deny_anon ON public.render_requests;
DROP POLICY IF EXISTS render_requests_deny_authenticated ON public.render_requests;

CREATE POLICY render_requests_deny_anon
  ON public.render_requests
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY render_requests_deny_authenticated
  ON public.render_requests
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);
