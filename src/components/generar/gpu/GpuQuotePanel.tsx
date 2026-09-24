export type GenerarGpuQuoteCard = {
  selectionId: string;
  gpuName: string;
  gpuRamGb?: number;
  hourlyPrice: number;
  estimatedMaxCost: number;
  available: boolean;
  unavailableReason?: string;
  recommended: boolean;
  selected: boolean;
};

export type GenerarGpuQuote = {
  provider: 'nayla-compute';
  workload: string;
  recipe?: string;
  available: boolean;
  reason?: string;
  gpuName?: string;
  gpuRamGb?: number;
  hourlyPrice?: number;
  estimatedMaxCost?: number;
  selectedSelectionId?: string;
  cards?: GenerarGpuQuoteCard[];
  maxRuntimeMinutes: number;
};

const money = (value?: number, digits = 3) =>
  Number.isFinite(value) ? '$' + Number(value).toFixed(digits) : '—';

export default function GpuQuotePanel({
  quote,
  selectedId,
  onSelect,
  onCancel,
  onConfirm,
  confirming,
}: {
  quote: GenerarGpuQuote;
  selectedId: string;
  onSelect: (selectionId: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  confirming?: boolean;
}) {
  const selected =
    quote.cards?.find((card) => card.selectionId === selectedId) ||
    quote.cards?.find((card) => card.selected) ||
    null;
  const canConfirm = Boolean(selectedId && (selected ? selected.available : quote.available));

  return (
    <div className="generar-gpu-quote">
      <div className="generar-gpu-quote-head">
        <div>
          <span className="generar-eyebrow">NAYLA COMPUTE</span>
          <strong>Elige la GPU</strong>
        </div>
        <span>{quote.maxRuntimeMinutes} MIN MÁX.</span>
      </div>

      {quote.cards?.length ? (
        <div className="generar-gpu-card-list">
          {quote.cards.map((card) => {
            const active = card.selectionId === selectedId;
            return (
              <button
                type="button"
                key={card.selectionId}
                className={`generar-gpu-card glass-glow-button ${active ? 'active' : ''}`}
                onClick={() => onSelect(card.selectionId)}
                disabled={confirming}
              >
                <span>
                  <strong>{card.gpuName}</strong>
                  <small>
                    {card.gpuRamGb ? `${card.gpuRamGb} GB VRAM` : 'VRAM según disponibilidad'}
                    {card.recommended ? ' · RECOMENDADA' : ''}
                  </small>
                  {!card.available && card.unavailableReason && <em>{card.unavailableReason}</em>}
                </span>
                <span className="generar-gpu-price">
                  <strong>~{money(card.hourlyPrice)}/h</strong>
                  <small>tope ~{money(card.estimatedMaxCost)}</small>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="generar-status-card error">
          <strong>GPU NO DISPONIBLE</strong>
          <p>{quote.reason || 'No hay una tarjeta compatible dentro de los límites actuales.'}</p>
        </div>
      )}

      <div className="generar-gpu-quote-note">
        La tarjeta se vuelve a verificar justo antes de reservar. Si el precio o la disponibilidad cambian, Nayla no la alquila silenciosamente.
      </div>

      <div className="generar-action-row">
        <button type="button" className="generar-secondary-action glass-glow-button" onClick={onCancel} disabled={confirming}>
          CANCELAR
        </button>
        <button
          type="button"
          className="generar-primary-action glass-glow-button"
          onClick={onConfirm}
          disabled={!canConfirm || confirming}
        >
          {confirming ? 'VERIFICANDO…' : 'CONFIRMAR GPU'}
        </button>
      </div>
    </div>
  );
}
