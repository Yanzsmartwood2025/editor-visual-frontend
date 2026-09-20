export type GpuQuoteView = {
  provider: 'vast';
  workload: string;
  recipe?: string;
  available: boolean;
  reason?: string;
  gpuName?: string;
  gpuRamGb?: number;
  hourlyPrice?: number;
  estimatedMaxCost?: number;
  spendableCredit?: number;
  reserveUsd: number;
  maxJobUsd: number;
  maxRuntimeMinutes: number;
  bootGraceMinutes: number;
};

export function GpuQuoteModal({
  quote,
  sourceName,
  confirming,
  onCancel,
  onConfirm,
}: {
  quote: GpuQuoteView | null;
  sourceName?: string;
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
      aria-label="Confirmar uso de GPU"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100500,
        background: 'rgba(0,0,0,0.86)',
        display: 'grid',
        placeItems: 'center',
        padding: 18,
      }}
    >
      <div
        style={{
          width: 'min(430px, 100%)',
          border: '1px solid #343434',
          borderRadius: 18,
          background: '#101010',
          color: '#fff',
          boxShadow: '0 18px 80px rgba(0,0,0,0.75)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '18px 18px 12px', borderBottom: '1px solid #242424' }}>
          <div style={{ color: '#00ffcc', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em' }}>
            GPU BAJO DEMANDA
          </div>
          <h3 style={{ margin: '6px 0 0', fontSize: '1.15rem' }}>
            Imagen → 3D
          </h3>
          <div style={{ marginTop: 6, color: '#999', fontSize: '0.78rem', lineHeight: 1.45 }}>
            {sourceName ? (
              <>Entrada: <strong style={{ color: '#ddd' }}>{sourceName}</strong></>
            ) : (
              'Conversión 3D con Vast.ai'
            )}
          </div>
        </div>

        <div style={{ padding: 18, display: 'grid', gap: 12 }}>
          <div
            style={{
              padding: '9px 11px',
              borderRadius: 10,
              border: '1px solid #245b49',
              background: '#0a2119',
              color: '#62f5c1',
              fontSize: '0.75rem',
              fontWeight: 700,
            }}
          >
            TODAVÍA NO SE HA ALQUILADO NINGUNA GPU
          </div>

          {quote.available ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px 14px', fontSize: '0.8rem' }}>
                <span style={{ color: '#888' }}>GPU disponible</span>
                <strong>
                  {quote.gpuName || 'Vast GPU'}
                  {quote.gpuRamGb ? ' · ' + quote.gpuRamGb + ' GB' : ''}
                </strong>

                <span style={{ color: '#888' }}>Tarifa</span>
                <strong>~{money(quote.hourlyPrice)}/h</strong>

                <span style={{ color: '#888' }}>Tope estimado de este trabajo</span>
                <strong style={{ color: '#00ffcc' }}>~{money(quote.estimatedMaxCost)}</strong>

                <span style={{ color: '#888' }}>Crédito disponible</span>
                <strong>{money(quote.spendableCredit, 2)}</strong>

                <span style={{ color: '#888' }}>Reserva que Nayla protege</span>
                <strong>{money(quote.reserveUsd, 2)}</strong>
              </div>

              <p style={{ margin: 0, color: '#777', fontSize: '0.72rem', lineHeight: 1.5 }}>
                El precio puede cambiar entre esta cotización y la confirmación. Antes de alquilar,
                Nayla vuelve a comprobar oferta, saldo y límites. Si sube demasiado, cancela el trabajo.
              </p>
            </>
          ) : (
            <div style={{ color: '#ddd', fontSize: '0.85rem', lineHeight: 1.55 }}>
              {quote.reason || 'No hay una GPU disponible dentro de los límites de seguridad.'}
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
                background: confirming ? '#174b39' : '#00cc66',
                color: confirming ? '#8ad9bd' : '#00180c',
                padding: '10px 15px',
                fontWeight: 800,
                cursor: confirming ? 'wait' : 'pointer',
              }}
            >
              {confirming ? 'ALQUILANDO…' : 'CONFIRMAR Y CREAR 3D'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
