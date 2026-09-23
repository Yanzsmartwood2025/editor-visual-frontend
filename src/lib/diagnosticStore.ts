import crypto from 'crypto';
import { getWorkspaceSupabaseAdmin } from './workspaceStore';

export type DiagnosticStatusValue = 'ok' | 'info' | 'degraded' | 'error' | 'recovered';
export type DiagnosticSeverity = 'info' | 'warning' | 'error';
export type DiagnosticSource = 'app' | 'sentry' | 'playwright' | 'checkly' | 'system';

export type DiagnosticEventInput = {
  source: DiagnosticSource;
  service: string;
  status: DiagnosticStatusValue;
  severity?: DiagnosticSeverity;
  title: string;
  message?: string | null;
  externalUrl?: string | null;
  details?: Record<string, unknown>;
  occurredAt?: string;
};

const trimText = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

export const hashDiagnosticSecret = (secret: string) =>
  crypto.createHash('sha256').update(secret).digest('hex');

export const registerDiagnosticIntegration = async ({
  provider,
  secret,
  metadata = {},
}: {
  provider: string;
  secret: string;
  metadata?: Record<string, unknown>;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { error } = await supabase
    .from('diagnostic_integrations')
    .upsert({
      provider: trimText(provider, 80),
      secret_hash: hashDiagnosticSecret(secret),
      metadata,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'provider' });

  if (error) throw error;
};

export const verifyDiagnosticIntegration = async (provider: string, secret: string) => {
  if (!secret) return false;
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('diagnostic_integrations')
    .select('secret_hash')
    .eq('provider', trimText(provider, 80))
    .maybeSingle();

  if (error || !data?.secret_hash) return false;

  const incoming = Buffer.from(hashDiagnosticSecret(secret));
  const stored = Buffer.from(String(data.secret_hash));
  return incoming.length === stored.length && crypto.timingSafeEqual(incoming, stored);
};

export const recordDiagnosticEvent = async (input: DiagnosticEventInput) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const occurredAt = input.occurredAt || new Date().toISOString();
  const row = {
    source: input.source,
    service: trimText(input.service, 120) || input.source,
    status: input.status,
    severity: input.severity || (input.status === 'error' ? 'error' : input.status === 'degraded' ? 'warning' : 'info'),
    title: trimText(input.title, 220) || 'Evento de diagnóstico',
    message: trimText(input.message, 2000) || null,
    external_url: trimText(input.externalUrl, 1000) || null,
    details: input.details || {},
    occurred_at: occurredAt,
  };

  const { data: event, error: eventError } = await supabase
    .from('diagnostic_events')
    .insert(row)
    .select('*')
    .single();
  if (eventError) throw eventError;

  const statusSummary = row.message || row.title;
  const { error: statusError } = await supabase
    .from('diagnostic_status')
    .upsert({
      service: row.service,
      source: row.source,
      status: row.status,
      summary: statusSummary,
      details: row.details,
      last_event_id: event.id,
      last_seen_at: occurredAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'service' });

  if (statusError) throw statusError;
  return event;
};

export const getDiagnosticSnapshot = async (limit = 40) => {
  const supabase = getWorkspaceSupabaseAdmin();

  const [{ data: statuses, error: statusError }, { data: events, error: eventsError }] = await Promise.all([
    supabase
      .from('diagnostic_status')
      .select('*')
      .order('service', { ascending: true }),
    supabase
      .from('diagnostic_events')
      .select('*')
      .order('occurred_at', { ascending: false })
      .limit(Math.max(1, Math.min(limit, 100))),
  ]);

  if (statusError) throw statusError;
  if (eventsError) throw eventsError;

  return {
    checkedAt: new Date().toISOString(),
    statuses: statuses || [],
    events: events || [],
  };
};
