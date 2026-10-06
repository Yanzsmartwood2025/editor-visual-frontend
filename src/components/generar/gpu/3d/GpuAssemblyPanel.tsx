import { getGpu3DWorkflow } from '../../../../lib/gpu/gpu3dPresentation';

type GpuAssemblyJob = {
  status: string;
  gpuName?: string | null;
  hourlyPrice?: number | null;
  progress?: { percent?: number; stage?: string } | null;
};

export default function GpuAssemblyPanel({
  job,
  message,
  elapsedLabel,
  onCancel,
  canceling,
}: {
  job: GpuAssemblyJob;
  message: string;
  elapsedLabel: string;
  onCancel: () => void;
  canceling: boolean;
}) {
  const workflow = getGpu3DWorkflow(job.status, job.progress?.percent);
  const isBooting = job.status === 'renting' || job.status === 'booting';
  const statusLabel =
    job.status === 'renting' ? 'BUSCANDO GPU' :
    job.status === 'booting' ? 'ARMÁNDOSE' :
    job.status === 'cleanup_pending' ? 'RETIRANDO GPU' : 'PROCESANDO 3D';

  return (
    <section className="nayla-gpu-build" aria-label="Progreso de Nayla Compute">
      <style>{`
        .nayla-gpu-build{position:relative;isolation:isolate;overflow:hidden;display:grid;gap:15px;padding:clamp(15px,4vw,23px);border:1px solid rgba(255,255,255,.2);border-radius:24px;background:radial-gradient(120% 100% at 50% 0%,rgba(255,255,255,.055),transparent 55%),linear-gradient(145deg,rgba(24,26,29,.98),rgba(9,10,12,.98));box-shadow:0 18px 45px rgba(0,0,0,.35),inset 0 1px rgba(255,255,255,.07);color:#f5f7f7}
        .nayla-gpu-build:before{position:absolute;z-index:-1;inset:0;content:"";background:linear-gradient(115deg,transparent 20%,rgba(255,255,255,.035) 48%,transparent 72%);animation:nayla-scan 5s linear infinite}
        .nayla-gpu-build__head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
        .nayla-gpu-build__eyebrow{display:block;color:#f2f3f5;font-size:.62rem;font-weight:800;letter-spacing:.2em}
        .nayla-gpu-build__head h3{margin:5px 0 3px;font-size:clamp(1rem,4vw,1.32rem);letter-spacing:.03em}
        .nayla-gpu-build__head p{margin:0;color:#a7adb2;font-size:.8rem;line-height:1.45}
        .nayla-gpu-build__badge{flex:0 0 auto;border:1px solid rgba(255,255,255,.28);border-radius:999px;padding:7px 10px;color:#ffffff;background:rgba(255,255,255,.045);font-size:.59rem;font-weight:800;letter-spacing:.09em}
        .nayla-gpu-build__machine{position:relative;display:grid;place-items:center;min-height:170px;overflow:hidden;border:1px solid rgba(255,255,255,.07);border-radius:18px;background:radial-gradient(ellipse at 50% 68%,rgba(255,255,255,.06),transparent 57%),linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.008))}
        .nayla-gpu-build__machine:after{position:absolute;right:9%;bottom:22px;left:9%;height:1px;content:"";background:linear-gradient(90deg,transparent,rgba(255,255,255,.42),transparent);box-shadow:0 0 15px rgba(255,255,255,.28)}
        .nayla-gpu-build__pc{position:relative;width:min(82%,390px);filter:drop-shadow(0 13px 18px rgba(255,255,255,.09));animation:nayla-pc-float 3.5s ease-in-out infinite}
        .nayla-gpu-build__svg{display:block;width:100%;height:auto;overflow:visible}
        .nayla-gpu-build__circuit{fill:none;stroke:#d7dbe0;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:4 15;opacity:.42}
        .nayla-gpu-build__circuit.is-live{opacity:1;filter:drop-shadow(0 0 5px rgba(255,255,255,.8));animation:nayla-electric-flow .75s linear infinite}
        .nayla-gpu-build__electric{fill:#ffffff;filter:drop-shadow(0 0 7px rgba(255,255,255,.7))}
        .nayla-gpu-build__stats{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;color:#bac0c4;font-size:.67rem;font-weight:750;letter-spacing:.04em}
        .nayla-gpu-build__stats span{border:1px solid rgba(255,255,255,.09);border-radius:999px;background:rgba(255,255,255,.035);padding:7px 10px}
        .nayla-gpu-build__stage{display:flex;justify-content:space-between;align-items:center;gap:10px;color:#dce2e4;font-size:.75rem;line-height:1.4}
        .nayla-gpu-build__stage strong{color:#ffffff;white-space:nowrap}
        .nayla-gpu-build__bar{height:8px;border-radius:999px;overflow:hidden;background:rgba(255,255,255,.1)}
        .nayla-gpu-build__bar i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#808890,#ffffff);box-shadow:0 0 14px rgba(255,255,255,.35);transition:width .7s ease}
        .nayla-gpu-build__bar i.is-indeterminate{width:34%;animation:nayla-progress-wait 1.6s ease-in-out infinite alternate}
        @keyframes nayla-progress-wait{from{transform:translateX(0);opacity:.55}to{transform:translateX(190%);opacity:1}}
        .nayla-gpu-build__steps{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:0;padding:0;list-style:none}
        .nayla-gpu-build__steps li{display:flex;align-items:center;gap:8px;min-width:0;min-height:36px;border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:6px 9px;color:#777e84;background:rgba(255,255,255,.018);font-size:.65rem;font-weight:700;line-height:1.2}
        .nayla-gpu-build__steps li[data-state="complete"]{color:#f0f2f4;border-color:rgba(255,255,255,.16)}
        .nayla-gpu-build__steps li[data-state="active"]{color:#ffffff;border-color:rgba(255,255,255,.5);background:rgba(255,255,255,.06);box-shadow:inset 0 0 18px rgba(255,255,255,.04)}
        .nayla-gpu-build__step-dot{display:grid;place-items:center;flex:0 0 21px;width:21px;height:21px;border:1px solid currentColor;border-radius:50%;font-size:.58rem}
        .nayla-gpu-build__steps li[data-state="active"] .nayla-gpu-build__step-dot{animation:nayla-active-step 1.5s ease-in-out infinite}
        .nayla-gpu-build__steps li span:last-child{overflow-wrap:anywhere}
        @keyframes nayla-electric-flow{to{stroke-dashoffset:-38}}
        @keyframes nayla-pc-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
        @keyframes nayla-active-step{50%{box-shadow:0 0 12px rgba(255,255,255,.55)}}
        @keyframes nayla-scan{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
        @media(max-width:420px){.nayla-gpu-build__machine{min-height:145px}.nayla-gpu-build__steps{gap:6px}.nayla-gpu-build__steps li{font-size:.59rem;padding:6px 7px}.nayla-gpu-build__badge{font-size:.53rem;padding:6px 8px}}
        @media(prefers-reduced-motion:reduce){.nayla-gpu-build:before,.nayla-gpu-build__pc,.nayla-gpu-build__circuit.is-live,.nayla-gpu-build__steps li[data-state="active"] .nayla-gpu-build__step-dot{animation:none}.nayla-gpu-build__bar i.is-indeterminate,.nayla-gpu-build__electric{display:none}}
      `}</style>
      <div className="nayla-gpu-build__head">
        <div>
          <span className="nayla-gpu-build__eyebrow">NAYLA COMPUTE · ESTACIÓN 3D</span>
          <h3>{job.gpuName || 'GPU temporal'} en preparación</h3>
          <p>{message}</p>
        </div>
        <span className="nayla-gpu-build__badge" role="status">{statusLabel}</span>
      </div>

      <div className="nayla-gpu-build__machine" aria-hidden="true">
        <div className="nayla-gpu-build__pc">
          <svg className="nayla-gpu-build__svg" viewBox="0 0 400 220" fill="none">
            <path d="M55 31Q55 20 68 20H332Q345 20 345 33V159Q345 171 332 171H68Q55 171 55 159V31Z" fill="url(#screen)" stroke="rgba(255,255,255,.58)" strokeWidth="2"/>
            <path d="M43 184Q43 176 54 174H346Q357 176 357 184L342 197H58L43 184Z" fill="url(#base)" stroke="rgba(255,255,255,.48)" strokeWidth="2"/>
            <path d="M78 46H322V146H78V46Z" fill="#15181b" stroke="rgba(255,255,255,.18)"/>
            <path d="M95 62H180V84H222V112H301" className={"nayla-gpu-build__circuit " + (isBooting ? 'is-live' : '')}/>
            <path d="M97 127H148V105H186V93H267V132H301" className={"nayla-gpu-build__circuit " + (isBooting ? 'is-live' : '')}/>
            <circle r="5" className="nayla-gpu-build__electric">
              <animateMotion dur="2.1s" repeatCount="indefinite" path="M95 62H180V84H222V112H301"/>
            </circle>
            <rect x="106" y="77" width="26" height="26" rx="5" fill="#252a2f" stroke="#e4e7eb" strokeWidth="2"/>
            <rect x="151" y="115" width="32" height="8" rx="4" fill="#545c64"/>
            <rect x="189" y="115" width="32" height="8" rx="4" fill="#545c64"/>
            <rect x="227" y="115" width="32" height="8" rx="4" fill="#545c64"/>
            <circle cx="287" cy="71" r="17" fill="#252a2f" stroke="#e4e7eb" strokeWidth="2"/>
            <path d="M287 59V83M275 71H299M279 63L295 79M295 63L279 79" stroke="#ffffff" strokeWidth="2" strokeLinecap="round"/>
            <path d="M195 179h10" stroke="rgba(255,255,255,.6)" strokeWidth="2" strokeLinecap="round"/>
            <defs>
              <linearGradient id="screen" x1="200" y1="20" x2="200" y2="171" gradientUnits="userSpaceOnUse"><stop stopColor="#2b3035"/><stop offset="1" stopColor="#111316"/></linearGradient>
              <linearGradient id="base" x1="200" y1="174" x2="200" y2="197" gradientUnits="userSpaceOnUse"><stop stopColor="#51575d"/><stop offset="1" stopColor="#181b1f"/></linearGradient>
            </defs>
          </svg>
        </div>
      </div>

      <div className="nayla-gpu-build__stats">
        <span>{job.gpuName || 'GPU'}</span>
        <span>TIEMPO {elapsedLabel}</span>
        {Number.isFinite(Number(job.hourlyPrice)) && <span>{'~$' + Number(job.hourlyPrice).toFixed(3) + '/h'}</span>}
      </div>
      <div className="nayla-gpu-build__stage">
        <span>{job.progress?.stage || message}</span><strong>{workflow.hasReportedProgress ? workflow.percent + '%' : 'ESPERANDO SEÑAL'}</strong>
      </div>
      <div
        className="nayla-gpu-build__bar"
        role="progressbar"
        aria-label={workflow.hasReportedProgress ? 'Avance reportado por la GPU' : 'Esperando el progreso del worker GPU'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={workflow.hasReportedProgress ? workflow.percent + '%' : 'Esperando actualización de la GPU'}
        {...(workflow.hasReportedProgress ? { 'aria-valuenow': workflow.percent } : {})}
      >
        <i className={workflow.hasReportedProgress ? '' : 'is-indeterminate'} style={workflow.hasReportedProgress ? { width: workflow.percent + '%' } : undefined}/>
      </div>
      <ol className="nayla-gpu-build__steps" aria-label="Pasos del proceso 3D">
        {workflow.steps.map((step, index) => (
          <li key={step.label} data-state={step.state}>
            <span className="nayla-gpu-build__step-dot">{step.state === 'complete' ? '✓' : index + 1}</span>
            <span>{step.label}</span>
          </li>
        ))}
      </ol>
      {job.status !== 'cleanup_pending' && (
        <button
          type="button"
          className="nayla-gpu-build__cancel"
          onClick={onCancel}
          disabled={canceling}
        >
          {canceling ? 'CANCELANDO Y DESTRUYENDO…' : 'CANCELAR Y DESTRUIR GPU'}
        </button>
      )}
      <style>{`.nayla-gpu-build__cancel{justify-self:start;border:1px solid rgba(255,255,255,.26);border-radius:12px;background:#17191c;color:#f1f2f4;padding:12px 16px;font-weight:800;letter-spacing:.04em;cursor:pointer}.nayla-gpu-build__cancel:disabled{opacity:.55;cursor:wait}`}</style>
    </section>
  );
}
