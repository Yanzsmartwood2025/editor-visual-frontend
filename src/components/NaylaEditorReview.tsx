import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { EditorReview } from '../lib/naylaEditorReview';
const time = (seconds: number) => `${Number(seconds.toFixed(2))} s`;
const CodePanel: React.FC<{ plan: EditorReview; onClose: () => void }> = ({ plan, onClose }) => {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return createPortal(<dialog ref={dialog} onCancel={onClose} onClose={onClose} aria-labelledby="editor-code-title" style={{ width: 'min(960px, 94vw)', maxHeight: '88dvh', padding: 20, border: '1px solid #555', borderRadius: 12, background: '#171717', color: '#fff' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <h3 id="editor-code-title">Código del plan</h3>
      <button type="button" onClick={onClose}>Volver al resumen</button>
    </div>
    <p>Estas son las instrucciones JSON guardadas que aplicará el editor al aceptar. Para cambiarlas, vuelve al chat.</p>
    <pre tabIndex={0} style={{ maxHeight: '60dvh', overflow: 'auto', padding: 12, background: '#080808', fontSize: 12, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><code>{JSON.stringify(plan.execution, null, 2)}</code></pre>
  </dialog>, document.body);
};
export const NaylaEditorReview: React.FC<{ plan: EditorReview; busy?: boolean; onDecision: (decision: 'accept' | 'cancel') => void }> = ({ plan, busy, onDecision }) => {
  const [showCode, setShowCode] = useState(false);
  const sections = Array.from(new Set(plan.rows.map(row => row.section)));
  return <section aria-label="Plan de edición" style={{ marginTop: 12, border: '1px solid #484848', borderRadius: 12, padding: 14, background: '#171717', color: '#f5f5f5' }}>
    <strong>Plan de edición · {time(plan.duration)}</strong>
    {plan.format && <p style={{ fontSize: 12 }}>{plan.format}</p>}
    {plan.execution && <button type="button" onClick={() => setShowCode(true)} style={{ marginTop: 10, padding: '8px 14px', borderRadius: 8, color: '#fff', background: '#333' }}>Ver código</button>}
    {showCode && <CodePanel plan={plan} onClose={() => setShowCode(false)} />}
    <p style={{ fontSize: 13 }}>Revisa el texto exacto y cada pista antes de {plan.render ? 'producir el video' : 'aplicar la edición'}.</p>
    {sections.map(section => <div key={section} style={{ marginBottom: 16 }}>
      <h4 style={{ margin: '8px 0' }}>{section}</h4>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
          <thead><tr>{['Medio / bloque', 'Inicio → fin', 'Duración', 'Contenido y tratamiento'].map(label => <th key={label} scope="col" style={{ padding: 6, borderBottom: '1px solid #555' }}>{label}</th>)}</tr></thead>
          <tbody>{plan.rows.filter(row => row.section === section).map((row, index) => <tr key={index}>
            <td style={{ padding: 6 }}>{row.resource}</td><td style={{ padding: 6, whiteSpace: 'nowrap' }}>{time(row.start)} → {time(row.end)}</td><td style={{ padding: 6 }}>{time(row.end - row.start)}</td>
            <td style={{ padding: 6, minWidth: 170 }}>
              {row.text !== undefined && <div style={{ whiteSpace: 'pre-wrap', padding: 8, background: '#252525', borderRadius: 6 }}>{row.text}</div>}
              <div style={{ marginTop: 4, color: '#ccc', overflowWrap: 'anywhere' }}>{row.details || 'Sin efectos adicionales'}</div>
            </td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>)}
    {!plan.rows.some(row => row.section === 'Subtítulos') && <p style={{ fontSize: 12 }}>Sin subtítulos.</p>}
    {plan.status === 'pending' ? <>
      <p style={{ fontSize: 12 }}>Para modificarlo, escribe el cambio en el chat. Una propuesta nueva reemplaza la anterior.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" disabled={busy} onClick={() => onDecision('accept')} style={{ padding: '10px 16px', borderRadius: 8, background: '#fff', color: '#111', cursor: 'pointer' }}>{busy ? 'Procesando…' : plan.render ? 'Aceptar y enviar a render' : 'Aceptar edición'}</button>
        <button type="button" disabled={busy} onClick={() => onDecision('cancel')} style={{ padding: '10px 16px', borderRadius: 8, color: '#fff', background: '#333', cursor: 'pointer' }}>Rechazar</button>
      </div>
    </> : <p role="status">{plan.status === 'accepted' ? 'Plan aceptado' : 'Plan cancelado o reemplazado'}</p>}
  </section>;
};
