export default function GenerarStyles() {
  return (
    <style jsx global>{`
      .generar-workspace {
        position: fixed;
        inset: 0;
        z-index: 12000;
        color: #fff;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        background:
          radial-gradient(circle at 18% 8%, rgba(var(--glow-color-rgb), .09), transparent 34%),
          radial-gradient(circle at 86% 78%, rgba(var(--glow-color-rgb), .055), transparent 30%),
          rgba(2, 3, 5, .91);
        backdrop-filter: blur(calc(var(--glass-blur) * .75));
        -webkit-backdrop-filter: blur(calc(var(--glass-blur) * .75));
      }

      .generar-header {
        height: 68px;
        flex: 0 0 68px;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 0 14px;
        border-bottom: 1px solid rgba(var(--glow-color-rgb), .13);
        background: rgba(5, 5, 7, .72);
        backdrop-filter: blur(var(--glass-blur));
        -webkit-backdrop-filter: blur(var(--glass-blur));
        box-shadow: 0 10px 30px rgba(0,0,0,.26);
      }

      .generar-header-copy {
        display: flex;
        flex-direction: column;
        justify-content: center;
        flex: 1;
        min-width: 0;
      }

      .generar-header-copy small,
      .generar-eyebrow {
        color: #8e8e93;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: .22em;
      }

      .generar-header-copy strong {
        margin-top: 2px;
        color: #fff;
        font-size: 15px;
        letter-spacing: .06em;
      }

      .generar-icon-button {
        width: 42px;
        height: 42px;
        flex: 0 0 42px;
        border-radius: 13px;
        color: #f4f4f5;
        cursor: pointer;
        display: grid;
        place-items: center;
        padding: 0;
      }

      .generar-icon-button svg {
        width: 19px;
        height: 19px;
      }

      .generar-choice-grid {
        flex: 1;
        min-height: 0;
        display: grid;
        align-content: center;
        justify-content: center;
        grid-template-columns: repeat(2, minmax(210px, 286px));
        gap: 14px;
        padding: 24px;
        overflow: auto;
      }

      .generar-choice-card {
        min-height: 116px;
        border-radius: 18px;
        padding: 16px;
        color: #f7f7f8;
        cursor: pointer;
        display: grid;
        grid-template-columns: 46px 1fr;
        grid-template-rows: auto auto;
        column-gap: 13px;
        align-items: center;
        text-align: left;
        background: linear-gradient(145deg, rgba(255,255,255,.075), rgba(255,255,255,.025));
        border: 1px solid rgba(var(--glow-color-rgb), calc(var(--glow-intensity) * .42));
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.13),
          inset 0 -1px 0 rgba(255,255,255,.025),
          0 14px 36px rgba(0,0,0,.34),
          0 0 calc(var(--glow-spread) * .5) rgba(var(--glow-color-rgb), calc(var(--glow-intensity) * .14));
      }

      .generar-choice-card:hover {
        background: linear-gradient(145deg, rgba(255,255,255,.115), rgba(255,255,255,.04));
      }

      .generar-choice-icon {
        grid-row: 1 / 3;
        width: 48px;
        height: 48px;
        border-radius: 15px;
        display: grid;
        place-items: center;
        background: rgba(255,255,255,.055);
        border: 1px solid rgba(var(--glow-color-rgb), .16);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.08);
      }

      .generar-choice-icon svg {
        width: 24px;
        height: 24px;
      }

      .generar-choice-card strong {
        align-self: end;
        font-size: 18px;
        letter-spacing: .03em;
      }

      .generar-choice-card span {
        align-self: start;
        margin-top: 3px;
        color: #8e8e93;
        font-size: 12px;
        line-height: 1.35;
      }

      .generar-module-grid {
        flex: 1;
        min-height: 0;
        display: grid;
        align-content: center;
        justify-content: center;
        grid-template-columns: repeat(3, minmax(160px, 230px));
        gap: 12px;
        padding: 24px;
        overflow: auto;
      }

      .generar-module-button {
        min-height: 96px;
        border-radius: 17px;
        padding: 13px;
        color: #f5f5f5;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 12px;
        text-align: left;
        background: linear-gradient(145deg, rgba(255,255,255,.065), rgba(255,255,255,.022));
        border: 1px solid rgba(var(--glow-color-rgb), calc(var(--glow-intensity) * .38));
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.11),
          0 10px 30px rgba(0,0,0,.30);
      }

      .generar-module-button:hover {
        background: linear-gradient(145deg, rgba(255,255,255,.105), rgba(255,255,255,.035));
      }

      .generar-module-button .generar-choice-icon {
        grid-row: auto;
        width: 42px;
        height: 42px;
        flex: 0 0 42px;
        border-radius: 13px;
      }

      .generar-module-copy {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .generar-module-copy strong {
        font-size: 14px;
        letter-spacing: .04em;
      }

      .generar-module-copy span {
        color: #818187;
        font-size: 11px;
      }

      .generar-module-copy em {
        width: max-content;
        margin-top: 4px;
        padding: 3px 7px;
        border-radius: 999px;
        border: 1px solid rgba(var(--glow-color-rgb), .18);
        color: #cfcfd2;
        font-size: 9px;
        font-style: normal;
        font-weight: 800;
        letter-spacing: .09em;
      }

      .generar-module-copy em.ready {
        color: #eafff3;
        border-color: rgba(128,247,177,.26);
        background: rgba(128,247,177,.06);
      }

      .generar-module-shell {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .generar-module-toolbar {
        flex: 0 0 auto;
        padding: 12px 14px 0;
      }

      .generar-back-button {
        min-height: 38px;
        border-radius: 12px;
        color: #e8e8ea;
        padding: 0 13px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: .04em;
      }

      .generar-module-placeholder,
      .generar-loading,
      .generar-breaker {
        flex: 1;
        min-height: 0;
        display: grid;
        place-content: center;
        text-align: center;
        padding: 28px;
      }

      .generar-module-placeholder h2 {
        margin: 7px 0;
        font-size: 29px;
      }

      .generar-module-placeholder p,
      .generar-breaker p {
        max-width: 520px;
        color: #8d8d92;
        line-height: 1.55;
      }

      .generar-module-stage {
        flex: 1;
        min-height: 0;
        overflow: auto;
        padding: 14px 18px 24px;
      }

      .generar-stage-inner {
        width: min(760px, 100%);
        margin: 0 auto;
      }

      .generar-stage-heading {
        padding: 8px 2px 16px;
      }

      .generar-stage-heading h2 {
        margin: 5px 0 6px;
        font-size: 25px;
      }

      .generar-stage-heading p {
        margin: 0;
        color: #88898f;
        font-size: 12px;
        line-height: 1.55;
      }

      .generar-glass-panel {
        border-radius: 20px;
        padding: 18px;
        background: var(--glass-bg);
        backdrop-filter: blur(var(--glass-blur));
        -webkit-backdrop-filter: blur(var(--glass-blur));
        border: 1px solid rgba(var(--glow-color-rgb), calc(var(--glow-intensity) * .45));
        box-shadow:
          0 16px 45px rgba(0,0,0,.38),
          inset 0 1px 0 rgba(255,255,255,.08),
          0 0 calc(var(--glow-spread) * .45) rgba(var(--glow-color-rgb), calc(var(--glow-intensity) * .16));
      }

      .generar-form-label {
        display: block;
        margin-bottom: 8px;
        color: #d6d6da;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: .07em;
      }

      .generar-textarea {
        width: 100%;
        min-height: 132px;
        resize: vertical;
        border-radius: 15px;
        border: 1px solid rgba(var(--glow-color-rgb), .16);
        background: rgba(0,0,0,.34);
        color: #fff;
        padding: 13px 14px;
        font: inherit;
        font-size: 14px;
        line-height: 1.5;
        outline: none;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.035);
      }

      .generar-textarea:focus {
        border-color: rgba(var(--glow-color-rgb), calc(var(--glow-intensity) * .85));
        box-shadow: 0 0 calc(var(--glow-spread) * .65) rgba(var(--glow-color-rgb), calc(var(--glow-intensity) * .22));
      }

      .generar-segmented {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .generar-segment-button {
        min-height: 38px;
        border-radius: 12px;
        padding: 0 14px;
        color: #a8a8ad;
        background: rgba(255,255,255,.025);
        border: 1px solid rgba(var(--glow-color-rgb), .14);
        cursor: pointer;
        font-size: 10px;
        font-weight: 850;
        letter-spacing: .07em;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.05);
      }

      .generar-segment-button.active {
        color: #fff;
        background: linear-gradient(180deg, rgba(255,255,255,.13), rgba(255,255,255,.055));
        border-color: rgba(var(--glow-color-rgb), calc(var(--glow-intensity) * .68));
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.16),
          0 0 calc(var(--glow-spread) * .48) rgba(var(--glow-color-rgb), calc(var(--glow-intensity) * .18));
      }

      .generar-segment-button:disabled {
        opacity: .44;
        cursor: wait;
      }

      .generar-spaced-label {
        margin-top: 16px;
      }

      .generar-input-meta {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        margin-top: 7px;
        color: #707078;
        font-size: 9px;
        font-weight: 750;
        letter-spacing: .06em;
      }

      .generar-action-row {
        display: flex;
        flex-wrap: wrap;
        gap: 9px;
        margin-top: 13px;
      }

      .generar-primary-action,
      .generar-secondary-action {
        min-height: 43px;
        border-radius: 13px;
        padding: 0 16px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 900;
        letter-spacing: .06em;
      }

      .generar-primary-action {
        color: #fff;
        background: linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,.055));
        border: 1px solid rgba(var(--glow-color-rgb), calc(var(--glow-intensity) * .72));
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.20),
          0 0 calc(var(--glow-spread) * .75) rgba(var(--glow-color-rgb), calc(var(--glow-intensity) * .24));
      }

      .generar-primary-action:hover {
        background: linear-gradient(180deg, rgba(255,255,255,.17), rgba(255,255,255,.075));
      }

      .generar-secondary-action {
        color: #e8e8eb;
        background: rgba(255,255,255,.035);
      }

      .generar-primary-action:disabled,
      .generar-secondary-action:disabled {
        opacity: .42;
        cursor: wait;
      }

      .generar-status-card {
        margin-top: 12px;
        padding: 14px;
        border-radius: 15px;
        border: 1px solid rgba(255,255,255,.1);
        background: rgba(255,255,255,.025);
      }

      .generar-status-card strong {
        display: block;
        font-size: 12px;
      }

      .generar-status-card p {
        margin: 6px 0 0;
        color: #929299;
        font-size: 12px;
        line-height: 1.45;
      }

      .generar-status-card.error {
        border-color: rgba(255,107,107,.28);
      }

      .generar-result {
        margin-top: 14px;
        overflow: hidden;
      }

      .generar-result img,
      .generar-result video {
        width: 100%;
        max-height: 470px;
        display: block;
        object-fit: contain;
        border-radius: 16px;
        background: #030303;
        border: 1px solid rgba(255,255,255,.08);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
      }

      .generar-audio-result {
        padding: 14px;
        border-radius: 17px;
        border: 1px solid rgba(var(--glow-color-rgb), .16);
        background: linear-gradient(145deg, rgba(255,255,255,.045), rgba(255,255,255,.018));
        box-shadow: inset 0 1px 0 rgba(255,255,255,.07);
      }

      .generar-audio-result audio {
        width: 100%;
        margin-top: 12px;
        accent-color: rgb(var(--glow-color-rgb));
      }

      .generar-audio-orb {
        height: 74px;
        border-radius: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        overflow: hidden;
        background:
          radial-gradient(circle at 50% 50%, rgba(var(--glow-color-rgb), .10), transparent 58%),
          rgba(0,0,0,.22);
        border: 1px solid rgba(var(--glow-color-rgb), .10);
      }

      .generar-audio-orb span {
        width: 4px;
        height: 20px;
        border-radius: 999px;
        background: rgba(255,255,255,.72);
        box-shadow: 0 0 12px rgba(var(--glow-color-rgb), .24);
      }

      .generar-audio-orb span:nth-child(2),
      .generar-audio-orb span:nth-child(4) {
        height: 34px;
      }

      .generar-audio-orb span:nth-child(3) {
        height: 48px;
      }

      .generar-result-meta {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        margin-top: 10px;
        color: #8b8b90;
        font-size: 11px;
      }

      @media (max-width: 720px) {
        .generar-choice-grid {
          grid-template-columns: 1fr 1fr;
          align-content: center;
          padding: 18px 14px;
          gap: 10px;
        }

        .generar-choice-card {
          min-height: 112px;
          grid-template-columns: 40px 1fr;
          column-gap: 10px;
          padding: 13px;
          border-radius: 17px;
        }

        .generar-choice-icon {
          width: 40px;
          height: 40px;
          border-radius: 12px;
        }

        .generar-choice-card strong {
          font-size: 15px;
        }

        .generar-choice-card span {
          font-size: 10px;
        }

        .generar-module-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          align-content: start;
          padding: 16px 12px;
          gap: 9px;
        }

        .generar-module-button {
          min-height: 88px;
          border-radius: 16px;
          padding: 11px;
          gap: 9px;
        }

        .generar-module-button .generar-choice-icon {
          width: 37px;
          height: 37px;
          flex-basis: 37px;
        }

        .generar-module-copy strong {
          font-size: 12px;
        }

        .generar-module-stage {
          padding: 10px 12px 20px;
        }

        .generar-stage-heading h2 {
          font-size: 22px;
        }

        .generar-glass-panel {
          border-radius: 17px;
          padding: 14px;
        }
      }
    `}</style>
  );
}
