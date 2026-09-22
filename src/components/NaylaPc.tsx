import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { firebaseHeaders } from '../lib/apiClient';
import type { FirebaseSession } from '../lib/firebaseClient';

type PcConfig = {
  osFamily: 'linux' | 'windows';
  cpu: number;
  ramGb: number;
  diskGb: number;
  gpuEnabled: boolean;
  minGpuVramGb: number;
  billingMode: 'hourly' | 'monthly';
  durationHours: number;
  autoDestroy: boolean;
};

type PcCard = {
  id: string;
  cpu: number;
  ramGb: number;
  diskGb: number;
  gpuName?: string;
  gpuVramGb?: number;
  region: string;
  hourlyPrice: number;
  monthlyPrice: number;
  estimatedSessionPrice: number;
  available: boolean;
  recommended: boolean;
  billingCapHours: number;
};

type PcQuote = {
  ready: boolean;
  cards: PcCard[];
  networksConfigured: number;
  networksEligible: number;
  networksReachable: number;
  generatedAt: string;
  os: {
    linux: { available: boolean; examples: string[] };
    windows: { available: boolean; examples: string[]; licenseIncluded: false };
  };
  pricing: {
    status: 'preview';
    complete: boolean;
    note: string;
  };
};

type PcInstance = {
  id: string;
  osFamily: 'linux' | 'windows';
  cpu: number;
  ramGb: number;
  diskGb: number;
  gpuEnabled: boolean;
  gpuName?: string;
  gpuVramGb?: number;
  billingMode: 'hourly' | 'monthly';
  durationHours: number;
  autoDestroy: boolean;
  status:
    | 'provisioning'
    | 'running'
    | 'stopped'
    | 'rebooting'
    | 'snapshotting'
    | 'terminating'
    | 'terminated'
    | 'error';
  mainIp?: string;
  hourlyPrice: number;
  monthlyPrice: number;
  sessionPrice: number;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
  terminatedAt?: string | null;
};

type PcSnapshot = {
  id: string;
  status: 'pending' | 'available' | 'restoring' | 'deleting' | 'deleted' | 'error';
  osFamily: 'linux' | 'windows';
  osName?: string;
  cpu: number;
  ramGb: number;
  diskGb: number;
  gpuEnabled: boolean;
  gpuName?: string;
  gpuVramGb?: number;
  sizeBytes?: number;
  storageMonthlyUsd?: number;
  createdAt: string;
  readyAt?: string | null;
};

const DEFAULT_CONFIG: PcConfig = {
  osFamily: 'linux',
  cpu: 2,
  ramGb: 4,
  diskGb: 80,
  gpuEnabled: false,
  minGpuVramGb: 8,
  billingMode: 'hourly',
  durationHours: 1,
  autoDestroy: true,
};

const money = (value: number) =>
  '$' + Number(value || 0).toFixed(value >= 1 ? 2 : 3);

const dateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-EC', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const statusLabel = (status: PcInstance['status']) => {
  const labels: Record<PcInstance['status'], string> = {
    provisioning: 'INICIANDO',
    running: 'ENCENDIDA',
    stopped: 'APAGADA',
    rebooting: 'REINICIANDO',
    snapshotting: 'GUARDANDO',
    terminating: 'ELIMINANDO',
    terminated: 'ELIMINADA',
    error: 'ERROR',
  };
  return labels[status];
};

function RangeRow({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div style={{ border: '1px solid #292929', borderRadius: 15, padding: '13px 14px', background: '#090909' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
        <span style={{ fontSize: '0.72rem', color: '#aaa', fontWeight: 800 }}>{label}</span>
        <strong style={{ fontSize: '0.95rem', color: '#fff' }}>{value}{unit}</strong>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ width: '100%', marginTop: 10, accentColor: '#fff' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.56rem', color: '#555' }}>
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );
}

export default function NaylaPc({
  session,
  onClose,
}: {
  session: FirebaseSession | null;
  onClose: () => void;
}) {
  const [config, setConfig] = useState<PcConfig>(DEFAULT_CONFIG);
  const [quote, setQuote] = useState<PcQuote | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [activeInstance, setActiveInstance] = useState<PcInstance | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<PcSnapshot | null>(null);
  const [provisioningAllowed, setProvisioningAllowed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [instanceLoading, setInstanceLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [saved, setSaved] = useState(false);
  const [confirmCreate, setConfirmCreate] = useState(false);
  const [confirmSaveDestroy, setConfirmSaveDestroy] = useState(false);
  const [confirmDestroy, setConfirmDestroy] = useState(false);
  const [confirmResume, setConfirmResume] = useState(false);
  const [error, setError] = useState('');
  const hydrated = useRef(false);

  const requestQuote = useCallback(async (next: PcConfig) => {
    if (!session) {
      setError('Inicia sesión para configurar tu PC.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/pc/quote', {
        method: 'POST',
        headers: firebaseHeaders(session, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(next),
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.error) {
        throw new Error(payload.error || 'No se pudo cotizar Nayla PC.');
      }

      const nextQuote = payload.quote as PcQuote;
      setQuote(nextQuote);
      setSelectedId((current) => {
        if (current && nextQuote.cards.some((card) => card.id === current)) {
          return current;
        }
        return nextQuote.cards.find((card) => card.recommended)?.id || nextQuote.cards[0]?.id || '';
      });
    } catch (cause) {
      setQuote(null);
      setError(cause instanceof Error ? cause.message : 'No se pudo cotizar Nayla PC.');
    } finally {
      setLoading(false);
    }
  }, [session]);

  const loadActiveInstance = useCallback(async () => {
    if (!session) return;
    setInstanceLoading(true);
    try {
      const response = await fetch('/api/pc/instances', {
        headers: firebaseHeaders(session),
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.error) {
        throw new Error(payload.error || 'No se pudo consultar tu PC.');
      }
      setActiveInstance(payload.instance || null);
      setProvisioningAllowed(payload.provisioningAllowed === true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo consultar tu PC.');
    } finally {
      setInstanceLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!session || hydrated.current) return;
    hydrated.current = true;

    void (async () => {
      await Promise.all([
        loadActiveInstance(),
        (async () => {
          try {
            const response = await fetch('/api/pc/config', {
              headers: firebaseHeaders(session),
              cache: 'no-store',
            });
            const payload = await response.json().catch(() => ({}));
            if (response.ok && payload.profile) {
              const p = payload.profile;
              setConfig({
                osFamily: p.osFamily === 'windows' ? 'windows' : 'linux',
                cpu: Number(p.cpu) || 2,
                ramGb: Number(p.ramGb) || 4,
                diskGb: Number(p.diskGb) || 80,
                gpuEnabled: Boolean(p.gpuEnabled),
                minGpuVramGb: Number(p.minGpuVramGb) || 8,
                billingMode: p.billingMode === 'monthly' ? 'monthly' : 'hourly',
                durationHours: Number(p.durationHours) || 1,
                autoDestroy: p.autoDestroy !== false,
              });
            }
          } catch {
            // La cotización sigue funcionando aunque aún no exista un perfil guardado.
          }
        })(),
      ]);
    })();
  }, [loadActiveInstance, session]);

  useEffect(() => {
    if (!session) return;
    setSaved(false);
    const timer = window.setTimeout(() => {
      void requestQuote(config);
    }, 420);
    return () => window.clearTimeout(timer);
  }, [config, requestQuote, session]);

  useEffect(() => {
    if (!session || !activeInstance || activeInstance.status === 'terminated') return;
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const response = await fetch('/api/pc/instances/' + encodeURIComponent(activeInstance.id), {
            headers: firebaseHeaders(session),
            cache: 'no-store',
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || payload.error) return;
          const next = payload.instance as PcInstance;
          setActiveInstance(next.status === 'terminated' ? null : next);
        } catch {
          // La siguiente sincronización volverá a intentarlo.
        }
      })();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [activeInstance?.id, activeInstance?.status, session]);

  const selected = useMemo(
    () => quote?.cards.find((card) => card.id === selectedId) || quote?.cards[0] || null,
    [quote, selectedId]
  );

  const creationBlockedReason = useMemo(() => {
    if (activeInstance) return 'Ya tienes una PC activa';
    if (!provisioningAllowed) return 'Piloto privado: creación real solo para administrador';
    if (!selected || !quote?.ready) return 'Sin oferta compatible';
    if (config.osFamily === 'windows') return 'Windows: licencia pendiente';
    if (config.gpuEnabled) return 'GPU: imagen gráfica pendiente';
    if (!quote.pricing.complete) return 'Precio incompleto';
    return '';
  }, [activeInstance, config.gpuEnabled, config.osFamily, provisioningAllowed, quote, selected]);

  const canCreate = !creationBlockedReason && Boolean(session && selected);

  const saveConfig = useCallback(async () => {
    if (!session) return;
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const response = await fetch('/api/pc/config', {
        method: 'PUT',
        headers: firebaseHeaders(session, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(config),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.error) {
        throw new Error(payload.error || 'No se pudo guardar la configuración.');
      }
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la configuración.');
    } finally {
      setSaving(false);
    }
  }, [config, session]);

  const createPc = useCallback(async () => {
    if (!session || !selected || !canCreate) return;
    setCreating(true);
    setError('');
    try {
      const response = await fetch('/api/pc/instances', {
        method: 'POST',
        headers: firebaseHeaders(session, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          config,
          selectionId: selected.id,
          confirmation: {
            accepted: true,
            hourlyPrice: selected.hourlyPrice,
            monthlyPrice: selected.monthlyPrice,
            sessionPrice: selected.estimatedSessionPrice,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || payload.error) {
        if (payload.refreshRequired) {
          void requestQuote(config);
        }
        throw new Error(payload.error || 'No se pudo crear Nayla PC.');
      }

      setActiveInstance(payload.instance as PcInstance);
      setConfirmCreate(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo crear Nayla PC.');
    } finally {
      setCreating(false);
    }
  }, [canCreate, config, requestQuote, selected, session]);

  const runInstanceAction = useCallback(async (
    action: 'start' | 'stop' | 'reboot' | 'destroy'
  ) => {
    if (!session || !activeInstance) return;
    setActionLoading(action);
    setError('');
    try {
      const response = await fetch('/api/pc/instances/' + encodeURIComponent(activeInstance.id), {
        method: 'POST',
        headers: firebaseHeaders(session, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          action,
          confirmDestroy: action === 'destroy',
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.error) {
        if (payload.instance?.status === 'terminated') {
          setActiveInstance(null);
        }
        throw new Error(payload.error || 'No se pudo controlar Nayla PC.');
      }

      const next = payload.instance as PcInstance;
      setActiveInstance(next.status === 'terminated' ? null : next);
      if (action === 'destroy') setConfirmDestroy(false);
      if (payload.billingWarning) setError(payload.billingWarning);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo controlar Nayla PC.');
    } finally {
      setActionLoading('');
    }
  }, [activeInstance, session]);

  const patch = (next: Partial<PcConfig>) =>
    setConfig((current) => ({ ...current, ...next }));

  return (
    <div
      data-testid="nayla-pc"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9800,
        width: '100dvw',
        height: '100dvh',
        background: '#050505',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          minHeight: 68,
          padding: '10px 14px',
          borderBottom: '1px solid #242424',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          background: '#080808',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.68rem', color: '#777', letterSpacing: '0.16em', fontWeight: 800 }}>NAYLA</div>
          <div style={{ fontSize: '1.08rem', fontWeight: 900, letterSpacing: '0.08em' }}>PC</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <button
            type="button"
            onClick={() => void requestQuote(config)}
            disabled={loading}
            style={{
              border: '1px solid #343434',
              background: '#111',
              color: loading ? '#777' : '#fff',
              borderRadius: 999,
              minHeight: 38,
              padding: '0 14px',
              fontSize: '0.7rem',
              fontWeight: 800,
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            {loading ? 'COTIZANDO…' : 'ACTUALIZAR'}
          </button>
          <button
            type="button"
            aria-label="Cerrar Nayla PC"
            onClick={onClose}
            style={{ width: 40, height: 40, border: 0, background: 'transparent', color: '#fff', fontSize: 28, lineHeight: 1, cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px clamp(14px, 4vw, 34px) 120px' }}>
        <div style={{ width: 'min(1040px, 100%)', margin: '0 auto' }}>
          {activeInstance && (
            <div style={{ border: '1px solid #3b3b3b', borderRadius: 18, padding: 16, background: 'linear-gradient(180deg,#151515,#090909)', marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                <div>
                  <div style={{ color: '#777', fontSize: '0.6rem', letterSpacing: '0.12em', fontWeight: 850 }}>TU COMPUTADORA</div>
                  <div style={{ marginTop: 5, fontSize: '1.05rem', fontWeight: 900 }}>
                    {activeInstance.cpu} vCPU · {activeInstance.ramGb} GB RAM · {activeInstance.diskGb} GB
                  </div>
                  <div style={{ color: '#888', fontSize: '0.64rem', marginTop: 5 }}>
                    {activeInstance.mainIp ? 'IP ' + activeInstance.mainIp : 'Asignando red…'}
                  </div>
                </div>
                <div style={{ border: '1px solid #3a3a3a', borderRadius: 999, padding: '7px 10px', fontSize: '0.58rem', fontWeight: 900, color: activeInstance.status === 'running' ? '#fff' : '#aaa' }}>
                  {statusLabel(activeInstance.status)}
                </div>
              </div>

              <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8 }}>
                <div style={{ border: '1px solid #292929', borderRadius: 12, padding: 10 }}>
                  <div style={{ color: '#666', fontSize: '0.55rem' }}>PRECIO</div>
                  <strong style={{ fontSize: '0.75rem' }}>
                    {activeInstance.billingMode === 'monthly'
                      ? money(activeInstance.monthlyPrice) + '/mes'
                      : money(activeInstance.hourlyPrice) + '/h'}
                  </strong>
                </div>
                <div style={{ border: '1px solid #292929', borderRadius: 12, padding: 10 }}>
                  <div style={{ color: '#666', fontSize: '0.55rem' }}>
                    {activeInstance.autoDestroy ? 'AUTODESTRUCCIÓN' : 'MODO'}
                  </div>
                  <strong style={{ fontSize: '0.75rem' }}>
                    {activeInstance.autoDestroy ? dateTime(activeInstance.expiresAt) : 'PERMANENTE'}
                  </strong>
                </div>
              </div>

              <div style={{ marginTop: 11, display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {activeInstance.status === 'stopped' && (
                  <button
                    type="button"
                    disabled={Boolean(actionLoading)}
                    onClick={() => void runInstanceAction('start')}
                    style={{ border: '1px solid #444', borderRadius: 999, padding: '9px 13px', background: '#fff', color: '#000', fontWeight: 900, fontSize: '0.62rem', cursor: actionLoading ? 'wait' : 'pointer' }}
                  >
                    {actionLoading === 'start' ? 'ENCENDIENDO…' : 'ENCENDER'}
                  </button>
                )}
                {activeInstance.status === 'running' && (
                  <>
                    <button
                      type="button"
                      disabled={Boolean(actionLoading)}
                      onClick={() => void runInstanceAction('reboot')}
                      style={{ border: '1px solid #3a3a3a', borderRadius: 999, padding: '9px 13px', background: '#111', color: '#fff', fontWeight: 900, fontSize: '0.62rem', cursor: actionLoading ? 'wait' : 'pointer' }}
                    >
                      {actionLoading === 'reboot' ? 'REINICIANDO…' : 'REINICIAR'}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(actionLoading)}
                      onClick={() => void runInstanceAction('stop')}
                      style={{ border: '1px solid #3a3a3a', borderRadius: 999, padding: '9px 13px', background: '#111', color: '#aaa', fontWeight: 900, fontSize: '0.62rem', cursor: actionLoading ? 'wait' : 'pointer' }}
                    >
                      {actionLoading === 'stop' ? 'APAGANDO…' : 'APAGAR · SIGUE COBRANDO'}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  disabled={Boolean(actionLoading)}
                  onClick={() => setConfirmDestroy(true)}
                  style={{ border: '1px solid #4a2e2e', borderRadius: 999, padding: '9px 13px', background: '#160b0b', color: '#d7b7b7', fontWeight: 900, fontSize: '0.62rem', cursor: actionLoading ? 'wait' : 'pointer' }}
                >
                  ELIMINAR PC
                </button>
              </div>
              <div style={{ marginTop: 10, color: '#666', fontSize: '0.59rem', lineHeight: 1.45 }}>
                Apagar conserva CPU, RAM, disco e IP reservados, por eso el proveedor continúa cobrando hasta eliminar la instancia.
              </div>
            </div>
          )}

          <div style={{ border: '1px solid #2b2b2b', borderRadius: 18, padding: 18, background: 'linear-gradient(180deg,#111,#090909)', marginBottom: 14 }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, marginBottom: 6 }}>Arma tu computadora</div>
            <div style={{ color: '#999', fontSize: '0.8rem', lineHeight: 1.55 }}>
              Elige sistema, potencia y tiempo. Cotizar no crea ni cobra ninguna máquina. La creación real está en piloto privado y solo ocurre después de una confirmación final.
            </div>
            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
              <div style={{ border: '1px solid #292929', borderRadius: 12, padding: 10, background: '#070707' }}>
                <div style={{ color: '#777', fontSize: '0.6rem' }}>REDES CONECTADAS</div>
                <strong style={{ fontSize: '0.86rem' }}>{quote?.networksConfigured ?? '—'}</strong>
              </div>
              <div style={{ border: '1px solid #292929', borderRadius: 12, padding: 10, background: '#070707' }}>
                <div style={{ color: '#777', fontSize: '0.6rem' }}>APTAS PARA PC</div>
                <strong style={{ fontSize: '0.86rem' }}>{quote?.networksEligible ?? '—'}</strong>
              </div>
              <div style={{ border: '1px solid #292929', borderRadius: 12, padding: 10, background: '#070707' }}>
                <div style={{ color: '#777', fontSize: '0.6rem' }}>ESTADO</div>
                <strong style={{ fontSize: '0.86rem' }}>{instanceLoading ? 'REVISANDO…' : activeInstance ? '1 ACTIVA' : 'LIBRE'}</strong>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(285px,1fr))', gap: 12, alignItems: 'start' }}>
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ border: '1px solid #292929', borderRadius: 16, padding: 14, background: '#0b0b0b' }}>
                <div style={{ fontSize: '0.7rem', color: '#888', fontWeight: 850, marginBottom: 10 }}>1 · SISTEMA OPERATIVO</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {(['linux', 'windows'] as const).map((family) => {
                    const active = config.osFamily === family;
                    const available = quote?.os?.[family]?.available ?? true;
                    return (
                      <button
                        key={family}
                        type="button"
                        onClick={() => available && patch({ osFamily: family })}
                        style={{
                          border: active ? '1px solid #fff' : '1px solid #303030',
                          borderRadius: 13,
                          background: active ? '#181818' : '#090909',
                          color: available ? '#fff' : '#666',
                          padding: '12px 10px',
                          textAlign: 'left',
                          cursor: available ? 'pointer' : 'not-allowed',
                        }}
                      >
                        <div style={{ fontWeight: 900, fontSize: '0.82rem' }}>{family === 'linux' ? 'LINUX' : 'WINDOWS'}</div>
                        <div style={{ color: '#777', fontSize: '0.6rem', marginTop: 4 }}>
                          {family === 'linux' ? 'Ubuntu · Debian · más' : 'Windows Server · RDP'}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {config.osFamily === 'windows' && (
                  <div style={{ marginTop: 9, color: '#b6a47b', fontSize: '0.63rem', lineHeight: 1.45 }}>
                    Windows se puede cotizar, pero la creación real permanece bloqueada hasta integrar el cargo exacto de licencia.
                  </div>
                )}
              </div>

              <RangeRow label="2 · CPU" value={config.cpu} min={1} max={32} unit=" vCPU" onChange={(cpu) => patch({ cpu })} />
              <RangeRow label="3 · MEMORIA RAM" value={config.ramGb} min={1} max={128} unit=" GB" onChange={(ramGb) => patch({ ramGb })} />
              <RangeRow label="4 · DISCO" value={config.diskGb} min={25} max={1000} step={5} unit=" GB" onChange={(diskGb) => patch({ diskGb })} />

              <div style={{ border: '1px solid #292929', borderRadius: 15, padding: 14, background: '#090909' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#aaa', fontWeight: 800 }}>5 · GPU</div>
                    <div style={{ color: '#666', fontSize: '0.6rem', marginTop: 3 }}>Opcional para 3D, IA, video o trabajo gráfico.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => patch({ gpuEnabled: !config.gpuEnabled })}
                    style={{
                      border: config.gpuEnabled ? '1px solid #fff' : '1px solid #333',
                      background: config.gpuEnabled ? '#fff' : '#111',
                      color: config.gpuEnabled ? '#000' : '#aaa',
                      borderRadius: 999,
                      padding: '7px 12px',
                      fontSize: '0.64rem',
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    {config.gpuEnabled ? 'SÍ' : 'NO'}
                  </button>
                </div>
                {config.gpuEnabled && (
                  <div style={{ marginTop: 12 }}>
                    <RangeRow label="VRAM mínima" value={config.minGpuVramGb} min={4} max={48} step={4} unit=" GB" onChange={(minGpuVramGb) => patch({ minGpuVramGb })} />
                    <div style={{ marginTop: 8, color: '#b6a47b', fontSize: '0.6rem', lineHeight: 1.45 }}>
                      GPU ya cotiza en vivo. La creación queda bloqueada hasta usar una imagen con controladores gráficos verificados.
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ border: '1px solid #292929', borderRadius: 16, padding: 14, background: '#0b0b0b' }}>
                <div style={{ fontSize: '0.7rem', color: '#888', fontWeight: 850, marginBottom: 10 }}>6 · FORMA DE USO</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => patch({ billingMode: 'hourly', autoDestroy: true })}
                    style={{
                      border: config.billingMode === 'hourly' ? '1px solid #fff' : '1px solid #303030',
                      borderRadius: 13,
                      background: config.billingMode === 'hourly' ? '#181818' : '#090909',
                      color: '#fff',
                      padding: 11,
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <strong style={{ fontSize: '0.76rem' }}>POR HORAS</strong>
                    <div style={{ color: '#777', fontSize: '0.59rem', marginTop: 4 }}>Vencimiento guardado y destrucción desde servidor.</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => patch({ billingMode: 'monthly', autoDestroy: false })}
                    style={{
                      border: config.billingMode === 'monthly' ? '1px solid #fff' : '1px solid #303030',
                      borderRadius: 13,
                      background: config.billingMode === 'monthly' ? '#181818' : '#090909',
                      color: '#fff',
                      padding: 11,
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <strong style={{ fontSize: '0.76rem' }}>PERMANENTE</strong>
                    <div style={{ color: '#777', fontSize: '0.59rem', marginTop: 4 }}>Conserva la VM y su disco.</div>
                  </button>
                </div>

                {config.billingMode === 'hourly' ? (
                  <div style={{ marginTop: 11 }}>
                    <RangeRow label="Duración" value={config.durationHours} min={1} max={24} unit=" h" onChange={(durationHours) => patch({ durationHours })} />
                  </div>
                ) : (
                  <div style={{ marginTop: 10, color: '#8a8a8a', fontSize: '0.63rem', lineHeight: 1.5 }}>
                    Una PC permanente sigue reservando CPU, RAM, disco e IP aunque se apague. Para detener el cobro hay que eliminar la máquina.
                  </div>
                )}
              </div>

              <div style={{ border: '1px solid #292929', borderRadius: 16, padding: 14, background: '#0b0b0b' }}>
                <div style={{ fontSize: '0.7rem', color: '#888', fontWeight: 850, marginBottom: 9 }}>ARCHIVOS Y DISCO</div>
                <div style={{ color: '#999', fontSize: '0.65rem', lineHeight: 1.55 }}>
                  El disco seleccionado pertenece a la PC. La Bóveda de Cloudflare R2 se mantiene separada para archivos persistentes, proyectos y respaldos.
                </div>
              </div>

              {error && (
                <div style={{ border: '1px solid #463131', borderRadius: 14, padding: 13, color: '#ddd', background: '#130b0b', fontSize: '0.7rem', lineHeight: 1.5 }}>
                  {error}
                </div>
              )}

              <div style={{ border: '1px solid #292929', borderRadius: 16, padding: 14, background: '#080808' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontSize: '0.7rem', color: '#888', fontWeight: 850 }}>OFERTAS EN VIVO</div>
                  <div style={{ color: '#666', fontSize: '0.58rem' }}>
                    {loading ? 'ACTUALIZANDO…' : (quote?.cards.length ?? 0) + ' OPCIONES'}
                  </div>
                </div>

                {!loading && !quote?.cards.length ? (
                  <div style={{ color: '#777', fontSize: '0.68rem', lineHeight: 1.5, textAlign: 'center', padding: '18px 8px' }}>
                    No encontramos una máquina que cumpla esta combinación. Baja algún requisito o pulsa ACTUALIZAR.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {quote?.cards.slice(0, 8).map((card) => {
                      const active = card.id === selectedId;
                      const price = config.billingMode === 'monthly'
                        ? money(card.monthlyPrice) + '/mes'
                        : money(card.hourlyPrice) + '/h';
                      return (
                        <button
                          key={card.id}
                          type="button"
                          onClick={() => setSelectedId(card.id)}
                          style={{
                            width: '100%',
                            border: active ? '1px solid #fff' : '1px solid #292929',
                            borderRadius: 14,
                            background: active ? '#171717' : '#0a0a0a',
                            color: '#fff',
                            padding: 12,
                            textAlign: 'left',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                            <div>
                              <div style={{ fontSize: '0.78rem', fontWeight: 900 }}>{card.cpu} vCPU · {card.ramGb} GB · {card.diskGb} GB</div>
                              <div style={{ marginTop: 4, color: '#777', fontSize: '0.6rem', lineHeight: 1.45 }}>
                                {card.region}
                                {card.gpuName ? ' · ' + card.gpuName + (card.gpuVramGb ? ' · ' + card.gpuVramGb + ' GB VRAM' : '') : ''}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <strong style={{ fontSize: '0.86rem' }}>{price}</strong>
                              {card.recommended && <div style={{ color: '#aaa', fontSize: '0.52rem', marginTop: 3 }}>MEJOR PRECIO</div>}
                            </div>
                          </div>
                          {config.billingMode === 'hourly' && (
                            <div style={{ color: '#777', fontSize: '0.58rem', marginTop: 7 }}>{config.durationHours} h ≈ {money(card.estimatedSessionPrice)}</div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {quote?.pricing?.note && (
                <div style={{ color: '#666', fontSize: '0.61rem', lineHeight: 1.5 }}>{quote.pricing.note}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 9810, borderTop: '1px solid #2d2d2d', background: 'rgba(7,7,7,.97)', backdropFilter: 'blur(18px)', padding: '10px 14px calc(10px + env(safe-area-inset-bottom))' }}>
        <div style={{ width: 'min(1040px,100%)', margin: '0 auto', display: 'flex', gap: 9, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: '#777', fontSize: '0.58rem' }}>{saved ? 'CONFIGURACIÓN GUARDADA' : activeInstance ? 'PC ACTIVA' : 'TU PC'}</div>
            <div style={{ fontSize: '0.76rem', fontWeight: 850, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeInstance
                ? statusLabel(activeInstance.status) + (activeInstance.mainIp ? ' · ' + activeInstance.mainIp : '')
                : selected
                  ? config.billingMode === 'monthly'
                    ? money(selected.monthlyPrice) + '/mes'
                    : money(selected.hourlyPrice) + '/h · ' + config.durationHours + ' h ≈ ' + money(selected.estimatedSessionPrice)
                  : 'Sin oferta compatible'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => void saveConfig()}
              disabled={saving}
              style={{ minHeight: 42, borderRadius: 999, padding: '0 14px', border: '1px solid #444', background: '#151515', color: '#fff', fontSize: '0.64rem', fontWeight: 900, cursor: saving ? 'wait' : 'pointer' }}
            >
              {saving ? 'GUARDANDO…' : 'GUARDAR'}
            </button>
            <button
              type="button"
              onClick={() => canCreate && setConfirmCreate(true)}
              disabled={!canCreate || creating}
              title={creationBlockedReason || 'Crear una computadora real'}
              style={{
                minHeight: 42,
                borderRadius: 999,
                padding: '0 16px',
                border: canCreate ? '1px solid #fff' : '1px solid #383838',
                background: canCreate ? '#fff' : '#1a1a1a',
                color: canCreate ? '#000' : '#737373',
                fontSize: '0.64rem',
                fontWeight: 900,
                cursor: canCreate ? 'pointer' : 'not-allowed',
              }}
            >
              {creating ? 'CREANDO…' : canCreate ? 'CREAR PC' : activeInstance ? 'PC ACTIVA' : 'CREACIÓN BLOQUEADA'}
            </button>
          </div>
        </div>
      </div>

      {confirmCreate && selected && (
        <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 9900, background: 'rgba(0,0,0,.82)', display: 'grid', placeItems: 'center', padding: 18 }}>
          <div style={{ width: 'min(460px,100%)', border: '1px solid #3b3b3b', borderRadius: 20, background: '#0b0b0b', padding: 18, boxShadow: '0 24px 80px rgba(0,0,0,.55)' }}>
            <div style={{ fontSize: '1rem', fontWeight: 900 }}>Confirmar creación real</div>
            <div style={{ color: '#999', fontSize: '0.68rem', lineHeight: 1.55, marginTop: 8 }}>
              Al confirmar, Nayla solicita una máquina real y el cobro del proveedor comienza. Antes de crear, el servidor vuelve a validar disponibilidad y precio.
            </div>
            <div style={{ marginTop: 12, border: '1px solid #292929', borderRadius: 14, padding: 12, background: '#070707' }}>
              <div style={{ fontWeight: 900, fontSize: '0.82rem' }}>{selected.cpu} vCPU · {selected.ramGb} GB RAM · {selected.diskGb} GB</div>
              <div style={{ color: '#777', fontSize: '0.62rem', marginTop: 5 }}>{selected.region} · Linux</div>
              <div style={{ marginTop: 10, fontSize: '0.92rem', fontWeight: 900 }}>
                {config.billingMode === 'monthly'
                  ? money(selected.monthlyPrice) + '/mes'
                  : config.durationHours + ' h ≈ ' + money(selected.estimatedSessionPrice)}
              </div>
            </div>
            {config.billingMode === 'hourly' && (
              <div style={{ color: '#aaa', fontSize: '0.64rem', lineHeight: 1.5, marginTop: 10 }}>
                El vencimiento se guarda en servidor y Nayla eliminará la instancia cuando termine el tiempo contratado.
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" disabled={creating} onClick={() => setConfirmCreate(false)} style={{ minHeight: 40, borderRadius: 999, border: '1px solid #3a3a3a', background: '#111', color: '#fff', padding: '0 14px', fontWeight: 850, fontSize: '0.64rem', cursor: 'pointer' }}>CANCELAR</button>
              <button type="button" disabled={creating} onClick={() => void createPc()} style={{ minHeight: 40, borderRadius: 999, border: '1px solid #fff', background: '#fff', color: '#000', padding: '0 15px', fontWeight: 900, fontSize: '0.64rem', cursor: creating ? 'wait' : 'pointer' }}>
                {creating ? 'CREANDO…' : 'CONFIRMAR Y CREAR'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDestroy && activeInstance && (
        <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 9900, background: 'rgba(0,0,0,.82)', display: 'grid', placeItems: 'center', padding: 18 }}>
          <div style={{ width: 'min(430px,100%)', border: '1px solid #4a2e2e', borderRadius: 20, background: '#0d0808', padding: 18 }}>
            <div style={{ fontSize: '1rem', fontWeight: 900 }}>Eliminar esta PC</div>
            <div style={{ color: '#bbb', fontSize: '0.68rem', lineHeight: 1.55, marginTop: 8 }}>
              Esto detiene el cobro de cómputo, pero también elimina de forma irreversible el disco de la máquina y su IP. Los archivos que quieras conservar deben estar respaldados fuera de la VM.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" disabled={Boolean(actionLoading)} onClick={() => setConfirmDestroy(false)} style={{ minHeight: 40, borderRadius: 999, border: '1px solid #3a3a3a', background: '#111', color: '#fff', padding: '0 14px', fontWeight: 850, fontSize: '0.64rem', cursor: 'pointer' }}>CANCELAR</button>
              <button type="button" disabled={Boolean(actionLoading)} onClick={() => void runInstanceAction('destroy')} style={{ minHeight: 40, borderRadius: 999, border: '1px solid #6a3d3d', background: '#3b1111', color: '#fff', padding: '0 15px', fontWeight: 900, fontSize: '0.64rem', cursor: actionLoading ? 'wait' : 'pointer' }}>
                {actionLoading === 'destroy' ? 'ELIMINANDO…' : 'ELIMINAR DEFINITIVAMENTE'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
