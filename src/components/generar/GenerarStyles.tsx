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

      .generar-music-orb span:nth-child(1),
      .generar-music-orb span:nth-child(7) {
        height: 14px;
      }

      .generar-music-orb span:nth-child(2),
      .generar-music-orb span:nth-child(6) {
        height: 28px;
      }

      .generar-music-orb span:nth-child(3),
      .generar-music-orb span:nth-child(5) {
        height: 42px;
      }

      .generar-music-orb span:nth-child(4) {
        height: 54px;
      }

      .generar-3d-stage {
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .generar-3d-modebar {
        width: min(980px, 100%);
        margin: 0 auto 10px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex: 0 0 auto;
      }

      .generar-3d-count {
        color: #73737b;
        font-size: 9px;
        font-weight: 800;
        letter-spacing: .08em;
      }

      .generar-3d-studio-shell {
        width: min(980px, 100%);
        height: min(690px, calc(100dvh - 178px));
        min-height: 440px;
        margin: 0 auto;
        overflow: hidden;
        border-radius: 20px;
        border: 1px solid rgba(var(--glow-color-rgb), calc(var(--glow-intensity) * .42));
        background: rgba(0,0,0,.30);
        box-shadow:
          0 18px 48px rgba(0,0,0,.40),
          inset 0 1px 0 rgba(255,255,255,.07),
          0 0 calc(var(--glow-spread) * .42) rgba(var(--glow-color-rgb), calc(var(--glow-intensity) * .12));
      }

      .generar-3d-result {
        margin-top: 14px;
        padding: 14px;
        display: grid;
        grid-template-columns: 58px minmax(0, 1fr) auto;
        gap: 12px;
        align-items: center;
        border-radius: 17px;
        border: 1px solid rgba(var(--glow-color-rgb), .18);
        background: linear-gradient(145deg, rgba(255,255,255,.05), rgba(255,255,255,.018));
        box-shadow: inset 0 1px 0 rgba(255,255,255,.07);
      }

      .generar-3d-result-icon {
        width: 58px;
        height: 58px;
        display: grid;
        place-items: center;
        border-radius: 16px;
        color: #f2f2f4;
        background: rgba(255,255,255,.04);
        border: 1px solid rgba(var(--glow-color-rgb), .16);
      }

      .generar-3d-result-icon svg {
        width: 31px;
        height: 31px;
      }

      .generar-3d-result-copy {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }

      .generar-3d-result-copy strong {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 13px;
      }

      .generar-gpu-quote {
        margin-top: 14px;
        padding: 14px;
        border-radius: 17px;
        border: 1px solid rgba(var(--glow-color-rgb), .17);
        background: linear-gradient(145deg, rgba(255,255,255,.045), rgba(255,255,255,.018));
        box-shadow: inset 0 1px 0 rgba(255,255,255,.07);
      }

      .generar-gpu-quote-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 10px;
      }

      .generar-gpu-quote-head > div {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .generar-gpu-quote-head > div > strong {
        font-size: 14px;
      }

      .generar-gpu-quote-head > span {
        color: #777781;
        font-size: 9px;
        font-weight: 800;
        letter-spacing: .07em;
      }

      .generar-gpu-card-list {
        display: grid;
        gap: 7px;
        max-height: 310px;
        overflow: auto;
      }

      .generar-gpu-card {
        width: 100%;
        min-height: 66px;
        display: grid;
        grid-template-columns: minmax(0,1fr) auto;
        gap: 10px;
        align-items: center;
        padding: 10px 12px;
        border-radius: 14px;
        text-align: left;
        color: #ededf0;
        background: rgba(255,255,255,.025);
        border: 1px solid rgba(var(--glow-color-rgb), .12);
        cursor: pointer;
      }

      .generar-gpu-card.active {
        background: linear-gradient(145deg, rgba(255,255,255,.10), rgba(255,255,255,.04));
        border-color: rgba(var(--glow-color-rgb), calc(var(--glow-intensity) * .72));
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.12),
          0 0 calc(var(--glow-spread) * .48) rgba(var(--glow-color-rgb), calc(var(--glow-intensity) * .17));
      }

      .generar-gpu-card > span:first-child,
      .generar-gpu-price {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .generar-gpu-card small {
        color: #777781;
        font-size: 9px;
      }

      .generar-gpu-card em {
        color: #9b7b7b;
        font-size: 9px;
        font-style: normal;
      }

      .generar-gpu-price {
        text-align: right;
      }

      .generar-gpu-quote-note {
        margin-top: 10px;
        color: #777781;
        font-size: 10px;
        line-height: 1.45;
      }

      .generar-gpu-runtime {
        margin-top: 12px;
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
      }

      .generar-photo-picker {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
        max-height: 230px;
        overflow: auto;
      }

      .generar-photo-card {
        min-width: 0;
        padding: 6px;
        display: grid;
        gap: 6px;
        border-radius: 13px;
        border: 1px solid rgba(var(--glow-color-rgb), .12);
        background: rgba(255,255,255,.025);
        color: #aaa;
        cursor: pointer;
      }

      .generar-photo-card.active {
        border-color: rgba(var(--glow-color-rgb), calc(var(--glow-intensity) * .76));
        background: linear-gradient(145deg, rgba(255,255,255,.10), rgba(255,255,255,.035));
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.10),
          0 0 calc(var(--glow-spread) * .42) rgba(var(--glow-color-rgb), calc(var(--glow-intensity) * .16));
      }

      .generar-photo-card img {
        width: 100%;
        aspect-ratio: 1;
        object-fit: cover;
        border-radius: 9px;
        background: #050505;
      }

      .generar-photo-card span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 9px;
        font-weight: 800;
        text-align: center;
      }

      .generar-selected-source {
        margin-top: 12px;
        padding: 10px;
        display: grid;
        grid-template-columns: 82px minmax(0, 1fr);
        gap: 12px;
        align-items: center;
        border-radius: 15px;
        border: 1px solid rgba(var(--glow-color-rgb), .15);
        background: rgba(255,255,255,.024);
      }

      .generar-selected-source img {
        width: 82px;
        height: 82px;
        object-fit: cover;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,.08);
      }

      .generar-selected-source > div {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }

      .generar-selected-source strong {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 13px;
      }

      .generar-selected-source small {
        color: #777781;
        font-size: 9px;
        letter-spacing: .05em;
      }

      .generar-gpu-runtime span {
        padding: 5px 8px;
        border-radius: 999px;
        border: 1px solid rgba(var(--glow-color-rgb), .13);
        background: rgba(255,255,255,.025);
        color: #94949b;
        font-size: 9px;
        font-weight: 800;
        letter-spacing: .05em;
      }

      .generar-3d-result-copy span {
        color: #777781;
        font-size: 10px;
        font-weight: 750;
        letter-spacing: .05em;
      }

      .generar-result-meta {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        margin-top: 10px;
        color: #8b8b90;
        font-size: 11px;
      }


      .generar-audio-wide {
        width: min(980px, 100%);
      }

      .generar-audio-tool-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 9px;
        margin-bottom: 12px;
      }

      .generar-audio-tool {
        min-height: 82px;
        display: grid;
        grid-template-columns: 38px minmax(0, 1fr);
        gap: 10px;
        align-items: center;
        padding: 10px;
        border-radius: 15px;
        color: #d9d9dc;
        text-align: left;
        cursor: pointer;
        background: linear-gradient(145deg, rgba(255,255,255,.045), rgba(255,255,255,.018));
        border: 1px solid rgba(var(--glow-color-rgb), .13);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
      }

      .generar-audio-tool.active {
        color: #fff;
        border-color: rgba(var(--glow-color-rgb), calc(var(--glow-intensity) * .72));
        background: linear-gradient(145deg, rgba(255,255,255,.11), rgba(255,255,255,.038));
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.14),
          0 0 calc(var(--glow-spread) * .5) rgba(var(--glow-color-rgb), calc(var(--glow-intensity) * .18));
      }

      .generar-audio-tool-icon,
      .generar-voice-avatar {
        width: 38px;
        height: 38px;
        display: grid;
        place-items: center;
        border-radius: 12px;
        border: 1px solid rgba(var(--glow-color-rgb), .16);
        background:
          radial-gradient(circle at 35% 25%, rgba(255,255,255,.13), transparent 44%),
          rgba(255,255,255,.035);
        font-size: 10px;
        font-weight: 950;
        letter-spacing: .05em;
      }

      .generar-audio-tool-copy {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .generar-audio-tool-copy strong {
        font-size: 11px;
        letter-spacing: .04em;
      }

      .generar-audio-tool-copy small {
        color: #777780;
        font-size: 9px;
      }

      .generar-audio-tool-copy em {
        width: max-content;
        margin-top: 2px;
        color: #74747c;
        font-size: 8px;
        font-style: normal;
        font-weight: 850;
        letter-spacing: .07em;
      }

      .generar-audio-tool-copy em.ready {
        color: #bcefcf;
      }

      .generar-audio-workbench {
        min-height: 360px;
      }

      .generar-audio-workbench-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 14px;
        padding-bottom: 14px;
        border-bottom: 1px solid rgba(255,255,255,.07);
      }

      .generar-audio-workbench-head h3 {
        margin: 4px 0 0;
        font-size: 20px;
      }

      .generar-audio-live,
      .generar-audio-pending {
        padding: 5px 8px;
        border-radius: 999px;
        font-size: 8px;
        font-weight: 900;
        letter-spacing: .08em;
        white-space: nowrap;
      }

      .generar-audio-live {
        color: #dfffea;
        border: 1px solid rgba(128,247,177,.22);
        background: rgba(128,247,177,.055);
      }

      .generar-audio-pending {
        color: #9b9ba2;
        border: 1px solid rgba(255,255,255,.1);
        background: rgba(255,255,255,.025);
      }

      .generar-audio-section-title {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 14px;
        margin: 17px 0 8px;
      }

      .generar-audio-section-title strong {
        color: #dddde1;
        font-size: 10px;
        letter-spacing: .07em;
      }

      .generar-audio-section-title span {
        color: #717179;
        font-size: 9px;
        text-align: right;
      }

      .generar-audio-two-col {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 9px;
      }

      .generar-field {
        display: flex;
        flex-direction: column;
        gap: 7px;
      }

      .generar-field > span {
        color: #929299;
        font-size: 9px;
        font-weight: 850;
        letter-spacing: .07em;
      }

      .generar-field input {
        min-height: 43px;
        width: 100%;
        border-radius: 13px;
        padding: 0 12px;
        color: #fff;
        background: rgba(0,0,0,.32);
        border: 1px solid rgba(var(--glow-color-rgb), .14);
        outline: none;
      }

      .generar-field input:focus {
        border-color: rgba(var(--glow-color-rgb), calc(var(--glow-intensity) * .74));
      }

      .generar-audio-tray-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 8px;
      }

      .generar-audio-tray-actions .generar-secondary-action {
        margin: 0;
        min-height: 36px;
      }

      .generar-audio-tray-actions > span {
        color: #6f6f77;
        font-size: 9px;
        font-weight: 800;
        letter-spacing: .06em;
      }

      .generar-voice-groups {
        display: grid;
        gap: 14px;
      }

      .generar-voice-group {
        display: grid;
        gap: 7px;
      }

      .generar-voice-group-title {
        color: #8b8b93;
        font-size: 8px;
        font-weight: 900;
        letter-spacing: .10em;
        padding: 0 2px;
      }

      .generar-audio-source-list,
      .generar-voice-library {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        max-height: 280px;
        overflow: auto;
        padding-right: 2px;
      }

      .generar-audio-source-card,
      .generar-voice-card {
        min-width: 0;
        min-height: 64px;
        display: grid;
        grid-template-columns: 42px minmax(0,1fr) auto;
        gap: 10px;
        align-items: center;
        padding: 9px 10px;
        border-radius: 14px;
        color: #e7e7ea;
        text-align: left;
        background: rgba(255,255,255,.024);
        border: 1px solid rgba(var(--glow-color-rgb), .11);
        cursor: pointer;
      }

      .generar-audio-source-card.active,
      .generar-voice-card.active {
        border-color: rgba(var(--glow-color-rgb), calc(var(--glow-intensity) * .72));
        background: linear-gradient(145deg, rgba(255,255,255,.095), rgba(255,255,255,.032));
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.10),
          0 0 calc(var(--glow-spread) * .38) rgba(var(--glow-color-rgb), calc(var(--glow-intensity) * .14));
      }

      .generar-audio-source-wave {
        height: 38px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        border-radius: 11px;
        background: rgba(255,255,255,.035);
        border: 1px solid rgba(255,255,255,.05);
      }

      .generar-audio-source-wave i {
        width: 2px;
        height: 10px;
        border-radius: 999px;
        background: #aaaab0;
      }

      .generar-audio-source-wave i:nth-child(2),
      .generar-audio-source-wave i:nth-child(4) {
        height: 20px;
      }

      .generar-audio-source-wave i:nth-child(3) {
        height: 28px;
      }

      .generar-audio-source-copy,
      .generar-voice-copy {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .generar-audio-source-copy strong,
      .generar-voice-copy strong {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 11px;
      }

      .generar-audio-source-copy small,
      .generar-voice-copy small {
        color: #73737c;
        font-size: 8px;
        letter-spacing: .05em;
      }

      .generar-audio-check {
        min-width: 22px;
        color: #dcdce0;
        text-align: center;
        font-size: 15px;
      }

      .generar-voice-card audio {
        width: 108px;
        max-width: 100%;
        height: 30px;
      }

      .generar-audio-empty {
        grid-column: 1 / -1;
        min-height: 80px;
        display: grid;
        place-content: center;
        gap: 5px;
        text-align: center;
        border-radius: 14px;
        border: 1px dashed rgba(var(--glow-color-rgb), .14);
        background: rgba(255,255,255,.016);
      }

      .generar-audio-empty strong {
        font-size: 11px;
      }

      .generar-audio-empty span {
        color: #73737b;
        font-size: 9px;
      }

      .generar-audio-clone-options {
        display: grid;
        gap: 8px;
        margin-top: 14px;
      }

      .generar-audio-clone-options label {
        min-height: 42px;
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 9px 11px;
        border-radius: 12px;
        color: #aaaab1;
        font-size: 10px;
        background: rgba(255,255,255,.022);
        border: 1px solid rgba(255,255,255,.07);
      }

      .generar-audio-clone-options input {
        accent-color: rgb(var(--glow-color-rgb));
      }

      .generar-rights-confirm {
        color: #d0d0d4 !important;
      }

      .generar-audio-transcript {
        margin-top: 14px;
        padding: 14px;
        border-radius: 15px;
        background: rgba(255,255,255,.025);
        border: 1px solid rgba(var(--glow-color-rgb), .13);
      }

      .generar-audio-transcript > div {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: center;
      }

      .generar-audio-transcript strong {
        font-size: 10px;
        letter-spacing: .07em;
      }

      .generar-audio-transcript button {
        padding: 5px 8px;
        border-radius: 9px;
        color: #d9d9dc;
        background: rgba(255,255,255,.04);
        border: 1px solid rgba(255,255,255,.09);
        font-size: 8px;
        font-weight: 850;
        cursor: pointer;
      }

      .generar-audio-transcript p {
        margin: 10px 0 0;
        color: #b1b1b7;
        font-size: 12px;
        line-height: 1.55;
        white-space: pre-wrap;
      }


      .generar-module-shell-immersive {
        overflow: hidden;
      }

      .generar-audio-immersive {
        flex: 1;
        min-height: 0;
        padding: 0;
        overflow: hidden;
      }

      .generar-audio-app {
        width: 100%;
        height: 100%;
        min-height: 0;
        display: grid;
        grid-template-rows: 64px minmax(0, 1fr);
        background:
          radial-gradient(circle at 84% 8%, rgba(var(--glow-color-rgb), .08), transparent 28%),
          rgba(3, 4, 6, .96);
      }

      .generar-audio-app-header {
        display: grid;
        grid-template-columns: 46px minmax(0, 1fr) auto;
        gap: 11px;
        align-items: center;
        padding: 0 14px;
        border-bottom: 1px solid rgba(var(--glow-color-rgb), .13);
        background: rgba(5, 6, 8, .88);
        backdrop-filter: blur(var(--glass-blur));
        -webkit-backdrop-filter: blur(var(--glass-blur));
        box-shadow: 0 12px 30px rgba(0,0,0,.24);
        z-index: 3;
      }

      .generar-audio-menu-button {
        width: 42px;
        height: 42px;
        padding: 0;
        display: grid;
        align-content: center;
        justify-content: center;
        gap: 4px;
        border-radius: 13px;
        cursor: pointer;
      }

      .generar-audio-menu-button span {
        width: 17px;
        height: 1.5px;
        border-radius: 999px;
        background: #f2f2f4;
      }

      .generar-audio-app-title {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .generar-audio-app-title small {
        color: #73737b;
        font-size: 8px;
        font-weight: 900;
        letter-spacing: .18em;
      }

      .generar-audio-app-title strong {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 15px;
        letter-spacing: .03em;
      }

      .generar-audio-app-status {
        display: flex;
        align-items: center;
        gap: 5px;
        color: #8f8f96;
        font-size: 9px;
        font-weight: 800;
        letter-spacing: .06em;
      }

      .generar-audio-app-status .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #8df1b4;
        box-shadow: 0 0 12px rgba(141,241,180,.65);
      }

      .generar-audio-app-content {
        min-height: 0;
        overflow: auto;
        overscroll-behavior: contain;
        padding: 20px max(16px, calc((100vw - 980px) / 2));
      }

      .generar-audio-drawer-layer {
        position: absolute;
        inset: 0;
        z-index: 50;
        display: flex;
        background: rgba(0,0,0,.62);
        backdrop-filter: blur(5px);
        -webkit-backdrop-filter: blur(5px);
      }

      .generar-audio-drawer {
        width: min(390px, 88vw);
        height: 100%;
        display: flex;
        flex-direction: column;
        background:
          radial-gradient(circle at 10% 5%, rgba(var(--glow-color-rgb), .09), transparent 30%),
          #0b0c0f;
        border-right: 1px solid rgba(var(--glow-color-rgb), .14);
        box-shadow: 18px 0 50px rgba(0,0,0,.45);
        animation: generarAudioDrawerIn .18s ease-out;
      }

      @keyframes generarAudioDrawerIn {
        from { transform: translateX(-16px); opacity: .65; }
        to { transform: translateX(0); opacity: 1; }
      }

      .generar-audio-drawer-head {
        min-height: 72px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 16px;
        border-bottom: 1px solid rgba(255,255,255,.07);
      }

      .generar-audio-drawer-head > div {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .generar-audio-drawer-head small {
        color: #7f7f87;
        font-size: 9px;
        font-weight: 900;
        letter-spacing: .2em;
      }

      .generar-audio-drawer-head strong {
        font-size: 20px;
        letter-spacing: .04em;
      }

      .generar-audio-drawer-close {
        width: 38px;
        height: 38px;
        border-radius: 12px;
        color: #dddde1;
        background: rgba(255,255,255,.035);
        border: 1px solid rgba(255,255,255,.08);
        cursor: pointer;
        font-size: 28px;
        line-height: 1;
      }

      .generar-audio-nav {
        flex: 1;
        min-height: 0;
        overflow: auto;
        padding: 12px;
      }

      .generar-audio-account {
        flex: 0 0 auto;
        display: grid;
        gap: 8px;
        padding: 10px 12px max(10px, env(safe-area-inset-bottom));
        border-top: 1px solid rgba(255,255,255,.07);
        background: rgba(5, 6, 8, .96);
      }

      .generar-audio-account-menu {
        display: grid;
        gap: 6px;
        padding: 6px;
        border-radius: 14px;
        background: rgba(255,255,255,.025);
        border: 1px solid rgba(var(--glow-color-rgb), .12);
        box-shadow: 0 -10px 30px rgba(0,0,0,.22);
      }

      .generar-audio-account-action {
        width: 100%;
        min-height: 52px;
        display: grid;
        grid-template-columns: 28px minmax(0, 1fr);
        gap: 9px;
        align-items: center;
        padding: 8px 10px;
        border-radius: 11px;
        color: #d7d7dc;
        background: transparent;
        border: 1px solid transparent;
        text-align: left;
        cursor: pointer;
      }

      .generar-audio-account-action:hover {
        color: #fff;
        background: rgba(255,255,255,.045);
        border-color: rgba(var(--glow-color-rgb), .12);
      }

      .generar-audio-account-action:disabled {
        opacity: .55;
        cursor: progress;
      }

      .generar-audio-account-action.danger {
        color: #d2a2a2;
      }

      .generar-audio-account-action > span:first-child {
        display: grid;
        place-items: center;
        font-size: 16px;
      }

      .generar-audio-account-action > span:nth-child(2) {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .generar-audio-account-action strong {
        font-size: 10px;
        letter-spacing: .05em;
      }

      .generar-audio-account-action small {
        color: #73737b;
        font-size: 8px;
      }

      .generar-audio-account-button {
        width: 100%;
        min-height: 58px;
        display: grid;
        grid-template-columns: 38px minmax(0, 1fr) auto;
        gap: 10px;
        align-items: center;
        padding: 9px 10px;
        border-radius: 14px;
        color: #dedee2;
        background: rgba(255,255,255,.025);
        border: 1px solid rgba(255,255,255,.07);
        text-align: left;
        cursor: pointer;
      }

      .generar-audio-account-button:hover,
      .generar-audio-account-button.active {
        background: rgba(255,255,255,.055);
        border-color: rgba(var(--glow-color-rgb), .17);
      }

      .generar-audio-account-avatar {
        width: 38px;
        height: 38px;
        border-radius: 12px;
        object-fit: cover;
        border: 1px solid rgba(255,255,255,.10);
        background: rgba(255,255,255,.05);
      }

      .generar-audio-account-initial {
        display: grid;
        place-items: center;
        font-size: 12px;
        font-weight: 900;
      }

      .generar-audio-account-copy {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .generar-audio-account-copy strong {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 11px;
      }

      .generar-audio-account-copy small {
        color: #707078;
        font-size: 8px;
        font-weight: 850;
        letter-spacing: .07em;
      }

      .generar-audio-account-chevron {
        color: #787880;
        font-size: 13px;
      }

      .generar-audio-nav-section {
        display: grid;
        gap: 5px;
        margin-top: 15px;
      }

      .generar-audio-nav-section-title {
        padding: 0 10px 4px;
        color: #686870;
        font-size: 9px;
        font-weight: 900;
        letter-spacing: .13em;
      }

      .generar-audio-nav-item {
        width: 100%;
        min-height: 56px;
        display: grid;
        grid-template-columns: 36px minmax(0, 1fr) auto;
        gap: 10px;
        align-items: center;
        padding: 8px 10px;
        border-radius: 13px;
        color: #b4b4ba;
        background: transparent;
        border: 1px solid transparent;
        text-align: left;
        cursor: pointer;
      }

      .generar-audio-nav-item:hover,
      .generar-audio-nav-item.active {
        color: #fff;
        background: rgba(255,255,255,.055);
        border-color: rgba(var(--glow-color-rgb), .13);
      }

      .generar-audio-nav-glyph {
        width: 34px;
        height: 34px;
        display: grid;
        place-items: center;
        border-radius: 10px;
        background: rgba(255,255,255,.035);
        border: 1px solid rgba(255,255,255,.055);
        font-size: 9px;
        font-weight: 950;
        letter-spacing: .05em;
      }

      .generar-audio-nav-item > span:nth-child(2) {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .generar-audio-nav-item strong {
        font-size: 12px;
      }

      .generar-audio-nav-item small {
        color: #6f6f77;
        font-size: 9px;
      }

      .generar-audio-nav-item em {
        color: #67676e;
        font-size: 8px;
        font-style: normal;
        font-weight: 900;
      }

      .generar-audio-nav-item em.ready {
        color: #9ff0bf;
        font-size: 18px;
      }

      .generar-audio-home,
      .generar-audio-voices-page,
      .generar-audio-tool-page {
        width: min(980px, 100%);
        margin: 0 auto;
      }

      .generar-audio-home-hero,
      .generar-audio-page-intro {
        margin-bottom: 18px;
      }

      .generar-audio-home-hero h1,
      .generar-audio-page-intro h2 {
        margin: 6px 0 7px;
        font-size: clamp(28px, 5vw, 42px);
        line-height: 1;
        letter-spacing: -.035em;
      }

      .generar-audio-home-hero p,
      .generar-audio-page-intro p {
        max-width: 620px;
        margin: 0;
        color: #8f8f96;
        font-size: 12px;
        line-height: 1.55;
      }

      .generar-audio-home-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }

      .generar-audio-home-card {
        min-height: 132px;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 5px;
        padding: 14px;
        border-radius: 17px;
        color: #e5e5e8;
        text-align: left;
        cursor: pointer;
        background: linear-gradient(145deg, rgba(255,255,255,.055), rgba(255,255,255,.019));
        border: 1px solid rgba(var(--glow-color-rgb), .12);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
      }

      .generar-audio-home-card.featured {
        grid-column: span 2;
        background:
          radial-gradient(circle at 80% 10%, rgba(var(--glow-color-rgb), .12), transparent 40%),
          linear-gradient(145deg, rgba(255,255,255,.075), rgba(255,255,255,.025));
      }

      .generar-audio-home-card:hover {
        border-color: rgba(var(--glow-color-rgb), calc(var(--glow-intensity) * .65));
        background: linear-gradient(145deg, rgba(255,255,255,.095), rgba(255,255,255,.03));
      }

      .generar-audio-home-glyph {
        width: 36px;
        height: 36px;
        display: grid;
        place-items: center;
        margin-bottom: 5px;
        border-radius: 11px;
        font-size: 9px;
        font-weight: 950;
        letter-spacing: .05em;
        background: rgba(255,255,255,.04);
        border: 1px solid rgba(255,255,255,.06);
      }

      .generar-audio-home-card strong {
        font-size: 13px;
        letter-spacing: .04em;
      }

      .generar-audio-home-card small {
        color: #777780;
        font-size: 9px;
        line-height: 1.4;
      }

      .generar-audio-home-card em {
        margin-top: auto;
        color: #72727a;
        font-size: 8px;
        font-style: normal;
        font-weight: 900;
        letter-spacing: .08em;
      }

      .generar-audio-home-card em.ready {
        color: #b5f5cc;
      }

      .generar-voice-search-row {
        margin: 12px 0 10px;
      }

      .generar-voice-search {
        min-height: 46px;
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 0 13px;
        border-radius: 14px;
        background: rgba(0,0,0,.32);
        border: 1px solid rgba(var(--glow-color-rgb), .14);
      }

      .generar-voice-search > span {
        color: #9b9ba1;
        font-size: 22px;
      }

      .generar-voice-search input {
        width: 100%;
        min-width: 0;
        border: 0;
        outline: 0;
        color: #fff;
        background: transparent;
        font-size: 13px;
      }

      .generar-voice-search input::placeholder {
        color: #66666e;
      }

      .generar-voice-filters {
        display: flex;
        gap: 7px;
        overflow-x: auto;
        padding: 0 0 14px;
        scrollbar-width: none;
      }

      .generar-voice-filters::-webkit-scrollbar {
        display: none;
      }

      .generar-voice-filter {
        flex: 0 0 auto;
        min-height: 34px;
        padding: 0 11px;
        border-radius: 999px;
        color: #888890;
        background: rgba(255,255,255,.025);
        border: 1px solid rgba(255,255,255,.07);
        cursor: pointer;
        font-size: 8px;
        font-weight: 900;
        letter-spacing: .06em;
      }

      .generar-voice-filter.active {
        color: #fff;
        background: rgba(255,255,255,.075);
        border-color: rgba(var(--glow-color-rgb), .22);
      }

      .generar-voice-groups-page {
        gap: 22px;
      }

      .generar-voice-group-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
      }

      .generar-voice-group-heading > div {
        display: flex;
        align-items: baseline;
        gap: 8px;
      }

      .generar-voice-group-heading span {
        font-size: 12px;
        font-weight: 900;
        letter-spacing: .05em;
      }

      .generar-voice-group-heading small {
        color: #707078;
        font-size: 9px;
      }

      .generar-voice-library-page {
        max-height: none;
        overflow: visible;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .generar-voice-card-page {
        display: flex;
        flex-direction: column;
        min-height: 92px;
        padding: 10px;
      }

      .generar-voice-select-area {
        width: 100%;
        display: grid;
        grid-template-columns: 40px minmax(0, 1fr) auto;
        gap: 10px;
        align-items: center;
        color: inherit;
        text-align: left;
        background: transparent;
        border: 0;
        padding: 0;
        cursor: pointer;
      }

      .generar-voice-card-page .generar-voice-copy em {
        display: -webkit-box;
        overflow: hidden;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        color: #75757d;
        font-size: 9px;
        font-style: normal;
        line-height: 1.35;
        white-space: normal;
      }

      .generar-voice-card-page audio {
        width: 100%;
        height: 30px;
        margin-top: 8px;
      }

      .generar-selected-voice-bar {
        position: sticky;
        bottom: 0;
        margin-top: 18px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        padding: 11px 12px;
        border-radius: 15px;
        background: rgba(10,11,14,.94);
        border: 1px solid rgba(var(--glow-color-rgb), .17);
        box-shadow: 0 12px 35px rgba(0,0,0,.34);
      }

      .generar-selected-voice-bar > div {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .generar-selected-voice-bar span {
        color: #777780;
        font-size: 8px;
        font-weight: 900;
        letter-spacing: .08em;
      }

      .generar-selected-voice-bar strong {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
      }

      .generar-selected-voice-bar .generar-primary-action {
        margin: 0;
        min-height: 38px;
      }

      .generar-audio-tool-intro {
        position: relative;
        padding-right: 120px;
      }

      .generar-audio-tool-intro > .generar-audio-live,
      .generar-audio-tool-intro > .generar-audio-pending {
        position: absolute;
        top: 0;
        right: 0;
      }

      .generar-audio-single-workbench {
        width: 100%;
        margin: 0;
      }

      .generar-compact-voice {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 16px;
        padding: 10px;
        border-radius: 14px;
        border: 1px solid rgba(var(--glow-color-rgb), .13);
        background: rgba(255,255,255,.025);
      }

      .generar-compact-voice-main {
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .generar-compact-voice-main > div {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .generar-compact-voice-main small {
        color: #75757d;
        font-size: 8px;
        font-weight: 900;
        letter-spacing: .08em;
      }

      .generar-compact-voice-main strong {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
      }

      .generar-compact-voice-main > div > span {
        color: #76767e;
        font-size: 9px;
      }

      .generar-compact-voice .generar-secondary-action {
        min-height: 36px;
        margin: 0;
        white-space: nowrap;
      }

      .generar-audio-main-textarea {
        min-height: 230px;
      }

      .generar-clone-language {
        margin-top: 10px;
      }

      .generar-audio-primary-actions {
        margin-top: 16px;
      }

      .generar-audio-centered-state {
        max-width: 620px;
        margin: 60px auto 0;
        text-align: center;
      }

      .generar-audio-empty-large {
        min-height: 150px;
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

        .generar-3d-stage {
          padding-left: 10px;
          padding-right: 10px;
        }

        .generar-3d-modebar {
          align-items: flex-start;
        }

        .generar-3d-studio-shell {
          height: calc(100dvh - 160px);
          min-height: 390px;
          border-radius: 17px;
        }

        .generar-3d-result {
          grid-template-columns: 48px minmax(0, 1fr);
        }

        .generar-3d-result-icon {
          width: 48px;
          height: 48px;
          border-radius: 14px;
        }

        .generar-3d-result .generar-primary-action {
          grid-column: 1 / -1;
          width: 100%;
        }

        .generar-photo-picker {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .generar-selected-source {
          grid-template-columns: 66px minmax(0, 1fr);
        }

        .generar-selected-source img {
          width: 66px;
          height: 66px;
        }

        .generar-audio-immersive {
          padding: 0;
        }

        .generar-audio-app {
          grid-template-rows: 58px minmax(0, 1fr);
        }

        .generar-audio-app-header {
          grid-template-columns: 42px minmax(0, 1fr) auto;
          padding: 0 10px;
          gap: 9px;
        }

        .generar-audio-menu-button {
          width: 38px;
          height: 38px;
          border-radius: 12px;
        }

        .generar-audio-app-content {
          padding: 16px 12px 20px;
        }

        .generar-audio-home-hero h1,
        .generar-audio-page-intro h2 {
          font-size: 28px;
        }

        .generar-audio-home-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .generar-audio-home-card,
        .generar-audio-home-card.featured {
          grid-column: auto;
          min-height: 118px;
          padding: 12px;
          border-radius: 15px;
        }

        .generar-audio-home-card.featured {
          grid-column: 1 / -1;
          min-height: 104px;
        }

        .generar-voice-library-page {
          grid-template-columns: 1fr;
        }

        .generar-selected-voice-bar {
          align-items: stretch;
          flex-direction: column;
          bottom: 4px;
        }

        .generar-selected-voice-bar .generar-primary-action {
          width: 100%;
        }

        .generar-audio-tool-intro {
          padding-right: 0;
          padding-top: 30px;
        }

        .generar-audio-tool-intro > .generar-audio-live,
        .generar-audio-tool-intro > .generar-audio-pending {
          left: 0;
          right: auto;
        }

        .generar-compact-voice {
          align-items: stretch;
          flex-direction: column;
        }

        .generar-compact-voice .generar-secondary-action {
          width: 100%;
        }

        .generar-audio-main-textarea {
          min-height: 210px;
        }

        .generar-audio-drawer {
          width: min(350px, 88vw);
        }
      }
    `}</style>
  );
}
