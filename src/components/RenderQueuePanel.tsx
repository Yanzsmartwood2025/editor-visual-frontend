import React, { useEffect, useRef } from 'react';

export type RenderJob = {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'error' | 'cancelled' | 'failed';
  url: string | null;
  error: string | null;
  logs: string[];
};

type RenderQueuePanelProps = {
  jobs: Record<string, RenderJob>;
  visible: boolean;
  onOpen: () => void;
  onClose: () => void;
  onCancel: (jobId: string) => void;
  onRemove: (jobId: string) => void;
};

export const RenderQueuePanel: React.FC<RenderQueuePanelProps> = ({
  jobs,
  visible,
  onOpen,
  onClose,
  onCancel,
  onRemove,
}) => {
  const logsEndRef = useRef<HTMLDivElement | null>(null);
  const jobValues = Object.values(jobs);

  useEffect(() => {
    if (visible) logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [jobs, visible]);

  if (jobValues.length === 0) return null;

  const activeCount = jobValues.filter(job => job.status === 'processing' || job.status === 'queued').length;
  const indicatorColor = jobValues.some(job => job.status === 'processing')
    ? '#00ff00'
    : jobValues.some(job => job.status === 'error' || job.status === 'failed')
      ? '#ff4444'
      : jobValues.every(job => job.status === 'completed' || job.status === 'cancelled')
        ? '#888'
        : '#eab308';

  return (
    <>
      <div
        onClick={onOpen}
        style={{
          position: 'fixed',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: '#111',
          border: '1px solid #333',
          borderRadius: '20px',
          padding: '10px 20px',
          color: '#fff',
          zIndex: 9998,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          gap: '10px',
          fontSize: '14px',
          fontWeight: 'bold',
          transition: 'all 0.2s',
        }}
        className="render-queue-bar"
      >
        <div
          style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: indicatorColor,
            animation: jobValues.some(job => job.status === 'processing') ? 'pulse 1.5s infinite' : 'none',
          }}
        />
        RENDERS: {activeCount} ACTIVOS
      </div>

      {visible && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.85)',
            zIndex: 9999,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            backdropFilter: 'blur(5px)',
          }}
        >
          <div
            style={{
              backgroundColor: '#111',
              border: '1px solid #333',
              borderRadius: '12px',
              width: '95%',
              maxWidth: '600px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px', borderBottom: '1px solid #333', backgroundColor: '#0a0a0a' }}>
              <h3 style={{ margin: 0, color: '#fff', fontSize: '1.2rem' }}>Cola de Renders</h3>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '20px' }}>×</button>
            </div>

            <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {jobValues.map((job) => (
                <div
                  key={job.jobId}
                  style={{
                    backgroundColor: '#1a1a1a',
                    border: '1px solid #333',
                    borderRadius: '8px',
                    padding: '15px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '13px' }}>{job.jobId.slice(0, 12)}…</span>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 'bold',
                        textTransform: 'uppercase',
                        color:
                          job.status === 'completed'
                            ? '#00ff00'
                            : job.status === 'error' || job.status === 'failed'
                              ? '#ff4444'
                              : job.status === 'cancelled'
                                ? '#888'
                                : '#eab308',
                      }}
                    >
                      {job.status}
                    </span>
                  </div>

                  {job.url && (
                    <a href={job.url} target="_blank" rel="noreferrer" style={{ color: '#00ccff', fontSize: '12px', wordBreak: 'break-all' }}>
                      Abrir resultado
                    </a>
                  )}

                  {job.error && <div style={{ color: '#ff6666', fontSize: '12px', wordBreak: 'break-word' }}>{job.error}</div>}

                  {(job.status === 'queued' || job.status === 'processing' || job.logs?.length > 0) && (
                    <div
                      style={{
                        maxHeight: '130px',
                        overflowY: 'auto',
                        backgroundColor: '#050505',
                        border: '1px solid #222',
                        borderRadius: '6px',
                        padding: '8px',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        color: job.status === 'error' ? '#ff4444' : '#00ff00',
                      }}
                    >
                      {job.logs?.length ? job.logs.map((log, index) => <div key={index}>{log}</div>) : 'Iniciando...'}
                      <div ref={logsEndRef} />
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '5px' }}>
                    {(job.status === 'queued' || job.status === 'processing') && (
                      <button
                        onClick={() => onCancel(job.jobId)}
                        style={{ backgroundColor: '#441111', color: '#ff4444', border: '1px solid #ff4444', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        CANCELAR
                      </button>
                    )}
                    {(job.status === 'completed' || job.status === 'error' || job.status === 'failed' || job.status === 'cancelled') && (
                      <button
                        onClick={() => onRemove(job.jobId)}
                        style={{ backgroundColor: '#222', color: '#fff', border: '1px solid #444', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
                      >
                        CERRAR
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>

            <div style={{ padding: '15px 20px', borderTop: '1px solid #333', backgroundColor: '#0a0a0a', textAlign: 'center' }}>
              <button onClick={onClose} style={{ backgroundColor: '#fff', color: '#000', border: 'none', padding: '8px 20px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>
                MINIMIZAR
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{'@keyframes pulse {0%{opacity:1}50%{opacity:.4}100%{opacity:1}} .render-queue-bar:hover{background-color:#222!important}'}</style>
    </>
  );
};
