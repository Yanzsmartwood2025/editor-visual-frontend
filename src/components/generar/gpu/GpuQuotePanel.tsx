import { useRef } from 'react';
import {
  getComputeCardTone,
  getComputeOfferChangedMessage,
} from '../../../lib/gpu/presentation';

export type GenerarGpuQuoteCard = {
  selectionId: string;
  providerName: string;
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
  message,
}: {
  quote: GenerarGpuQuote;
  selectedId: string;
  onSelect: (selectionId: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  confirming?: boolean;
  message?: string;
}) {
  const selected =
    quote.cards?.find((card) => card.selectionId === selectedId) ||
    quote.cards?.find((card) => card.selected) ||
    null;
  const previousProviderName = useRef<string | undefined>(undefined);
  const staleSelectionReason = 'La tarjeta seleccionada ya no está disponible. Elige otra de la lista actualizada.';
  const displayedMessage =
    quote.reason === staleSelectionReason
      ? getComputeOfferChangedMessage(previousProviderName.current)
      : message;
  if (!confirming) previousProviderName.current = selected?.providerName;

  const canConfirm = Boolean(selectedId && (selected ? selected.available : quote.available));

  return (
    <div className="generar-gpu-quote">
      <style jsx global>{`
        .generar-gpu-card-wrap{display:grid;gap:7px;padding:2px 2px 5px}
        .generar-gpu-card.is-recommended{border:2px solid rgba(67,235,151,.76)!important;background:linear-gradient(145deg,rgba(36,129,82,.24),rgba(20,45,33,.12))!important;box-shadow:0 0 20px rgba(59,225,141,.10),inset 0 1px 0 rgba(255,255,255,.08)!important}
        .generar-gpu-card.is-alternative{border:1.5px solid rgba(255,190,72,.62)!important;background:linear-gradient(145deg,rgba(132,91,21,.16),rgba(42,31,14,.08))!important}
        .generar-gpu-card.is-unavailable{border-color:rgba(145,145,153,.2)!important;filter:saturate(.35)}
        .generar-gpu-card.active{position:relative;z-index:2;transform:translateY(-4px) scale(1.012);box-shadow:0 9px 25px rgba(0,0,0,.45),0 0 28px rgba(255,255,255,.12),inset 0 1px 0 rgba(255,255,255,.2)!important}
        .generar-gpu-card.is-recommended.active{border-color:#71f2b5!important;box-shadow:0 10px 28px rgba(0,0,0,.48),0 0 28px rgba(59,225,141,.26),inset 0 1px 0 rgba(255,255,255,.18)!important}
        .generar-gpu-card.is-alternative.active{border-color:#ffd17a!important;box-shadow:0 10px 28px rgba(0,0,0,.48),0 0 25px rgba(255,194,96,.20),inset 0 1px 0 rgba(255,255,255,.17)!important}
        .generar-gpu-inline-confirm{display:grid;grid-template-columns:1fr;gap:7px;margin:0 3px 4px;padding:10px;border-radius:13px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.035);box-shadow:0 8px 22px rgba(0,0,0,.28)}
        .generar-gpu-inline-confirm button{width:100%;min-height:45px}
        .generar-gpu-selected-copy{color:#aeb4b9;font-size:.62rem;line-height:1.4;text-align:center}
        @media(max-width:520px){.generar-gpu-card.active{transform:translateY(-3px) scale(1.006)}}
      `}</style>

      <div className="generar-gpu-quote-head">
        <div>
          <span className="generar-eyebrow">NAYLA COMPUTE</span>
          <strong>Elige la GPU</strong>
        </div>
        <span>{quote.maxRuntimeMinutes} MIN MÁX.</span>
      </div>

      {quote.cards?.length ? (
        <>
          <div className="generar-gpu-legend" aria-label="Significado de los colores">
            <span className="recommended"><i /> Verde · recomendada</span>
            <span className="alternative"><i /> Ámbar · alternativa</span>
            <span className="unavailable"><i /> Gris · no elegible</span>
          </div>
          <div className="generar-gpu-card-list">
          {quote.cards.map((card) => {
            const active = card.selectionId === selectedId;
            const tone = getComputeCardTone(card);
            const toneLabel =
              tone === 'recommended' ? 'RECOMENDADA' :
              tone === 'alternative' ? 'ALTERNATIVA' : 'NO ELEGIBLE';
            return (
              <div className="generar-gpu-card-wrap" key={card.selectionId}>
                <button
                  type="button"
                  className={`generar-gpu-card glass-glow-button is-${tone} ${active ? 'active' : ''}`}
                  onClick={() => onSelect(card.selectionId)}
                  disabled={!card.available || confirming}
                  aria-pressed={active}
                >
                  <span>
                    <span className="generar-gpu-card-heading">
                      <strong>{card.gpuName}</strong>
                      <span className="generar-gpu-card-badges">
                        <span className={`generar-gpu-status is-${tone}`}>{toneLabel}</span>
                        <span className="generar-gpu-provider" title="Proveedor">{card.providerName}</span>
                      </span>
                    </span>
                    <small>
                      {card.gpuRamGb ? `${card.gpuRamGb} GB VRAM` : 'VRAM según disponibilidad'}
                    </small>
                    {!card.available && card.unavailableReason && <em>{card.unavailableReason}</em>}
                  </span>
                  <span className="generar-gpu-price">
                    <strong>~{money(card.hourlyPrice)}/h</strong>
                    <small>tope ~{money(card.estimatedMaxCost)}</small>
                  </span>
                </button>
                {active && card.available && (
                  <div className="generar-gpu-inline-confirm">
                    <div className="generar-gpu-selected-copy">
                      {card.gpuName} seleccionada · se verificará precio y disponibilidad una vez más antes de alquilarla.
                    </div>
                    <button
                      type="button"
                      className="generar-primary-action glass-glow-button"
                      onClick={onConfirm}
                      disabled={!canConfirm || confirming}
                    >
                      {confirming ? 'VERIFICANDO…' : 'CONFIRMAR GPU'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          </div>
        </>
      ) : (
        <div className="generar-status-card error">
          <strong>GPU NO DISPONIBLE</strong>
          <p>{quote.reason || 'No hay una tarjeta compatible dentro de los límites actuales.'}</p>
        </div>
      )}

      <div className="generar-gpu-quote-note">
        La tarjeta se vuelve a verificar justo antes de reservar. Si cambia el precio o deja de estar disponible, podrás elegir otra.
      </div>

      {confirming && (
        <div role="status" aria-live="polite" className="generar-gpu-verification">
          <strong>Verificando esta tarjeta y el precio…</strong>
          <progress aria-label="Verificando disponibilidad de la GPU" />
        </div>
      )}
      {displayedMessage && (
        <div role="alert" className="generar-gpu-verification-message">
          {displayedMessage}
        </div>
      )}

      <div className="generar-action-row">
        <button type="button" className="generar-secondary-action glass-glow-button" onClick={onCancel} disabled={confirming}>
          CANCELAR
        </button>
      </div>
    </div>
  );
}