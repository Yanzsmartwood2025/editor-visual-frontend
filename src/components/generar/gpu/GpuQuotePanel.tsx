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
              <button
                type="button"
                key={card.selectionId}
                className={`generar-gpu-card glass-glow-button is-${tone} ${active ? 'active' : ''}`}
                onClick={() => onSelect(card.selectionId)}
                disabled={!card.available || confirming}
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
