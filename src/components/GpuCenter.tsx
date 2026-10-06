import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FirebaseSession } from '../lib/firebaseClient';
import { firebaseHeaders } from '../lib/apiClient';

type GpuCenterJob = {
  id: string;
  workload: string;
  status: string;
  gpuName?: string | null;
  provider?: string | null;
  backendProvider?: string | null;
  hourlyPrice?: number | null;
  estimatedMaxCost?: number | null;
  currentCostEstimate?: number | null;
  elapsedSeconds?: number;
  progress?: { percent?: number | null; stage?: string | null; updatedAt?: string | null } | null;
  recipe?: string | null;
  createdAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  destroyedAt?: string | null;
  leaseExpiresAt?: string | null;
  error?: string | null;
  active?: boolean;
  canDestroy?: boolean;
};

type GpuOverview = {
  active: GpuCenterJob[];
  history: GpuCenterJob[];
  activeCount: number;
  totals: {
    activeCostEstimate: number;
    historyCost: number;
    completed: number;
    failed: number;
    cancelled: number;
  };
};

const workloadLabel = (workload: string) => {
  if (workload === '3d') return '3D';
  if (workload === 'image') return 'IMAGEN';
  if (workload === 'video') return 'VIDEO';
  if (workload === 'audio') return 'AUDIO';
  if (workload === 'probe') return 'PRUEBA';
  return workload.toUpperCase();
};

const statusLabel = (status: string) => {
  const labels: Record<string, string> = {
    renting: 'BUSCANDO GPU',
    booting: 'INICIANDO',
    running: 'TRABAJANDO',
    processing: 'PROCESANDO',
    cleanup_pending: 'RETIRANDO',
    completed: 'TERMINADO',
    failed: 'FALLÓ',
    expired: 'EXPIRÓ',
    cancelled: 'CANCELADO',
  };
  return labels[status] || status.toUpperCase();
};

const providerLabel = (provider?: string | null) => {
  if (provider === 'vast') return 'Vast';
  if (provider === 'runpod') return 'RunPod';
  if (provider === 'vultr') return 'Vultr';
  return 'Nayla Compute';
};

const money = (value?: number | null) =>
  Number.isFinite(Number(value)) ? '$' + Number(value).toFixed(3) : '—';

const duration = (seconds?: number) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const localDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
};

function Machine({ percent = 0, active = true }: { percent?: number | null; active?: boolean }) {
  const bounded = Math.max(0, Math.min(100, Number(percent) || 0));
  return (
    <div className="gpu-center-machine" aria-hidden="true">
      <svg viewBox="0 0 300 170" fill="none">
        <rect x="38" y="18" width="224" height="108" rx="10" fill="#121518" stroke="rgba(255,255,255,.62)" strokeWidth="2" />
        <rect x="54" y="34" width="192" height="75" rx="4" fill="#080a0c" stroke="rgba(255,255,255,.12)" />
        <path className={active ? 'gpu-center-circuit live' : 'gpu-center-circuit'} d="M68 52h62v17h43v20h61" />
        <path className={active ? 'gpu-center-circuit live' : 'gpu-center-circuit'} d="M68 94h39V80h48V58h79" />
        <circle cx="91" cy="71" r="12" fill="#20252a" stroke="rgba(255,255,255,.7)" />
        <path d="M85 71h12M91 65v12" stroke="#fff" strokeWidth="1.5" />
        <rect x="128" y="86" width="25" height="6" rx="3" fill="#575d64" />
        <rect x="159" y="86" width="25" height="6" rx="3" fill="#575d64" />
        <rect x="190" y="86" width="25" height="6" rx="3" fill="#575d64" />
        <path d="M30 140q0-7 10-8h220q10 1 10 8l-12 12H42L30 140Z" fill="#1a1d20" stroke="rgba(255,255,255,.48)" strokeWidth="2" />
      </svg>
      <div className="gpu-center-machine-percent">{bounded}%</div>
    </div>
  );
}

function JobDetails({
  job,
  destroying,
  onDestroy,
}: {
  job: GpuCenterJob;
  destroying: boolean;
  onDestroy: (job: GpuCenterJob) => void;
}) {
  const percent = job.progress?.percent ?? (job.status === 'completed' ? 100 : 0);
  return (
    <div className="gpu-center-detail">
      {job.active && <Machine percent={percent} active={job.status !== 'cleanup_pending'} />}
      <div className="gpu-center-stage">
        <span>{job.progress?.stage || statusLabel(job.status)}</span>
        <strong>{job.progress?.percent != null ? `${Math.round(Number(job.progress.percent))}%` : statusLabel(job.status)}</strong>
      </div>
      {job.active && (
        <div className="gpu-center-progress"><i style={{ width: `${Math.max(3, Math.min(100, Number(percent) || 0))}%` }} /></div>
      )}
      <div className="gpu-center-data-grid">
        <span><small>GPU</small><strong>{job.gpuName || 'GPU temporal'}</strong></span>
        <span><small>PROVEEDOR</small><strong>{providerLabel(job.backendProvider)}</strong></span>
        <span><small>TIPO</small><strong>{workloadLabel(job.workload)}</strong></span>
        <span><small>ESTADO</small><strong>{statusLabel(job.status)}</strong></span>
        <span><small>PRECIO/H</small><strong>{money(job.hourlyPrice)}</strong></span>
        <span><small>CONSUMIDO</small><strong>{money(job.currentCostEstimate)}</strong></span>
        <span><small>TIEMPO</small><strong>{duration(job.elapsedSeconds)}</strong></span>
        <span><small>TOPE EST.</small><strong>{money(job.estimatedMaxCost)}</strong></span>
        <span><small>INICIO</small><strong>{localDate(job.startedAt || job.createdAt)}</strong></span>
        <span><small>FIN</small><strong>{localDate(job.destroyedAt || job.completedAt)}</strong></span>
        <span><small>MOTOR</small><strong>{job.recipe || 'default'}</strong></span>
        <span><small>ID</small><strong>{job.id.slice(0, 8)}</strong></span>
      </div>
      {job.error && <div className="gpu-center-error">{job.error}</div>}
      {job.active && (
        <button
          type="button"
          className="gpu-center-destroy"
          disabled={!job.canDestroy || destroying}
          onClick={() => onDestroy(job)}
        >
          {job.status === 'cleanup_pending'
            ? 'DESTRUYENDO GPU…'
            : destroying
              ? 'CANCELANDO Y DESTRUYENDO…'
              : 'CANCELAR Y DESTRUIR GPU'}
        </button>
      )}
    </div>
  );
}

export default function GpuCenter({ session, onClose }: { session: FirebaseSession; onClose: () => void }) {
  const [overview, setOverview] = useState<GpuOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [destroyingId, setDestroyingId] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch('/api/gpu/overview?limit=80', {
        headers: firebaseHeaders(session),
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar el Centro GPU.');
      setOverview(payload as GpuOverview);
      setError('');
      const firstActive = payload?.active?.[0]?.id;
      if (firstActive) setExpandedId((current) => current || firstActive);
    } catch (caught: any) {
      setError(caught?.message || 'No se pudo cargar el Centro GPU.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 4000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const destroy = async (job: GpuCenterJob) => {
    if (!job.canDestroy || destroyingId) return;
    if (!window.confirm(`¿Cancelar ${workloadLabel(job.workload)} y destruir ${job.gpuName || 'la GPU'} ahora?`)) return;
    setDestroyingId(job.id);
    try {
      const response = await fetch('/api/gpu/jobs/cancel', {
        method: 'POST',
        headers: firebaseHeaders(session, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ jobId: job.id, confirmDestroy: true }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'No se pudo destruir la GPU.');
      await load(true);
    } catch (caught: any) {
      setError(caught?.message || 'No se pudo destruir la GPU.');
    } finally {
      setDestroyingId(null);
    }
  };

  const jobs = tab === 'active' ? overview?.active || [] : overview?.history || [];
  const totalCost = useMemo(
    () => (overview?.totals.historyCost || 0) + (overview?.totals.activeCostEstimate || 0),
    [overview]
  );

  return (
    <div className="gpu-center-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="gpu-center-shell" role="dialog" aria-modal="true" aria-label="Centro GPU de Nayla Compute">
        <style>{`
          .gpu-center-backdrop{position:fixed;inset:0;z-index:350000;background:rgba(0,0,0,.84);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);display:grid;place-items:center;padding:12px;color:#fff}
          .gpu-center-shell{width:min(760px,100%);height:min(890px,calc(100dvh - 24px));overflow:hidden;border:1px solid #30343a;border-radius:24px;background:radial-gradient(circle at 50% 0,rgba(255,255,255,.055),transparent 32%),#070809;box-shadow:0 30px 90px rgba(0,0,0,.8);display:flex;flex-direction:column}
          .gpu-center-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:17px 18px;border-bottom:1px solid #202328;background:rgba(8,9,11,.94)}
          .gpu-center-head-copy{min-width:0}.gpu-center-head small{display:block;color:#8b9299;font-size:.62rem;font-weight:850;letter-spacing:.19em}.gpu-center-head h2{margin:5px 0 0;font-size:1.22rem;letter-spacing:.04em}
          .gpu-center-close{width:42px;height:42px;border:1px solid #3a3e44;border-radius:13px;background:#101216;color:#fff;font-size:1.3rem;cursor:pointer}
          .gpu-center-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:12px 14px 8px}.gpu-center-summary span{min-width:0;border:1px solid #25292e;border-radius:13px;background:#0d0f12;padding:10px}.gpu-center-summary small{display:block;color:#727980;font-size:.55rem;font-weight:850;letter-spacing:.08em}.gpu-center-summary strong{display:block;margin-top:4px;font-size:.86rem;overflow:hidden;text-overflow:ellipsis}
          .gpu-center-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:6px 14px 10px}.gpu-center-tabs button{min-height:42px;border:1px solid #2a2e33;border-radius:13px;background:#0c0e11;color:#888f96;font-weight:850;letter-spacing:.06em;cursor:pointer}.gpu-center-tabs button.active{border-color:#e9eef3;color:#fff;background:#171a1e;box-shadow:0 0 16px rgba(255,255,255,.08)}
          .gpu-center-list{flex:1;min-height:0;overflow:auto;padding:4px 14px 20px;display:grid;align-content:start;gap:9px}.gpu-center-job{border:1px solid #262a2f;border-radius:16px;background:linear-gradient(145deg,#0d0f12,#08090b);overflow:hidden}.gpu-center-job.active-job{border-color:rgba(73,225,158,.45);box-shadow:0 0 20px rgba(73,225,158,.06)}
          .gpu-center-job-button{width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;text-align:left;padding:13px 14px;border:0;background:transparent;color:#fff;cursor:pointer}.gpu-center-job-title{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.gpu-center-job-title strong{font-size:.9rem}.gpu-center-pill{border:1px solid #363b42;border-radius:999px;padding:4px 7px;color:#c6ccd2;font-size:.53rem;font-weight:850;letter-spacing:.06em}.gpu-center-pill.live{color:#71f2b5;border-color:rgba(73,225,158,.38);background:rgba(73,225,158,.05)}.gpu-center-job-sub{display:block;margin-top:5px;color:#7f878e;font-size:.66rem}.gpu-center-job-cost{text-align:right}.gpu-center-job-cost strong{display:block;font-size:.85rem}.gpu-center-job-cost small{display:block;margin-top:4px;color:#767d84;font-size:.58rem}
          .gpu-center-detail{border-top:1px solid #20242a;padding:13px;display:grid;gap:11px}.gpu-center-machine{position:relative;height:150px;border:1px solid #1e2227;border-radius:14px;background:radial-gradient(circle at 50% 55%,rgba(255,255,255,.055),transparent 55%),#090b0d;display:grid;place-items:center;overflow:hidden}.gpu-center-machine svg{width:min(90%,390px);height:135px;filter:drop-shadow(0 12px 16px rgba(255,255,255,.06));animation:gpu-center-float 3.2s ease-in-out infinite}.gpu-center-machine-percent{position:absolute;right:12px;bottom:9px;color:#fff;font-size:.68rem;font-weight:900}.gpu-center-circuit{stroke:#78818a;stroke-width:2;stroke-linecap:round;stroke-dasharray:4 11;opacity:.5}.gpu-center-circuit.live{stroke:#fff;opacity:.95;filter:drop-shadow(0 0 4px rgba(255,255,255,.8));animation:gpu-center-electric .75s linear infinite}@keyframes gpu-center-electric{to{stroke-dashoffset:-30}}@keyframes gpu-center-float{50%{transform:translateY(-3px)}}
          .gpu-center-stage{display:flex;justify-content:space-between;gap:10px;color:#b3bac0;font-size:.7rem}.gpu-center-stage strong{color:#fff;white-space:nowrap}.gpu-center-progress{height:7px;border-radius:999px;overflow:hidden;background:#20242a}.gpu-center-progress i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#616c76,#fff);transition:width .5s ease}
          .gpu-center-data-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.gpu-center-data-grid span{min-width:0;border:1px solid #20242a;border-radius:10px;padding:8px;background:#0a0c0e}.gpu-center-data-grid small{display:block;color:#666f77;font-size:.5rem;font-weight:850;letter-spacing:.06em}.gpu-center-data-grid strong{display:block;margin-top:3px;color:#dfe3e6;font-size:.64rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.gpu-center-error{border:1px solid rgba(255,98,98,.28);border-radius:10px;background:rgba(255,98,98,.04);color:#d9aaaa;padding:9px;font-size:.64rem;line-height:1.45}.gpu-center-destroy{justify-self:start;min-height:40px;border:1px solid rgba(255,103,103,.42);border-radius:11px;padding:0 13px;background:rgba(116,22,22,.16);color:#ffd1d1;font-size:.64rem;font-weight:900;letter-spacing:.05em;cursor:pointer}.gpu-center-destroy:disabled{opacity:.5;cursor:wait}.gpu-center-empty{padding:35px 15px;text-align:center;color:#777f86;font-size:.76rem}.gpu-center-alert{margin:6px 14px;padding:10px;border:1px solid rgba(255,104,104,.25);border-radius:11px;color:#d6a5a5;background:rgba(255,70,70,.04);font-size:.67rem}
          @media(max-width:520px){.gpu-center-backdrop{padding:0}.gpu-center-shell{height:100dvh;width:100%;border-radius:0;border-left:0;border-right:0}.gpu-center-summary{grid-template-columns:repeat(3,minmax(0,1fr));padding-inline:10px}.gpu-center-data-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.gpu-center-list{padding-inline:10px}.gpu-center-machine{height:135px}.gpu-center-head{padding:14px 12px}}
          @media(prefers-reduced-motion:reduce){.gpu-center-machine svg,.gpu-center-circuit.live{animation:none}}
        `}</style>

        <header className="gpu-center-head">
          <div className="gpu-center-head-copy">
            <small>NAYLA COMPUTE</small>
            <h2>CENTRO GPU</h2>
          </div>
          <button type="button" className="gpu-center-close" onClick={onClose} aria-label="Cerrar Centro GPU">×</button>
        </header>

        <div className="gpu-center-summary">
          <span><small>GPU ACTIVAS</small><strong>{overview?.activeCount ?? '—'}</strong></span>
          <span><small>ACTIVO AHORA</small><strong>{money(overview?.totals.activeCostEstimate)}</strong></span>
          <span><small>HISTÓRICO</small><strong>{money(totalCost)}</strong></span>
        </div>

        <div className="gpu-center-tabs">
          <button type="button" className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>
            ACTIVAS · {overview?.activeCount || 0}
          </button>
          <button type="button" className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
            HISTORIAL · {overview?.history.length || 0}
          </button>
        </div>

        {error && <div className="gpu-center-alert">{error}</div>}

        <div className="gpu-center-list">
          {loading && !overview ? (
            <div className="gpu-center-empty">Leyendo las GPU de Nayla Compute…</div>
          ) : jobs.length === 0 ? (
            <div className="gpu-center-empty">
              {tab === 'active' ? 'No hay ninguna GPU trabajando en este momento.' : 'Todavía no hay trabajos GPU en el historial.'}
            </div>
          ) : jobs.map((job) => {
            const expanded = expandedId === job.id;
            return (
              <article key={job.id} className={'gpu-center-job ' + (job.active ? 'active-job' : '')}>
                <button type="button" className="gpu-center-job-button" onClick={() => setExpandedId(expanded ? null : job.id)}>
                  <span>
                    <span className="gpu-center-job-title">
                      <strong>{job.gpuName || 'GPU temporal'}</strong>
                      <i className={'gpu-center-pill ' + (job.active ? 'live' : '')}>{workloadLabel(job.workload)}</i>
                      <i className={'gpu-center-pill ' + (job.active ? 'live' : '')}>{statusLabel(job.status)}</i>
                    </span>
                    <span className="gpu-center-job-sub">
                      {providerLabel(job.backendProvider)} · {duration(job.elapsedSeconds)} · {localDate(job.startedAt || job.createdAt)}
                    </span>
                  </span>
                  <span className="gpu-center-job-cost">
                    <strong>{money(job.currentCostEstimate)}</strong>
                    <small>{job.active ? `${money(job.hourlyPrice)}/h` : job.destroyedAt ? 'GPU RETIRADA' : 'final'}</small>
                  </span>
                </button>
                {expanded && (
                  <JobDetails
                    job={job}
                    destroying={destroyingId === job.id}
                    onDestroy={(target) => void destroy(target)}
                  />
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
