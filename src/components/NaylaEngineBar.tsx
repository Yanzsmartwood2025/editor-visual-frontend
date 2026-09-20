import React, { useEffect, useMemo, useState } from 'react';
import type { FirebaseSession } from '../lib/firebaseClient';
import { firebaseHeaders } from '../lib/apiClient';
import type { NaylaEngineMode } from '../lib/naylaSystemCatalog';

type CloudItem = {
  id: 'image' | 'video' | 'audio' | '3d';
  label: string;
  description: string;
  configured: boolean;
  price: {
    status: 'pending' | 'configured';
    amountUsd: number | null;
    unit: string;
    label: string;
  };
};

type SystemCatalog = {
  brand: {
    cloud: string;
    compute: string;
    energy: string;
  };
  cloud: CloudItem[];
  compute: {
    label: string;
    description: string;
    pricingStatus: 'preview';
  };
  energy: {
    label: string;
    enabled: false;
    balanceUsd: null;
    status: 'coming_soon';
    message: string;
  };
};

type ComputeCard = {
  selectionId: string;
  gpuName: string;
  gpuRamGb: number | null;
  naylaHourlyPriceUsd: number;
  naylaEstimatedMaxUsd: number;
  available: boolean;
  unavailableReason?: string;
  recommended: boolean;
};

const workloadLabels: Record<'image' | 'video' | 'audio' | '3d', string> = {
  image: 'Imagen',
  video: 'Video',
  audio: 'Audio',
  '3d': '3D',
};

export function NaylaEngineBar({
  session,
  mode,
  onModeChange,
  compact = false,
}: {
  session: FirebaseSession | null;
  mode: NaylaEngineMode;
  onModeChange: (mode: NaylaEngineMode) => void;
  compact?: boolean;
}) {
  const [catalog, setCatalog] = useState<SystemCatalog | null>(null);
  const [openPanel, setOpenPanel] = useState<'cloud' | 'compute' | 'energy' | null>(null);
  const [workload, setWorkload] = useState<'image' | 'video' | 'audio' | '3d'>('video');
  const [cards, setCards] = useState<ComputeCard[]>([]);
  const [computeReady, setComputeReady] = useState<boolean | null>(null);
  const [computeLoading, setComputeLoading] = useState(false);
  const [computeNote, setComputeNote] = useState('');

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    fetch('/api/system/catalog', {
      headers: firebaseHeaders(session),
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'No se pudo cargar el catálogo Nayla.');
        return payload as SystemCatalog;
      })
      .then((payload) => {
        if (!cancelled) setCatalog(payload);
      })
      .catch((error) => {
        if (!cancelled) console.warn('No se pudo cargar Nayla System Catalog:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!session || openPanel !== 'compute') return;
    let cancelled = false;
    setComputeLoading(true);
    fetch('/api/system/compute?workload=' + encodeURIComponent(workload), {
      headers: firebaseHeaders(session),
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'No se pudo consultar Nayla Compute.');
        return payload;
      })
      .then((payload) => {
        if (cancelled) return;
        setCards(Array.isArray(payload.cards) ? payload.cards : []);
        setComputeReady(Boolean(payload.executionReady));
        setComputeNote(String(payload.note || ''));
      })
      .catch((error) => {
        if (cancelled) return;
        setCards([]);
        setComputeReady(false);
        setComputeNote(error instanceof Error ? error.message : 'No se pudo consultar Nayla Compute.');
      })
      .finally(() => {
        if (!cancelled) setComputeLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session, openPanel, workload]);

  const energyLabel = useMemo(
    () => catalog?.energy?.enabled ? 'Energy' : 'Energy · pronto',
    [catalog]
  );

  const buttonStyle = (active: boolean): React.CSSProperties => ({
    flex: compact ? '0 0 auto' : 1,
    minWidth: 0,
    border: active ? '1px solid #f4f4f4' : '1px solid #333',
    borderRadius: compact ? 999 : 10,
    background: active ? '#f1f1f1' : '#0b0b0b',
    color: active ? '#050505' : '#d4d4d4',
    padding: compact ? '5px 8px' : '8px 10px',
    fontSize: compact ? '0.61rem' : '0.72rem',
    fontWeight: 750,
    letterSpacing: compact ? '0.02em' : '0.04em',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  });

  const togglePanel = (panel: 'cloud' | 'compute' | 'energy') => {
    setOpenPanel((current) => current === panel ? null : panel);
    if (panel === 'cloud') onModeChange('cloud');
    if (panel === 'compute') onModeChange('compute');
  };

  return (
    <div style={{
      position: compact ? 'static' : 'relative',
      background: compact ? 'transparent' : '#050505',
      borderBottom: compact ? 'none' : '1px solid #1a1a1a',
      minWidth: 0,
    }}>
      <div style={{
        display: 'flex',
        gap: compact ? 5 : 8,
        padding: compact ? 0 : '9px 12px',
        alignItems: 'center',
        overflowX: compact ? 'auto' : 'visible',
        scrollbarWidth: 'none',
      }}>
        <button
          type="button"
          onClick={() => togglePanel('cloud')}
          style={buttonStyle(mode === 'cloud')}
        >
          {compact ? '☁ Cloud' : 'NAYLA CLOUD'}
        </button>
        <button
          type="button"
          onClick={() => togglePanel('compute')}
          style={buttonStyle(mode === 'compute')}
        >
          {compact ? '⚡ Potencia' : 'NAYLA COMPUTE'}
        </button>
        <button
          type="button"
          onClick={() => togglePanel('energy')}
          style={buttonStyle(false)}
        >
          {compact ? '◌ Energy' : energyLabel.toUpperCase()}
        </button>
      </div>

      {openPanel && (
        <div style={{
          position: 'absolute',
          zIndex: 60,
          top: compact ? '100%' : '100%',
          left: compact ? 10 : 12,
          right: compact ? 10 : 12,
          maxHeight: compact ? '58dvh' : '52dvh',
          overflowY: 'auto',
          background: 'rgba(8,8,8,0.99)',
          border: '1px solid #3a3a3a',
          borderRadius: 14,
          boxShadow: '0 20px 55px rgba(0,0,0,0.72)',
          padding: 12,
          color: '#fff',
        }}>
          {openPanel === 'cloud' && (
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.82rem' }}>Nayla Cloud</div>
              <div style={{ color: '#888', fontSize: '0.72rem', marginTop: 4 }}>
                Servicios rápidos por la red de Nayla. El motor interno se selecciona automáticamente.
              </div>
              <div style={{ display: 'grid', gap: 7, marginTop: 10 }}>
                {(catalog?.cloud || []).map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      gap: 8,
                      padding: '10px 11px',
                      borderRadius: 10,
                      border: '1px solid #292929',
                      background: '#0c0c0c',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700 }}>{item.label}</div>
                      <div style={{ color: '#777', fontSize: '0.68rem', marginTop: 3 }}>{item.description}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.72rem', color: item.configured ? '#eee' : '#777' }}>
                        {item.configured ? 'Disponible' : 'Pendiente'}
                      </div>
                      <div style={{ color: '#888', fontSize: '0.68rem', marginTop: 3 }}>{item.price.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {openPanel === 'compute' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.82rem' }}>Nayla Compute</div>
                  <div style={{ color: '#888', fontSize: '0.72rem', marginTop: 4 }}>
                    GPU bajo demanda. Solo se reserva después de tu confirmación.
                  </div>
                </div>
                <div style={{ color: '#777', fontSize: '0.65rem' }}>PRECIOS NAYLA</div>
              </div>

              <div style={{ display: 'flex', gap: 6, marginTop: 10, overflowX: 'auto' }}>
                {(Object.keys(workloadLabels) as Array<keyof typeof workloadLabels>).map((key) => (
                  <button
                    type="button"
                    key={key}
                    onClick={() => setWorkload(key)}
                    style={{
                      flex: '0 0 auto',
                      border: workload === key ? '1px solid #eee' : '1px solid #333',
                      background: workload === key ? '#ededed' : '#111',
                      color: workload === key ? '#050505' : '#ddd',
                      borderRadius: 9,
                      padding: '7px 10px',
                      fontSize: '0.7rem',
                      cursor: 'pointer',
                    }}
                  >
                    {workloadLabels[key]}
                  </button>
                ))}
              </div>

              {computeLoading ? (
                <div style={{ padding: '18px 6px', color: '#888', fontSize: '0.74rem' }}>
                  Consultando tarjetas disponibles…
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gap: 7, marginTop: 10 }}>
                    {cards.map((card) => (
                      <div
                        key={card.selectionId}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr auto',
                          gap: 10,
                          padding: '10px 11px',
                          border: '1px solid #292929',
                          borderRadius: 10,
                          background: '#0c0c0c',
                          opacity: card.available ? 1 : 0.68,
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '0.78rem', fontWeight: 750 }}>{card.gpuName}</div>
                          <div style={{ color: '#777', fontSize: '0.68rem', marginTop: 3 }}>
                            {card.gpuRamGb ? card.gpuRamGb + ' GB VRAM' : 'VRAM según disponibilidad'}
                            {card.recommended ? ' · Nayla recomienda' : ''}
                          </div>
                          {!card.available && card.unavailableReason && (
                            <div style={{ color: '#666', fontSize: '0.64rem', marginTop: 3, lineHeight: 1.35 }}>
                              {card.unavailableReason}
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.76rem', fontWeight: 750 }}>
                            ~${card.naylaHourlyPriceUsd.toFixed(3)}/h
                          </div>
                          <div style={{ color: '#777', fontSize: '0.65rem', marginTop: 3 }}>
                            tope ~${card.naylaEstimatedMaxUsd.toFixed(3)}
                          </div>
                        </div>
                      </div>
                    ))}
                    {!cards.length && (
                      <div style={{ color: '#777', fontSize: '0.73rem', padding: '12px 4px' }}>
                        No hay tarjetas compatibles visibles en este momento.
                      </div>
                    )}
                  </div>
                  <div style={{ color: computeReady ? '#aaa' : '#777', fontSize: '0.68rem', marginTop: 10, lineHeight: 1.45 }}>
                    {computeNote}
                  </div>
                </>
              )}
            </div>
          )}

          {openPanel === 'energy' && (
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.82rem' }}>Nayla Energy</div>
              <div style={{ color: '#888', fontSize: '0.72rem', marginTop: 4 }}>
                Será el saldo único para Cloud y Compute.
              </div>
              <div style={{
                height: 9,
                borderRadius: 999,
                border: '1px solid #333',
                background: '#111',
                marginTop: 14,
                overflow: 'hidden',
              }}>
                <div style={{ width: '0%', height: '100%', background: '#ddd' }} />
              </div>
              <div style={{ color: '#777', fontSize: '0.7rem', marginTop: 8 }}>
                Pagos y recargas todavía no están activados.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
