import React, { useCallback, useEffect, useState } from 'react';

type Props = {
  session: any;
  projectId: string;
  onAskNayla?: (item: any) => void;
};

const buttonStyle = (active = false): React.CSSProperties => ({
  border: active ? '1px solid rgba(255,255,255,.35)' : '1px solid rgba(255,255,255,.12)',
  background: active ? 'rgba(255,255,255,.11)' : 'rgba(255,255,255,.025)',
  color: active ? '#fff' : '#aaa',
  borderRadius: 9,
  padding: '6px 8px',
  fontSize: 9,
  cursor: 'pointer',
});

export default function GlobalSocialInbox({ session, projectId, onAskNayla }: Props) {
  const [items, setItems] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'responded'>('all');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');

  const api = useCallback(async (path: string, init: RequestInit = {}) => {
    const token = await session?.getIdToken?.();
    const response = await fetch(path, {
      ...init,
      headers: {
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(payload?.error || 'No se pudo completar la solicitud.'));
    return payload;
  }, [session]);

  const load = useCallback(async (nextFilter: 'all' | 'pending' | 'responded' = filter) => {
    if (!projectId || !session) return;
    setBusy('load');
    setNotice('');
    try {
      const payload = await api(
        '/api/social/feed?projectId=' + encodeURIComponent(projectId) +
        '&filter=' + encodeURIComponent(nextFilter) +
        '&limit=120'
      );
      setItems(payload.items || []);
      setSummary(payload.summary || null);
      setFilter(nextFilter);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo abrir la bandeja global.');
    } finally {
      setBusy('');
    }
  }, [api, filter, projectId, session]);

  useEffect(() => {
    void load('all');
  }, [projectId, session?.user?.id]);

  const toggleLike = async (item: any) => {
    const action = item.isLiked ? 'unlike' : 'like';
    setBusy('like-' + item.id);
    setNotice('');
    try {
      await api('/api/social/engagement', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          interactionId: item.id,
          action,
        }),
      });
      setItems((current) => current.map((entry) =>
        entry.id === item.id
          ? {
              ...entry,
              isLiked: action === 'like',
              likeCount: typeof entry.likeCount === 'number'
                ? Math.max(0, entry.likeCount + (action === 'like' ? 1 : -1))
                : entry.likeCount,
            }
          : entry
      ));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo actualizar el Me gusta.');
    } finally {
      setBusy('');
    }
  };

  return (
    <div style={{ padding: 10, border: '1px solid rgba(255,255,255,.08)', borderRadius: 14, background: '#0a0a0a' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 900 }}>BANDEJA GLOBAL</div>
          <div style={{ fontSize: 8.5, color: '#707070', marginTop: 2 }}>
            Todo lo que Nayla ha recogido de tus cuentas
          </div>
        </div>
        <button type="button" disabled={busy === 'load'} onClick={() => void load(filter)} style={buttonStyle(false)}>
          {busy === 'load' ? '…' : '↻'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 5, marginTop: 8, overflowX: 'auto' }}>
        {[
          ['all', 'Todo'],
          ['pending', 'Pendiente'],
          ['responded', 'Respondido'],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => void load(value as 'all' | 'pending' | 'responded')}
            style={buttonStyle(filter === value)}
          >
            {label}
          </button>
        ))}
      </div>

      {summary && (
        <div style={{ marginTop: 7, color: '#666', fontSize: 8.5 }}>
          {summary.total || 0} visibles · {summary.pending || 0} pendientes · {summary.responded || 0} respondidos
        </div>
      )}

      {notice && (
        <div style={{ marginTop: 8, padding: 8, borderRadius: 9, background: 'rgba(255,255,255,.035)', color: '#aaa', fontSize: 9 }}>
          {notice}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 9 }}>
        {items.map((item) => (
          <div key={item.id} style={{ padding: 9, borderRadius: 11, background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.045)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {item.avatarUrl ? (
                <img src={item.avatarUrl} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#171717', display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 900 }}>
                  {String(item.personName || '?').slice(0, 1).toUpperCase()}
                </div>
              )}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 9.5, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.personName || item.username || 'Persona'}
                </div>
                <div style={{ fontSize: 8, color: '#777', marginTop: 2 }}>
                  {String(item.platform || '').toUpperCase()} · {item.channel === 'dm' ? 'mensaje' : 'comentario'}
                </div>
              </div>
              <span style={{ fontSize: 7.5, color: '#777' }}>
                {item.responseState === 'responded' ? 'RESPONDIDO' : 'PENDIENTE'}
              </span>
            </div>

            <div style={{ fontSize: 9.5, lineHeight: 1.45, color: '#c9c9c9', marginTop: 7, whiteSpace: 'pre-wrap' }}>
              {item.message || 'Interacción sin texto'}
            </div>

            {item.responseText && (
              <div style={{ marginTop: 7, padding: 7, borderRadius: 8, background: 'rgba(255,255,255,.035)', color: '#8f8f8f', fontSize: 8.5 }}>
                Respuesta: {item.responseText}
              </div>
            )}

            <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
              {onAskNayla && (
                <button type="button" onClick={() => onAskNayla(item)} style={buttonStyle(false)}>
                  NAYLA
                </button>
              )}
              {item.canLike && (
                <button
                  type="button"
                  disabled={busy === 'like-' + item.id}
                  onClick={() => void toggleLike(item)}
                  style={buttonStyle(Boolean(item.isLiked))}
                >
                  {item.isLiked ? '♥ ME GUSTA' : '♡ ME GUSTA'}
                </button>
              )}
            </div>
          </div>
        ))}

        {!items.length && busy !== 'load' && (
          <div style={{ color: '#666', fontSize: 9, lineHeight: 1.45 }}>
            Todavía no hay actividad guardada con este filtro.
          </div>
        )}
      </div>
    </div>
  );
}
