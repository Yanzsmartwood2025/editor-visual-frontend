export default function VideoStyles() {
  return (
    <style>{`
.gpu-video-layout{max-width:1200px!important;width:100%;margin:auto}
.gpu-video-columns{display:grid;grid-template-columns:minmax(240px,.8fr) minmax(0,1.2fr);gap:20px;align-items:start}
.gpu-video-source,.gpu-video-form{display:flex;flex-direction:column;gap:14px;min-width:0}
.gpu-video-reference{width:100%;height:320px;object-fit:contain;background:rgba(0,0,0,.25);border-radius:18px}
.gpu-video-empty{height:250px;display:grid;place-items:center;border:1px dashed #666;border-radius:18px;color:#bbb}
.gpu-video-fields{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.gpu-video-layout label{display:flex;flex-direction:column;gap:8px;color:#ddd;font-size:13px}
.gpu-video-layout select,.gpu-video-layout input[type=number]{width:100%;box-sizing:border-box;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.17);border-radius:12px;padding:12px;color:#fff}
.gpu-video-layout option{background:#161616;color:white}
.gpu-video-presets{display:flex;gap:8px;flex-wrap:wrap}
.gpu-video-presets button{background:rgba(255,255,255,.045);border:1px solid #555;border-radius:20px;color:#ddd;padding:8px 12px;font-size:12px}
.gpu-video-advanced{border-top:1px solid #444;padding-top:14px}
.gpu-video-advanced summary{cursor:pointer;color:#ddd;margin-bottom:14px}
.gpu-video-note,.gpu-video-layout small{font-size:12px;line-height:1.6;color:#aaa}
.gpu-video-result{display:flex;flex-direction:column;gap:12px;margin-top:20px}
.gpu-video-result video{width:100%;max-height:65vh;object-fit:contain;background:#000;border-radius:16px}
.gpu-video-layout button:disabled{opacity:.45;cursor:not-allowed}
.gpu-video-clock{display:grid;gap:6px;padding:14px;border:1px solid rgba(255,255,255,.16);border-radius:14px;background:rgba(255,255,255,.04)}
.gpu-video-clock>strong{font-variant-numeric:tabular-nums;font-size:28px}
@media(max-width:760px){.gpu-video-columns{grid-template-columns:1fr}.gpu-video-reference{height:260px}.gpu-video-fields{grid-template-columns:1fr}}
`}</style>
  );
}
