import { useCallback, useEffect, useMemo, useState } from 'react';
import { firebaseHeaders } from '../lib/apiClient';
import type { FirebaseSession } from '../lib/firebaseClient';

type PlayCard = {
  id: string;
  gpuName: string;
  gpuRamGb?: number;
  region?: string;
  hourlyPrice: number;
  available: boolean;
  recommended: boolean;
  performance: 'AAA' | 'AAA+';
  billingMinimumMinutes?: number;
  includedStorageGb?: number;
  includedBandwidthGb?: number;
};

type PlayQuote = {
  ready: boolean;
  cards: PlayCard[];
  networksConfigured: number;
  networksReachable: number;
  generatedAt: string;
  pricing: {
    status: 'preview';
    marginUsdPerHour: number;
    note: string;
  };
};

const money = (value: number) =>
  '$' + Number(value || 0).toFixed(value >= 1 ? 2 : 3);

export default function NaylaPlay({
  session,
  onClose,
}: {
  session: FirebaseSession | null;
  onClose: () => void;
}) {
  const [quote, setQuote] = useState<PlayQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState('');

  const loadQuote = useCallback(async () => {
    if (!session) {
      setError('Inicia sesión para consultar las GPU disponibles.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/play/quote', {
        method: 'GET',
        headers: firebaseHeaders(session),
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.error) {
        throw new Error(payload.error || 'No se pudo consultar Nayla Play.');
      }

      const next = payload.quote as PlayQuote;
      setQuote(next);
      setSelectedId((current) => {
        if (current && next.cards.some((card) => card.id === current)) return current;
        return (
          next.cards.find((card) => card.recommended)?.id ||
          next.cards[0]?.id ||
          ''
        );
      });
    } catch (cause) {
      setQuote(null);
      setError(cause instanceof Error ? cause.message : 'No se pudo consultar Nayla Play.');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void loadQuote();
  }, [loadQuote]);

  const selected = useMemo(
    () => quote?.cards.find((card) => card.id === selectedId) || null,
    [quote, selectedId]
  );

  return (
    <div
      data-testid="nayla-play"
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
            PLAY
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <button
            type="button"
            onClick={() => void loadQuote()}
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
            {loading ? 'BUSCANDO…' : 'ACTUALIZAR'}
          </button>
          <button
            type="button"
            aria-label="Cerrar Nayla Play"
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

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '18px clamp(14px, 4vw, 34px) 34px',
        }}
      >
        <div style={{ width: 'min(980px, 100%)', margin: '0 auto' }}>
          <div
            style={{
              border: '1px solid #2b2b2b',
              borderRadius: 18,
              padding: '18px',
              background: 'linear-gradient(180deg,#111,#090909)',
              marginBottom: 14,
            }}
          >
            <div style={{ fontSize: '1.25rem', fontWeight: 900, marginBottom: 6 }}>
              GPU para videojuegos
            </div>
            <div style={{ color: '#999', fontSize: '0.8rem', lineHeight: 1.5 }}>
              Nayla consulta sus redes GPU en tiempo real. Aquí solo estás viendo disponibilidad y precio:
              no se alquila ninguna máquina desde esta pantalla.
            </div>

            <div
              style={{
                marginTop: 14,
                display: 'grid',
                gridTemplateColumns: 'repeat(3,minmax(0,1fr))',
                gap: 8,
              }}
            >
              <div style={{ border: '1px solid #292929', borderRadius: 12, padding: 10, background: '#070707' }}>
                <div style={{ color: '#777', fontSize: '0.62rem' }}>REDES</div>
                <strong style={{ fontSize: '0.86rem' }}>
                  {quote ? quote.networksReachable + '/' + quote.networksConfigured : '—'}
                </strong>
              </div>
              <div style={{ border: '1px solid #292929', borderRadius: 12, padding: 10, background: '#070707' }}>
                <div style={{ color: '#777', fontSize: '0.62rem' }}>GPU VISIBLES</div>
                <strong style={{ fontSize: '0.86rem' }}>{quote?.cards.length ?? '—'}</strong>
              </div>
              <div style={{ border: '1px solid #292929', borderRadius: 12, padding: 10, background: '#070707' }}>
                <div style={{ color: '#777', fontSize: '0.62rem' }}>SESIÓN</div>
                <strong style={{ fontSize: '0.86rem' }}>SIN CARGO</strong>
              </div>
            </div>
          </div>

          {error && (
            <div
              style={{
                border: '1px solid #463131',
                borderRadius: 14,
                padding: 14,
                color: '#ddd',
                background: '#130b0b',
                marginBottom: 12,
                fontSize: '0.78rem',
                lineHeight: 1.5,
              }}
            >
              {error}
            </div>
          )}

          {loading && !quote ? (
            <div
              style={{
                border: '1px solid #292929',
                borderRadius: 16,
                padding: 28,
                color: '#888',
                textAlign: 'center',
              }}
            >
              Nayla está consultando GPU disponibles…
            </div>
          ) : quote?.cards.length ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {quote.cards.map((card) => {
                const active = card.id === selectedId;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => setSelectedId(card.id)}
                    style={{
                      width: '100%',
                      border: active ? '1px solid #fff' : '1px solid #292929',
                      borderRadius: 16,
                      background: active ? '#181818' : '#0b0b0b',
                      color: '#fff',
                      padding: 14,
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      gap: 14,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '0.94rem' }}>{card.gpuName}</strong>
                        <span
                          style={{
                            fontSize: '0.58rem',
                            padding: '3px 7px',
                            borderRadius: 999,
                            border: '1px solid #3a3a3a',
                            color: '#bbb',
                          }}
                        >
                          {card.performance}
                        </span>
                        {card.recommended && (
                          <span style={{ fontSize: '0.58rem', color: '#fff' }}>MEJOR PRECIO</span>
                        )}
                      </div>
                      <div style={{ marginTop: 5, color: '#858585', fontSize: '0.7rem', lineHeight: 1.45 }}>
                        {card.gpuRamGb ? card.gpuRamGb + ' GB VRAM' : 'VRAM según disponibilidad'}
                        {' · '}
                        {card.region || 'ubicación pendiente'}
                        {card.billingMinimumMinutes
                          ? ' · mínimo ' + card.billingMinimumMinutes + ' min'
                          : ''}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 900, fontSize: '1rem' }}>
                        {money(card.hourlyPrice)}
                      </div>
                      <div style={{ color: '#777', fontSize: '0.62rem' }}>/ hora</div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : !loading ? (
            <div
              style={{
                border: '1px solid #292929',
                borderRadius: 16,
                padding: 24,
                color: '#999',
                lineHeight: 1.55,
                textAlign: 'center',
              }}
            >
              No hay GPU de gaming disponibles en este momento. Pulsa ACTUALIZAR para volver a consultar.
            </div>
          ) : null}

          {selected && (
            <div
              style={{
                position: 'sticky',
                bottom: 10,
                marginTop: 16,
                border: '1px solid #3a3a3a',
                borderRadius: 18,
                background: 'rgba(10,10,10,0.96)',
                backdropFilter: 'blur(18px)',
                padding: 14,
                boxShadow: '0 14px 50px rgba(0,0,0,.55)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.66rem', color: '#777' }}>SELECCIONADA</div>
                  <div style={{ fontSize: '0.86rem', fontWeight: 850, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selected.gpuName} · {money(selected.hourlyPrice)}/h
                  </div>
                </div>
                <button
                  type="button"
                  disabled
                  style={{
                    minHeight: 42,
                    borderRadius: 999,
                    padding: '0 18px',
                    border: '1px solid #383838',
                    background: '#1a1a1a',
                    color: '#737373',
                    fontWeight: 900,
                    cursor: 'not-allowed',
                  }}
                >
                  JUGAR · SIGUIENTE FASE
                </button>
              </div>
              <div style={{ color: '#666', fontSize: '0.64rem', lineHeight: 1.45, marginTop: 8 }}>
                El botón JUGAR se activará cuando conectemos streaming WebRTC, controles y cierre automático de sesión.
              </div>
            </div>
          )}

          {quote?.pricing?.note && (
            <div style={{ color: '#666', fontSize: '0.64rem', lineHeight: 1.5, marginTop: 14 }}>
              {quote.pricing.note}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
