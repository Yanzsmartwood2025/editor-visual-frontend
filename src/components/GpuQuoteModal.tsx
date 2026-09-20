export type GpuQuoteView = {
  provider: 'nayla-compute';
  workload: string;
  recipe?: string;
  available: boolean;
  reason?: string;
  gpuName?: string;
  gpuRamGb?: number;
  hourlyPrice?: number;
  estimatedMaxCost?: number;
  maxRuntimeMinutes: number;
  bootGraceMinutes: number;
  pricingStatus: 'preview';
  energy: {
    enabled: false;
    balanceUsd: null;
    status: 'coming_soon';
  };
};

export function GpuQuoteModal({
  quote,
  sourceName,
  title = 'Nayla Compute',
  description,
  confirmLabel = 'CONFIRMAR',
  confirming,
  onCancel,
  onConfirm,
}: {
  quote: GpuQuoteView | null;
  sourceName?: string;
  title?: string;
  description?: string;
  confirmLabel?: string;
  confirming?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!quote) return null;

  const money = (value?: number, digits = 3) =>
    Number.isFinite(value) ? '$' + Number(value).toFixed(digits) : '—';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirmar Nayla Compute"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100500,
        background: 'rgba(0,0,0,0.88)',
        display: 'grid',
        placeItems: 'center',
        padding: 18,
      }}
    >
      <div
        style={{
          width: 'min(430px, 100%)',
          border: '1px solid #3a3a3a',
          borderRadius: 18,
          background: '#0d0d0d',
          color: '#fff',
          boxShadow: '0 18px 80px rgba(0,0,0,0.78)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '18px 18px 12px', borderBottom: '1px solid #242424' }}>
          <div style={{ color: '#d9d9d9', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em' }}>
            NAYLA COMPUTE · GPU BAJO DEMANDA
          </div>
          <h3 style={{ margin: '6px 0 0', fontSize: '1.15rem' }}>
            {title}
          </h3>
          <div style={{ marginTop: 6, color: '#999', fontSize: '0.78rem', lineHeight: 1.45 }}>
            {sourceName ? (
              <>Entrada: <strong style={{ color: '#ddd' }}>{sourceName}</strong></>
            ) : (
              description || 'Proceso GPU administrado por Nayla Compute.'
            )}
          </div>
        </div>

        <div style={{ padding: 18, display: 'grid', gap: 12 }}>
          <div
            style={{
              padding: '9px 11px',
              borderRadius: 10,
              border: '1px solid #3a3a3a',
              background: '#151515',
              color: '#ededed',
              fontSize: '0.75rem',
              fontWeight: 700,
            }}
          >
            TODAVÍA NO SE HA RESERVADO NINGUNA GPU
          </div>

          {quote.available ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px 14px', fontSize: '0.8rem' }}>
                <span style={{ color: '#888' }}>Tarjeta disponible</span>
                <strong>
                  {quote.gpuName || 'GPU'}
                  {quote.gpuRamGb ? ' · ' + quote.gpuRamGb + ' GB' : ''}
                </strong>

                <span style={{ color: '#888' }}>Precio Nayla</span>
                <strong>~{money(quote.hourlyPrice)}/h</strong>

                <span style={{ color: '#888' }}>Tope estimado del trabajo</span>
                <strong style={{ color: '#f4f4f4' }}>~{money(quote.estimatedMaxCost)}</strong>

                <span style={{ color: '#888' }}>Nayla Energy</span>
                <strong style={{ color: '#777' }}>PRÓXIMAMENTE</strong>
              </div>

              <p style={{ margin: 0, color: '#777', fontSize: '0.72rem', lineHeight: 1.5 }}>
                La disponibilidad puede cambiar antes de confirmar. Nayla vuelve a comprobar
                la tarjeta y los límites justo antes de reservarla.
              </p>
            </>
          ) : (
            <div style={{ color: '#ddd', fontSize: '0.85rem', lineHeight: 1.55 }}>
              {quote.reason || 'No hay una GPU compatible disponible dentro de los límites de seguridad.'}
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            gap: 10,
            justifyContent: 'flex-end',
            padding: '12px 18px 18px',
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            style={{
              border: '1px solid #3a3a3a',
              borderRadius: 10,
              background: '#171717',
              color: '#ddd',
              padding: '10px 14px',
              cursor: confirming ? 'wait' : 'pointer',
            }}
          >
            {quote.available ? 'CANCELAR' : 'CERRAR'}
          </button>

          {quote.available && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={confirming}
              style={{
                border: 0,
                borderRadius: 10,
                background: confirming ? '#555' : '#f2f2f2',
                color: confirming ? '#ddd' : '#050505',
                padding: '10px 15px',
                fontWeight: 800,
                cursor: confirming ? 'wait' : 'pointer',
              }}
            >
              {confirming ? 'RESERVANDO…' : confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
