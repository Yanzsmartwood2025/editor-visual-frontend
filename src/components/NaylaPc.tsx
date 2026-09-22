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
        <strong style={{ fontSize: '0.95rem', color: '#fff' }}>
          {value}{unit}
        </strong>
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
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
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

  useEffect(() => {
    if (!session || hydrated.current) return;
    hydrated.current = true;

    void (async () => {
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
    })();
  }, [session]);

  useEffect(() => {
    if (!session) return;
    setSaved(false);
    const timer = window.setTimeout(() => {
      void requestQuote(config);
    }, 420);
    return () => window.clearTimeout(timer);
  }, [config, requestQuote, session]);

  const selected = useMemo(
    () => quote?.cards.find((card) => card.id === selectedId) || quote?.cards[0] || null,
    [quote, selectedId]
  );

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
          <div style={{ fontSize: '0.68rem', color: '#777', letterSpacing: '0.16em', fontWeight: 800 }}>
            NAYLA
          </div>
          <div style={{ fontSize: '1.08rem', fontWeight: 900, letterSpacing: '0.08em' }}>
            PC
          </div>
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
            style={{
              width: 40,
              height: 40,
              border: 0,
              background: 'transparent',
              color: '#fff',
              fontSize: 28,
              lineHeight: 1,
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px clamp(14px, 4vw, 34px) 120px' }}>
        <div style={{ width: 'min(1040px, 100%)', margin: '0 auto' }}>
          <div
            style={{
              border: '1px solid #2b2b2b',
              borderRadius: 18,
              padding: 18,
              background: 'linear-gradient(180deg,#111,#090909)',
              marginBottom: 14,
            }}
          >
            <div style={{ fontSize: '1.25rem', fontWeight: 900, marginBottom: 6 }}>
              Arma tu computadora
            </div>
            <div style={{ color: '#999', fontSize: '0.8rem', lineHeight: 1.55 }}>
              Elige sistema, potencia y tiempo. Nayla consulta capacidad real disponible y calcula el precio sin crear ni cobrar ninguna máquina.
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
                <div style={{ color: '#777', fontSize: '0.6rem' }}>COTIZAR</div>
                <strong style={{ fontSize: '0.86rem' }}>SIN CARGO</strong>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(285px,1fr))', gap: 12, alignItems: 'start' }}>
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ border: '1px solid #292929', borderRadius: 16, padding: 14, background: '#0b0b0b' }}>
                <div style={{ fontSize: '0.7rem', color: '#888', fontWeight: 850, marginBottom: 10 }}>
                  1 · SISTEMA OPERATIVO
                </div>
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
                        <div style={{ fontWeight: 900, fontSize: '0.82rem' }}>
                          {family === 'linux' ? 'LINUX' : 'WINDOWS'}
                        </div>
                        <div style={{ color: '#777', fontSize: '0.6rem', marginTop: 4 }}>
                          {family === 'linux' ? 'Ubuntu · Debian · más' : 'Windows Server · RDP'}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {config.osFamily === 'windows' && (
                  <div style={{ marginTop: 9, color: '#b6a47b', fontSize: '0.63rem', lineHeight: 1.45 }}>
                    La licencia oficial de Windows tiene un cargo adicional. Hasta integrar esa tarifa exacta, la cifra mostrada abajo es solo el cómputo base.
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
                    <RangeRow
                      label="VRAM mínima"
                      value={config.minGpuVramGb}
                      min={4}
                      max={48}
                      step={4}
                      unit=" GB"
                      onChange={(minGpuVramGb) => patch({ minGpuVramGb })}
                    />
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ border: '1px solid #292929', borderRadius: 16, padding: 14, background: '#0b0b0b' }}>
                <div style={{ fontSize: '0.7rem', color: '#888', fontWeight: 850, marginBottom: 10 }}>
                  6 · FORMA DE USO
                </div>
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
                    <div style={{ color: '#777', fontSize: '0.59rem', marginTop: 4 }}>Nayla destruye el cómputo al terminar.</div>
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
                    <RangeRow
                      label="Duración"
                      value={config.durationHours}
                      min={1}
                      max={24}
                      unit=" h"
                      onChange={(durationHours) => patch({ durationHours })}
                    />
                  </div>
                ) : (
                  <div style={{ marginTop: 10, color: '#8a8a8a', fontSize: '0.63rem', lineHeight: 1.5 }}>
                    Una PC permanente sigue reservando CPU, RAM, disco e IP aunque se apague. Para detener el cobro hay que eliminar la máquina, no solo apagarla.
                  </div>
                )}
              </div>

              <div style={{ border: '1px solid #292929', borderRadius: 16, padding: 14, background: '#0b0b0b' }}>
                <div style={{ fontSize: '0.7rem', color: '#888', fontWeight: 850, marginBottom: 9 }}>
                  ARCHIVOS Y DISCO
                </div>
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
                  <div style={{ fontSize: '0.7rem', color: '#888', fontWeight: 850 }}>
                    OFERTAS EN VIVO
                  </div>
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
                              <div style={{ fontSize: '0.78rem', fontWeight: 900 }}>
                                {card.cpu} vCPU · {card.ramGb} GB · {card.diskGb} GB
                              </div>
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
                            <div style={{ color: '#777', fontSize: '0.58rem', marginTop: 7 }}>
                              {config.durationHours} h ≈ {money(card.estimatedSessionPrice)}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {quote?.pricing?.note && (
                <div style={{ color: '#666', fontSize: '0.61rem', lineHeight: 1.5 }}>
                  {quote.pricing.note}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9810,
          borderTop: '1px solid #2d2d2d',
          background: 'rgba(7,7,7,.97)',
          backdropFilter: 'blur(18px)',
          padding: '10px 14px calc(10px + env(safe-area-inset-bottom))',
        }}
      >
        <div style={{ width: 'min(1040px,100%)', margin: '0 auto', display: 'flex', gap: 9, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: '#777', fontSize: '0.58rem' }}>{saved ? 'CONFIGURACIÓN GUARDADA' : 'TU PC'}</div>
            <div style={{ fontSize: '0.76rem', fontWeight: 850, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selected
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
              style={{
                minHeight: 42,
                borderRadius: 999,
                padding: '0 14px',
                border: '1px solid #444',
                background: '#151515',
                color: '#fff',
                fontSize: '0.64rem',
                fontWeight: 900,
                cursor: saving ? 'wait' : 'pointer',
              }}
            >
              {saving ? 'GUARDANDO…' : 'GUARDAR'}
            </button>
            <button
              type="button"
              disabled
              style={{
                minHeight: 42,
                borderRadius: 999,
                padding: '0 16px',
                border: '1px solid #383838',
                background: '#1a1a1a',
                color: '#737373',
                fontSize: '0.64rem',
                fontWeight: 900,
                cursor: 'not-allowed',
              }}
            >
              CREAR PC · SIGUIENTE FASE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
