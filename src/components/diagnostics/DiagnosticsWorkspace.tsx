import { useEffect, useState } from 'react';
import type { FirebaseSession } from '../../lib/firebaseClient';

type HealthPayload = {
  ok: boolean;
  checkedAt: string;
  deployment?: {
    environment?: string | null;
    commitSha?: string | null;
  };
  services: {
    app: 'ok' | 'error';
    sentryBrowser: 'configured' | 'missing';
    playwright: 'configured';
    checkly: 'github-actions';
  };
};

const stateLabel = (value: string) => {
  if (value === 'ok' || value === 'configured') return 'LISTO';
  if (value === 'github-actions') return 'CI';
  return 'PENDIENTE';
};

const stateDot = (value: string) => (value === 'ok' || value === 'configured' || value === 'github-actions' ? '●' : '○');

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

  const sendSentryTest = () => {
    const sentry = (window as any).Sentry;
    if (!sentry?.captureException) {
      setSentryTestMessage('Sentry todavía no está cargado en esta sesión.');
      return;
    }

    const eventId = sentry.captureException(new Error('Nayla diagnostics controlled test'));
    setSentryTestMessage(eventId ? `Prueba enviada a Sentry · ${eventId}` : 'Prueba enviada a Sentry.');
  };

  const cards = health
    ? [
        { label: 'Editor', value: health.services.app, detail: 'Aplicación y endpoint privado de diagnóstico' },
        { label: 'Sentry', value: health.services.sentryBrowser, detail: 'Errores del navegador y excepciones no controladas' },
        { label: 'Playwright', value: health.services.playwright, detail: 'Pruebas automáticas del flujo GENERAR en CI' },
        { label: 'Checkly', value: health.services.checkly, detail: 'Monitor externo sincronizado desde GitHub Actions' },
      ]
    : [];

  return (
    <div className="diagnostics-workspace" role="dialog" aria-modal="true" aria-label="Diagnóstico">
      <header className="diagnostics-header">
        <div>
          <small>NAYLA</small>
          <strong>DIAGNÓSTICO</strong>
          <span>{session.user.email}</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar diagnóstico">×</button>
      </header>

      <main className="diagnostics-main">
        <section className="diagnostics-summary">
          <div>
            <small>ESTADO DEL SISTEMA</small>
            <h1>Panel privado</h1>
            <p>Solo visible para la cuenta administrativa autorizada. No muestra claves ni secretos.</p>
          </div>
          <button type="button" onClick={() => void loadHealth()}>Actualizar</button>
        </section>

        {healthError && <div className="diagnostics-error">{healthError}</div>}

        <section className="diagnostics-grid">
          {cards.map((card) => (
            <article key={card.label} className="diagnostics-card">
              <div className="diagnostics-card-top">
                <strong>{card.label}</strong>
                <span className="diagnostics-state">{stateDot(card.value)} {stateLabel(card.value)}</span>
              </div>
              <p>{card.detail}</p>
            </article>
          ))}
          {!health && !healthError && <div className="diagnostics-loading">Revisando sistema…</div>}
        </section>

        <section className="diagnostics-actions">
          <div>
            <strong>Prueba controlada de Sentry</strong>
            <p>Envía una excepción de prueba sin tumbar el editor. Después debe aparecer en Issues.</p>
          </div>
          <button type="button" onClick={sendSentryTest}>Enviar prueba</button>
          {sentryTestMessage && <span>{sentryTestMessage}</span>}
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
        .diagnostics-header>div{display:flex;flex-direction:column;flex:1;min-width:0}
        .diagnostics-header small{font-size:10px;letter-spacing:.24em;opacity:.5}
        .diagnostics-header strong{font-size:17px;letter-spacing:.08em}
        .diagnostics-header span{font-size:11px;opacity:.55;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .diagnostics-header button{width:42px;height:42px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:#fff;font-size:24px}
        .diagnostics-main{flex:1;overflow:auto;padding:24px;max-width:980px;width:100%;margin:0 auto;box-sizing:border-box}
        .diagnostics-summary{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;margin-bottom:22px}
        .diagnostics-summary small{font-size:10px;letter-spacing:.2em;opacity:.45}
        .diagnostics-summary h1{font-size:30px;margin:5px 0 7px}
        .diagnostics-summary p,.diagnostics-card p,.diagnostics-actions p{margin:0;color:#9b9b9b;line-height:1.55}
        .diagnostics-summary button,.diagnostics-actions button{border:1px solid rgba(255,255,255,.18);background:#fff;color:#050505;border-radius:12px;padding:11px 16px;font-weight:800}
        .diagnostics-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
        .diagnostics-card{border:1px solid rgba(255,255,255,.11);background:rgba(255,255,255,.035);border-radius:18px;padding:18px}
        .diagnostics-card-top{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:10px}
        .diagnostics-state{font-size:11px;letter-spacing:.1em;color:#d7ffef}
        .diagnostics-actions{margin-top:18px;border:1px solid rgba(255,255,255,.11);border-radius:18px;padding:18px;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center}
        .diagnostics-actions>span{grid-column:1/-1;font-size:12px;color:#d7ffef}
        .diagnostics-links{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:18px}
        .diagnostics-links a{color:#fff;border:1px solid rgba(255,255,255,.13);border-radius:11px;padding:9px 12px;text-decoration:none}
        .diagnostics-links span{font-size:11px;color:#777}
        .diagnostics-error{border:1px solid rgba(255,130,130,.3);background:rgba(120,20,20,.16);padding:14px;border-radius:14px;margin-bottom:16px}
        .diagnostics-loading{padding:30px;color:#777}
        @media(max-width:650px){
          .diagnostics-main{padding:16px}
          .diagnostics-summary{align-items:flex-start;flex-direction:column}
          .diagnostics-grid{grid-template-columns:1fr}
          .diagnostics-actions{grid-template-columns:1fr}
          .diagnostics-summary h1{font-size:26px}
        }
      `}</style>
    </div>
  );
}
