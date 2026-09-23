import { useEffect, useMemo, useRef, useState } from 'react';
import type { FirebaseSession } from '../../lib/firebaseClient';

type DiagnosticStatus = {
  service: string;
  source: string;
  status: 'ok' | 'info' | 'degraded' | 'error' | 'recovered';
  summary: string;
  details?: Record<string, unknown>;
  last_seen_at: string;
  updated_at: string;
};

type DiagnosticEvent = {
  id: string;
  source: string;
  service: string;
  status: string;
  severity: string;
  title: string;
  message?: string | null;
  external_url?: string | null;
  occurred_at: string;
};

type HealthPayload = {
  ok: boolean;
  checkedAt: string;
  statuses: DiagnosticStatus[];
  events: DiagnosticEvent[];
  deployment?: {
    environment?: string | null;
    commitSha?: string | null;
  };
  sentryConfigured?: boolean;
  streamIntervalMs?: number;
};

const statusLabel = (value?: string) => {
  if (value === 'ok') return 'OPERATIVO';
  if (value === 'recovered') return 'RECUPERADO';
  if (value === 'degraded') return 'DEGRADADO';
  if (value === 'error') return 'ERROR';
  return 'ESPERANDO';
};

const statusClass = (value?: string) => {
  if (value === 'error') return 'bad';
  if (value === 'degraded') return 'warn';
  if (value === 'ok' || value === 'recovered') return 'good';
  return 'idle';
};

const formatTime = (value?: string) => {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('es-EC', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
};

export default function DiagnosticsWorkspace({
  session,
  onClose,
}: {
  session: FirebaseSession;
  onClose: () => void;
}) {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [healthError, setHealthError] = useState('');
  const [sentryTestMessage, setSentryTestMessage] = useState('');
  const [liveState, setLiveState] = useState<'connecting' | 'live' | 'reconnecting' | 'offline'>('connecting');
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadHealth = async () => {
    setHealthError('');
    try {
      const response = await fetch('/api/diagnostics/health', {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'No se pudo leer el diagnóstico.');
      setHealth(payload);
    } catch (error: any) {
      setHealthError(error?.message || 'No se pudo leer el diagnóstico.');
    }
  };

  useEffect(() => {
    void loadHealth();
  }, [session.accessToken]);

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | null = null;

    const connect = async () => {
      if (cancelled) return;
      setLiveState((current) => current === 'live' ? 'live' : 'connecting');
      controller = new AbortController();

      try {
        const response = await fetch('/api/diagnostics/stream', {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            Accept: 'text/event-stream',
          },
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!response.ok || !response.body) throw new Error('STREAM_UNAVAILABLE');

        setLiveState('live');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let boundary = buffer.indexOf('\n\n');
          while (boundary >= 0) {
            const block = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            boundary = buffer.indexOf('\n\n');

            const eventLine = block.split('\n').find((line) => line.startsWith('event:'));
            const dataLine = block.split('\n').find((line) => line.startsWith('data:'));
            const eventName = eventLine?.slice(6).trim();
            if (!dataLine) continue;

            if (eventName === 'snapshot') {
              const snapshot = JSON.parse(dataLine.slice(5).trim());
              setHealth((current) => ({
                ok: true,
                checkedAt: snapshot.checkedAt,
                statuses: snapshot.statuses || [],
                events: snapshot.events || [],
                deployment: current?.deployment,
                sentryConfigured: current?.sentryConfigured,
                streamIntervalMs: current?.streamIntervalMs,
              }));
              setLiveState('live');
            }
          }
        }

        if (!cancelled) throw new Error('STREAM_ENDED');
      } catch {
        if (cancelled) return;
        setLiveState('reconnecting');
        reconnectTimer.current = setTimeout(() => void connect(), 1200);
      }
    };

    void connect();

    return () => {
      cancelled = true;
      controller?.abort();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [session.accessToken]);

  const sendSentryTest = async () => {
    const sentry = (window as any).Sentry;
    let eventId = '';

    if (sentry?.captureException) {
      eventId = sentry.captureException(new Error('Nayla diagnostics controlled test')) || '';
    }

    try {
      await fetch('/api/diagnostics/client-event', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Prueba controlada de Sentry',
          message: 'Evento de prueba enviado desde el panel Diagnóstico.',
          details: { component: 'diagnostics-panel' },
        }),
      });
      setSentryTestMessage(eventId ? `Sentry + panel en vivo · ${eventId}` : 'Evento enviado al panel en vivo.');
    } catch {
      setSentryTestMessage('Sentry recibió la prueba, pero el espejo del panel no respondió.');
    }
  };

  const byService = useMemo(() => {
    const map = new Map<string, DiagnosticStatus>();
    for (const item of health?.statuses || []) map.set(item.service, item);
    return map;
  }, [health?.statuses]);

  const cards = [
    { key: 'editor', label: 'Editor', detail: 'Aplicación y panel privado' },
    { key: 'sentry', label: 'Sentry', detail: 'Errores reales del navegador' },
    { key: 'playwright', label: 'Playwright', detail: 'Pruebas automáticas después de cambios' },
    { key: 'checkly', label: 'Checkly', detail: 'Disponibilidad externa de producción' },
  ];

  return (
    <div className="diagnostics-workspace" role="dialog" aria-modal="true" aria-label="Diagnóstico">
      <header className="diagnostics-header">
        <div>
          <small>NAYLA</small>
          <strong>DIAGNÓSTICO</strong>
          <span>{session.user.email}</span>
        </div>
        <div className={`live-pill ${liveState}`}>
          <i />
          {liveState === 'live' ? 'EN VIVO' : liveState === 'reconnecting' ? 'RECONECTANDO' : 'CONECTANDO'}
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar diagnóstico">×</button>
      </header>

      <main className="diagnostics-main">
        <section className="diagnostics-summary">
          <div>
            <small>ESTADO DEL SISTEMA</small>
            <h1>Centro de control</h1>
            <p>Los cambios llegan solos. La vista se actualiza aproximadamente cada 2,5 segundos sin refrescar la página.</p>
          </div>
          <button type="button" onClick={() => void loadHealth()}>Actualizar ahora</button>
        </section>

        {healthError && <div className="diagnostics-error">{healthError}</div>}

        <section className="diagnostics-grid">
          {cards.map((card) => {
            const item = byService.get(card.key);
            const state = statusClass(item?.status);
            return (
              <article key={card.key} className={`diagnostics-card ${state}`}>
                <div className="diagnostics-card-top">
                  <strong>{card.label}</strong>
                  <span className="diagnostics-state"><i /> {statusLabel(item?.status)}</span>
                </div>
                <p>{item?.summary || card.detail}</p>
                <small>Último cambio: {formatTime(item?.last_seen_at)}</small>
              </article>
            );
          })}
        </section>

        <section className="diagnostics-actions">
          <div>
            <strong>Prueba controlada de Sentry</strong>
            <p>Envía una excepción a Sentry y al tablero en vivo sin tumbar el editor.</p>
          </div>
          <button type="button" onClick={() => void sendSentryTest()}>Enviar prueba</button>
          {sentryTestMessage && <span>{sentryTestMessage}</span>}
        </section>

        <section className="diagnostics-history">
          <div className="history-title">
            <div>
              <small>ÚLTIMOS EVENTOS</small>
              <strong>Actividad en vivo</strong>
            </div>
            <span>{health?.events?.length || 0} eventos</span>
          </div>
          <div className="history-list">
            {(health?.events || []).map((event) => (
              <a
                key={event.id}
                href={event.external_url || undefined}
                target={event.external_url ? '_blank' : undefined}
                rel={event.external_url ? 'noreferrer' : undefined}
                className={`history-row ${statusClass(event.status)}`}
              >
                <time>{formatTime(event.occurred_at)}</time>
                <span className="history-source">{event.service.toUpperCase()}</span>
                <div>
                  <strong>{event.title}</strong>
                  {event.message && <p>{event.message}</p>}
                </div>
                <b>{statusLabel(event.status)}</b>
              </a>
            ))}
            {!health?.events?.length && <div className="history-empty">Todavía no hay eventos registrados.</div>}
          </div>
        </section>

        <section className="diagnostics-links">
          <a href="https://sentry.io/" target="_blank" rel="noreferrer">Abrir Sentry ↗</a>
          <a href="https://app.checklyhq.com/" target="_blank" rel="noreferrer">Abrir Checkly ↗</a>
          {health?.deployment?.commitSha && (
            <span>Deploy: {health.deployment.commitSha.slice(0, 8)} · {health.deployment.environment || 'entorno desconocido'}</span>
          )}
        </section>
      </main>

      <style jsx>{`
        .diagnostics-workspace{position:fixed;inset:0;z-index:12500;background:#070809;color:#fff;display:flex;flex-direction:column}
        .diagnostics-header{height:72px;padding:0 20px;border-bottom:1px solid rgba(255,255,255,.1);display:flex;align-items:center;gap:16px;background:rgba(8,9,11,.97)}
        .diagnostics-header>div:first-child{display:flex;flex-direction:column;flex:1;min-width:0}
        .diagnostics-header small{font-size:10px;letter-spacing:.24em;opacity:.5}
        .diagnostics-header strong{font-size:17px;letter-spacing:.08em}
        .diagnostics-header span{font-size:11px;opacity:.55;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .diagnostics-header>button{width:42px;height:42px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:#fff;font-size:24px}
        .live-pill{display:flex;align-items:center;gap:7px;border:1px solid rgba(255,255,255,.12);padding:7px 10px;border-radius:999px;font-size:10px;letter-spacing:.1em}
        .live-pill i,.diagnostics-state i{width:7px;height:7px;border-radius:50%;display:inline-block;background:#777}
        .live-pill.live i{background:#80f7b1;box-shadow:0 0 10px rgba(128,247,177,.65)}
        .live-pill.reconnecting i{background:#ffd36a}
        .diagnostics-main{flex:1;overflow:auto;padding:24px;max-width:1040px;width:100%;margin:0 auto;box-sizing:border-box}
        .diagnostics-summary{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;margin-bottom:22px}
        .diagnostics-summary small,.history-title small{font-size:10px;letter-spacing:.2em;opacity:.45}
        .diagnostics-summary h1{font-size:30px;margin:5px 0 7px}
        .diagnostics-summary p,.diagnostics-card p,.diagnostics-actions p,.history-row p{margin:0;color:#9b9b9b;line-height:1.55}
        .diagnostics-summary button,.diagnostics-actions button{border:1px solid rgba(255,255,255,.18);background:#fff;color:#050505;border-radius:12px;padding:11px 16px;font-weight:800}
        .diagnostics-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
        .diagnostics-card{border:1px solid rgba(255,255,255,.11);background:rgba(255,255,255,.035);border-radius:18px;padding:18px}
        .diagnostics-card.good{border-color:rgba(128,247,177,.22)}.diagnostics-card.warn{border-color:rgba(255,211,106,.27)}.diagnostics-card.bad{border-color:rgba(255,107,107,.3)}
        .diagnostics-card-top{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:10px}
        .diagnostics-state{font-size:11px;letter-spacing:.08em;display:flex;gap:6px;align-items:center}
        .diagnostics-card.good .diagnostics-state i,.history-row.good:before{background:#80f7b1}.diagnostics-card.warn .diagnostics-state i,.history-row.warn:before{background:#ffd36a}.diagnostics-card.bad .diagnostics-state i,.history-row.bad:before{background:#ff6b6b}
        .diagnostics-card>small{display:block;margin-top:10px;color:#666}
        .diagnostics-actions{margin-top:18px;border:1px solid rgba(255,255,255,.11);border-radius:18px;padding:18px;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center}
        .diagnostics-actions>span{grid-column:1/-1;font-size:12px;color:#d7ffef}
        .diagnostics-history{margin-top:18px;border:1px solid rgba(255,255,255,.11);border-radius:18px;overflow:hidden}
        .history-title{padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.08);display:flex;justify-content:space-between;align-items:center}
        .history-title>div{display:flex;flex-direction:column;gap:3px}.history-title>span{font-size:11px;color:#777}
        .history-list{display:flex;flex-direction:column}
        .history-row{position:relative;display:grid;grid-template-columns:78px 90px 1fr auto;gap:12px;align-items:center;padding:13px 18px;border-bottom:1px solid rgba(255,255,255,.06);color:#fff;text-decoration:none}
        .history-row:last-child{border-bottom:0}.history-row:before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:#777}
        .history-row time,.history-source,.history-row>b{font-size:10px;color:#777;letter-spacing:.06em}.history-row>b{font-weight:700}
        .history-row strong{font-size:13px}.history-row p{font-size:11px;margin-top:3px}.history-empty{padding:24px;color:#666}
        .diagnostics-links{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:18px}
        .diagnostics-links a{color:#fff;border:1px solid rgba(255,255,255,.13);border-radius:11px;padding:9px 12px;text-decoration:none}
        .diagnostics-links span{font-size:11px;color:#777}
        .diagnostics-error{border:1px solid rgba(255,130,130,.3);background:rgba(120,20,20,.16);padding:14px;border-radius:14px;margin-bottom:16px}
        @media(max-width:650px){
          .diagnostics-header{padding:0 12px}.live-pill{font-size:8px;padding:6px 8px}
          .diagnostics-main{padding:16px}.diagnostics-summary{align-items:flex-start;flex-direction:column}
          .diagnostics-grid{grid-template-columns:1fr}.diagnostics-actions{grid-template-columns:1fr}.diagnostics-summary h1{font-size:26px}
          .history-row{grid-template-columns:58px 66px 1fr;gap:8px;padding:12px}.history-row>b{display:none}.history-row p{display:none}
        }
      `}</style>
    </div>
  );
}
