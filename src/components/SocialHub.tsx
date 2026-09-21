import React, { useEffect, useMemo, useState } from 'react';
import type { FirebaseSession } from '../lib/firebaseClient';
import { firebaseHeaders } from '../lib/apiClient';
import { SOCIAL_NETWORKS, type SocialPlatform } from '../lib/social/types';

type ResultMedia = {
  id: string;
  nombre?: string | null;
  etiqueta?: string | null;
  url?: string | null;
  tipo?: string | null;
};

type Props = {
  session: FirebaseSession | null;
  projectId: string | null;
  results: ResultMedia[];
};

const panel = {
  border: '1px solid rgba(255,255,255,.08)',
  background: 'linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.018))',
  borderRadius: 14,
};

const tinyButton = (active = false): React.CSSProperties => ({
  border: active ? '1px solid rgba(255,255,255,.35)' : '1px solid rgba(255,255,255,.1)',
  background: active ? 'rgba(255,255,255,.11)' : 'rgba(255,255,255,.035)',
  color: active ? '#fff' : '#aaa',
  borderRadius: 10,
  padding: '7px 9px',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '.25px',
  cursor: 'pointer',
});

const NetworkIcon = ({ platform, size = 30 }: { platform: string; size?: number }) => {
  const network = SOCIAL_NETWORKS.find((item) => item.id === platform);
  return (
    <div
      title={network?.label || platform}
      style={{
        width: size,
        height: size,
        flex: '0 0 auto',
        display: 'grid',
        placeItems: 'center',
        borderRadius: size * 0.32,
        background: 'radial-gradient(circle at 30% 20%,rgba(255,255,255,.15),rgba(255,255,255,.035) 55%,rgba(255,255,255,.015))',
        border: '1px solid rgba(255,255,255,.12)',
        color: '#fff',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.08),0 5px 18px rgba(0,0,0,.25)',
        fontSize: network?.short === 'in' ? size * .34 : size * .43,
        fontWeight: 900,
        fontFamily: 'Arial, sans-serif',
      }}
    >
      {network?.short || '•'}
    </div>
  );
};

const statusText: Record<string, string> = {
  connected: 'Conectada',
  disconnected: 'Desconectada',
  reauth: 'Reconectar',
  error: 'Error',
  publishing: 'Publicando',
  published: 'Publicado',
  failed: 'Falló',
  skipped: 'Omitido',
  scheduled: 'Programado',
  pending: 'Pendiente',
};

const unwrapMetrics = (value: any): { label: string; value: string | number }[] => {
  const root = value?.analytics || value || {};
  const candidates = root?.totals || root?.summary || root?.metrics || root;
  if (!candidates || typeof candidates !== 'object' || Array.isArray(candidates)) return [];
  return Object.entries(candidates)
    .filter(([, item]) => typeof item === 'number' || typeof item === 'string')
    .slice(0, 12)
    .map(([label, item]) => ({ label, value: item as any }));
};

export default function SocialHub({ session, projectId, results }: Props) {
  const [tab, setTab] = useState<'inicio' | 'publicar' | 'inbox' | 'metricas' | 'ajustes'>('inicio');
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedResult, setSelectedResult] = useState('');
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [commentTarget, setCommentTarget] = useState('');
  const [liveComments, setLiveComments] = useState<any[]>([]);
  const [replying, setReplying] = useState<Record<string, string>>({});
  const [analyticsAccount, setAnalyticsAccount] = useState('');
  const [analytics, setAnalytics] = useState<any>(null);
  const [inboxAccount, setInboxAccount] = useState('');
  const [conversations, setConversations] = useState<any[]>([]);
  const [policy, setPolicy] = useState({ mode: 'suggest', tone: 'amable, cercano y profesional', language: 'auto', instructions: '' });

  const api = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(path, {
      ...init,
      headers: firebaseHeaders(session, {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || 'No se pudo completar la acción.');
    return payload;
  };

  const load = async (refresh = false) => {
    if (!projectId || !session) return;
    setBusy(refresh ? 'sync' : 'load');
    try {
      const payload = await api(`/api/social/overview?projectId=${encodeURIComponent(projectId)}${refresh ? '&refresh=1' : ''}`);
      setData(payload);
      if (payload.policy) {
        setPolicy({
          mode: payload.policy.mode || 'suggest',
          tone: payload.policy.tone || 'amable, cercano y profesional',
          language: payload.policy.language || 'auto',
          instructions: payload.policy.instructions || '',
        });
      }
      const errors = Object.values(payload.providerErrors || {}).filter(Boolean);
      if (errors.length) setNotice(String(errors[0]));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo cargar REDES.');
    } finally {
      setBusy('');
    }
  };

  useEffect(() => {
    void load(false);
  }, [projectId, session?.user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined' || !projectId || !session) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('social_callback') !== '1') return;
    void (async () => {
      await load(true);
      params.delete('social_callback');
      params.delete('provider');
      params.delete('connected');
      params.delete('accountId');
      params.delete('username');
      params.delete('profileId');
      params.delete('connect_status');
      const query = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (query ? '?' + query : '') + window.location.hash);
      setNotice('Cuenta conectada. Nayla ya puede verla.');
    })();
  }, [projectId, session?.user?.id]);

  const accounts = data?.accounts || [];
  const connectedPlatforms = useMemo(() => new Set(accounts.filter((a: any) => a.status === 'connected').map((a: any) => a.platform)), [accounts]);
  const recentTargets = data?.targets || [];
  const providerA = data?.providers?.find((p: any) => p.id === 'upload_post');
  const providerB = data?.providers?.find((p: any) => p.id === 'zernio');

  const connect = async (provider: 'upload_post' | 'zernio', platform: SocialPlatform) => {
    if (!projectId) return;
    setBusy(`connect-${provider}-${platform}`);
    setNotice('');
    try {
      const payload = await api('/api/social/connect', {
        method: 'POST',
        body: JSON.stringify({ projectId, provider, platform }),
      });
      if (payload.authUrl) {
        window.location.href = payload.authUrl;
        return;
      }
      if (payload.connectionMode === 'instructions') {
        const details = payload.details || {};
        const instructions = Array.isArray(details.instructions) ? details.instructions.join(' · ') : '';
        setNotice([
          details.code ? `Código: ${details.code}` : '',
          details.botUsername ? `Bot: @${String(details.botUsername).replace(/^@/, '')}` : '',
          instructions,
        ].filter(Boolean).join(' — ') || 'Sigue las instrucciones de conexión y luego pulsa ↻.');
      } else {
        setNotice('La red requiere un paso de conexión adicional.');
      }
      setBusy('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo conectar.');
      setBusy('');
    }
  };

  const publish = async () => {
    if (!projectId || !selectedResult || !selectedAccounts.length) {
      setNotice('Selecciona un resultado y al menos una cuenta.');
      return;
    }
    setBusy('publish');
    setNotice('');
    try {
      const payload = await api('/api/social/publish', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          mediaId: selectedResult,
          accountIds: selectedAccounts,
          title,
          caption,
        }),
      });
      setNotice(`Publicación enviada: ${payload.published || 0} listas · ${payload.processing || 0} procesando · ${payload.failed || 0} fallidas.`);
      await load(true);
      setTab('inicio');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo publicar.');
    } finally {
      setBusy('');
    }
  };

  const fetchComments = async (targetId: string) => {
    if (!projectId) return;
    setBusy('comments');
    try {
      const payload = await api(`/api/social/comments?projectId=${encodeURIComponent(projectId)}&targetId=${encodeURIComponent(targetId)}`);
      setCommentTarget(targetId);
      setLiveComments(payload.comments || []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudieron traer comentarios.');
    } finally {
      setBusy('');
    }
  };

  const sendReply = async (comment: any) => {
    if (!projectId || !commentTarget) return;
    const commentId = String(comment.id || comment.comment_id || comment.commentId || '');
    const message = replying[commentId]?.trim();
    if (!message) return;
    setBusy('reply-' + commentId);
    try {
      await api('/api/social/comments', {
        method: 'POST',
        body: JSON.stringify({ projectId, targetId: commentTarget, commentId, message }),
      });
      setReplying((prev) => ({ ...prev, [commentId]: '' }));
      setNotice('Respuesta publicada.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo responder.');
    } finally {
      setBusy('');
    }
  };

  const fetchAnalytics = async (accountId: string) => {
    if (!projectId) return;
    setAnalyticsAccount(accountId);
    setBusy('analytics');
    try {
      const payload = await api(`/api/social/analytics?projectId=${encodeURIComponent(projectId)}&accountId=${encodeURIComponent(accountId)}`);
      setAnalytics(payload.analytics);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudieron cargar métricas.');
    } finally {
      setBusy('');
    }
  };

  const fetchInbox = async (accountId: string) => {
    if (!projectId) return;
    setInboxAccount(accountId);
    setBusy('inbox');
    try {
      const payload = await api(`/api/social/inbox?projectId=${encodeURIComponent(projectId)}&accountId=${encodeURIComponent(accountId)}`);
      setConversations(payload.conversations || []);
      if (payload.notice) setNotice(payload.notice);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo abrir el Inbox.');
    } finally {
      setBusy('');
    }
  };

  const savePolicy = async () => {
    if (!projectId) return;
    setBusy('policy');
    try {
      await api('/api/social/policy', {
        method: 'POST',
        body: JSON.stringify({ projectId, ...policy }),
      });
      setNotice('Reglas de Nayla guardadas.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudieron guardar las reglas.');
    } finally {
      setBusy('');
    }
  };

  if (!projectId) {
    return <div style={{ ...panel, padding: 14, color: '#888', fontSize: 11 }}>Selecciona un proyecto para abrir REDES.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '6px 1px 14px', color: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 950, letterSpacing: '1px' }}>NAYLA · REDES</div>
          <div style={{ fontSize: 9, color: '#777', marginTop: 3 }}>Publica · mide · conversa</div>
        </div>
        <button onClick={() => void load(true)} disabled={busy === 'sync'} style={tinyButton(false)}>
          {busy === 'sync' ? '…' : '↻'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 4 }}>
        {[
          ['inicio', 'Inicio'],
          ['publicar', 'Publicar'],
          ['inbox', 'Inbox'],
          ['metricas', 'Datos'],
          ['ajustes', 'IA'],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id as any)} style={{ ...tinyButton(tab === id), padding: '7px 2px', fontSize: 9 }}>
            {label}
          </button>
        ))}
      </div>

      {notice && (
        <div style={{ ...panel, padding: '9px 10px', fontSize: 10, color: '#d6d6d6', lineHeight: 1.45 }}>
          {notice}
        </div>
      )}

      {tab === 'inicio' && (
        <>
          <div style={{ ...panel, padding: 11 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 10, fontWeight: 900 }}>CUENTAS</span>
              <span style={{ fontSize: 9, color: '#777' }}>{accounts.length} conectadas</span>
            </div>
            {accounts.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {accounts.slice(0, 10).map((account: any) => (
                  <div key={account.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 8px', borderRadius: 10, background: 'rgba(255,255,255,.025)' }}>
                    <NetworkIcon platform={account.platform} size={28} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 10, fontWeight: 850, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {account.display_name || account.handle || account.username || account.platform}
                      </div>
                      <div style={{ fontSize: 8, color: account.status === 'connected' ? '#9d9' : '#d99', marginTop: 2 }}>
                        {statusText[account.status] || account.status} · ruta {account.provider === 'upload_post' ? 'A' : 'B'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 10, color: '#777', lineHeight: 1.5 }}>Aún no hay cuentas. Elige una red abajo para conectarla.</div>
            )}
          </div>

          <div style={{ ...panel, padding: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 900, marginBottom: 9 }}>CONECTAR RED</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 7 }}>
              {SOCIAL_NETWORKS.map((network) => (
                <div key={network.id} style={{ minWidth: 0, padding: '8px 4px', borderRadius: 11, background: connectedPlatforms.has(network.id) ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.022)', border: '1px solid rgba(255,255,255,.06)', textAlign: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center' }}><NetworkIcon platform={network.id} size={31} /></div>
                  <div style={{ fontSize: 8.5, fontWeight: 800, marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{network.label}</div>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 3, marginTop: 5 }}>
                    {network.uploadPostConnect && (
                      <button
                        title="Conectar por Ruta A"
                        disabled={!providerA?.configured || Boolean(busy)}
                        onClick={() => void connect('upload_post', network.id)}
                        style={{ ...tinyButton(false), padding: '3px 6px', fontSize: 8, opacity: providerA?.configured ? 1 : .3 }}
                      >A</button>
                    )}
                    {network.zernio && ['oauth', 'telegram_code'].includes(network.zernioConnectMode || 'oauth') ? (
                      <button
                        title={network.zernioConnectMode === 'telegram_code' ? 'Conectar por código · Ruta B' : 'Conectar por Ruta B'}
                        disabled={!providerB?.configured || Boolean(busy)}
                        onClick={() => void connect('zernio', network.id)}
                        style={{ ...tinyButton(false), padding: '3px 6px', fontSize: 8, opacity: providerB?.configured ? 1 : .3 }}
                      >B</button>
                    ) : network.zernio ? (
                      <span title="Conexión manual especializada" style={{ color: '#555', fontSize: 7, alignSelf: 'center' }}>MAN</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...panel, padding: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 900, marginBottom: 8 }}>ACTIVIDAD RECIENTE</div>
            {recentTargets.length ? recentTargets.slice(0, 8).map((target: any) => (
              <div key={target.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,.045)' }}>
                <NetworkIcon platform={target.platform} size={23} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 9, fontWeight: 800 }}>{statusText[target.status] || target.status}</div>
                  <div style={{ fontSize: 8, color: '#6f6f6f' }}>ruta {target.provider === 'upload_post' ? 'A' : 'B'}</div>
                </div>
                {target.post_url && <a href={target.post_url} target="_blank" rel="noreferrer" style={{ color: '#aaa', fontSize: 9, textDecoration: 'none' }}>↗</a>}
              </div>
            )) : <div style={{ color: '#707070', fontSize: 10 }}>Las publicaciones aparecerán aquí.</div>}
          </div>
        </>
      )}

      {tab === 'publicar' && (
        <div style={{ ...panel, padding: 11, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 900 }}>PUBLICAR RESULTADO</div>
          <select value={selectedResult} onChange={(event) => setSelectedResult(event.target.value)} style={{ width: '100%', background: '#0b0b0b', color: '#ddd', border: '1px solid #272727', borderRadius: 9, padding: 8, fontSize: 10 }}>
            <option value="">Seleccionar R1 / R2…</option>
            {results.map((item) => <option key={item.id} value={item.id}>{item.etiqueta || 'R'} · {item.nombre || 'Video'}</option>)}
          </select>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Título" style={{ background: '#0b0b0b', color: '#eee', border: '1px solid #272727', borderRadius: 9, padding: 8, fontSize: 10 }} />
          <textarea value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Descripción / caption" rows={4} style={{ resize: 'vertical', background: '#0b0b0b', color: '#eee', border: '1px solid #272727', borderRadius: 9, padding: 8, fontSize: 10, lineHeight: 1.45 }} />
          <div style={{ fontSize: 9, color: '#777' }}>DESTINOS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {accounts.filter((a: any) => a.status === 'connected').map((account: any) => {
              const checked = selectedAccounts.includes(account.id);
              return (
                <label key={account.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 7, borderRadius: 9, background: checked ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.02)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={checked} onChange={() => setSelectedAccounts((prev) => checked ? prev.filter((id) => id !== account.id) : [...prev, account.id])} />
                  <NetworkIcon platform={account.platform} size={24} />
                  <span style={{ fontSize: 9, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.display_name || account.handle || account.platform}</span>
                  <span style={{ color: '#666', fontSize: 8 }}>{account.provider === 'upload_post' ? 'A' : 'B'}</span>
                </label>
              );
            })}
          </div>
          <button disabled={busy === 'publish'} onClick={() => void publish()} style={{ ...tinyButton(true), width: '100%', padding: 10 }}>
            {busy === 'publish' ? 'PUBLICANDO…' : `PUBLICAR EN ${selectedAccounts.length || 0} DESTINO${selectedAccounts.length === 1 ? '' : 'S'}`}
          </button>
        </div>
      )}

      {tab === 'inbox' && (
        <>
          <div style={{ ...panel, padding: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 900, marginBottom: 8 }}>COMENTARIOS POR PUBLICACIÓN</div>
            <select value={commentTarget} onChange={(event) => void fetchComments(event.target.value)} style={{ width: '100%', background: '#0b0b0b', color: '#ddd', border: '1px solid #272727', borderRadius: 9, padding: 8, fontSize: 9 }}>
              <option value="">Selecciona una publicación…</option>
              {recentTargets.filter((target: any) => target.provider_post_id || target.post_url).map((target: any) => (
                <option key={target.id} value={target.id}>{target.platform} · {statusText[target.status] || target.status}</option>
              ))}
            </select>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 9 }}>
              {liveComments.map((comment: any, index: number) => {
                const id = String(comment.id || comment.comment_id || comment.commentId || index);
                const author = comment.from?.name || comment.author?.name || comment.username || comment.user?.display_name || 'Usuario';
                const message = comment.message || comment.text || comment.content || '';
                return (
                  <div key={id} style={{ padding: 9, borderRadius: 10, background: 'rgba(255,255,255,.025)' }}>
                    <div style={{ fontSize: 9, fontWeight: 900 }}>{author}</div>
                    <div style={{ fontSize: 9, color: '#bbb', lineHeight: 1.45, marginTop: 4 }}>{String(message)}</div>
                    <div style={{ display: 'flex', gap: 5, marginTop: 7 }}>
                      <input value={replying[id] || ''} onChange={(event) => setReplying((prev) => ({ ...prev, [id]: event.target.value }))} placeholder="Responder…" style={{ flex: 1, minWidth: 0, background: '#0a0a0a', color: '#ddd', border: '1px solid #242424', borderRadius: 8, padding: 6, fontSize: 9 }} />
                      <button onClick={() => void sendReply(comment)} style={{ ...tinyButton(false), padding: '5px 7px' }}>↗</button>
                    </div>
                  </div>
                );
              })}
              {commentTarget && !liveComments.length && busy !== 'comments' && <div style={{ color: '#666', fontSize: 9 }}>No hay comentarios visibles todavía.</div>}
            </div>
          </div>

          <div style={{ ...panel, padding: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 900, marginBottom: 8 }}>MENSAJES</div>
            <select value={inboxAccount} onChange={(event) => void fetchInbox(event.target.value)} style={{ width: '100%', background: '#0b0b0b', color: '#ddd', border: '1px solid #272727', borderRadius: 9, padding: 8, fontSize: 9 }}>
              <option value="">Selecciona una cuenta…</option>
              {accounts.map((account: any) => <option key={account.id} value={account.id}>{account.platform} · {account.display_name || account.handle || account.username || 'Cuenta'}</option>)}
            </select>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {conversations.slice(0, 12).map((conversation: any, index: number) => (
                <div key={conversation._id || conversation.id || index} style={{ padding: 8, borderRadius: 9, background: 'rgba(255,255,255,.025)' }}>
                  <div style={{ fontSize: 9, fontWeight: 850 }}>{conversation.participant?.name || conversation.participantName || conversation.username || 'Conversación'}</div>
                  <div style={{ fontSize: 8.5, color: '#888', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conversation.lastMessage?.text || conversation.lastMessage || conversation.preview || 'Abrir conversación'}</div>
                </div>
              ))}
              {inboxAccount && !conversations.length && busy !== 'inbox' && <div style={{ color: '#666', fontSize: 9 }}>No hay conversaciones disponibles para esta ruta/cuenta.</div>}
            </div>
          </div>
        </>
      )}

      {tab === 'metricas' && (
        <div style={{ ...panel, padding: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 900, marginBottom: 8 }}>RENDIMIENTO</div>
          <select value={analyticsAccount} onChange={(event) => void fetchAnalytics(event.target.value)} style={{ width: '100%', background: '#0b0b0b', color: '#ddd', border: '1px solid #272727', borderRadius: 9, padding: 8, fontSize: 9 }}>
            <option value="">Selecciona una cuenta…</option>
            {accounts.map((account: any) => <option key={account.id} value={account.id}>{account.platform} · {account.display_name || account.handle || account.username || 'Cuenta'}</option>)}
          </select>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 6, marginTop: 9 }}>
            {unwrapMetrics(analytics).map((metric) => (
              <div key={metric.label} style={{ padding: 9, borderRadius: 10, background: 'rgba(255,255,255,.025)' }}>
                <div style={{ fontSize: 8, color: '#707070', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis' }}>{metric.label}</div>
                <div style={{ fontSize: 14, fontWeight: 900, marginTop: 3 }}>{String(metric.value)}</div>
              </div>
            ))}
          </div>
          {analyticsAccount && analytics && !unwrapMetrics(analytics).length && (
            <pre style={{ marginTop: 9, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 8, color: '#777', maxHeight: 240, overflow: 'auto' }}>{JSON.stringify(analytics, null, 2)}</pre>
          )}
        </div>
      )}

      {tab === 'ajustes' && (
        <>
          <div style={{ ...panel, padding: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 900 }}>RUTAS DE CONEXIÓN</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <div style={{ flex: 1, padding: 8, borderRadius: 9, background: 'rgba(255,255,255,.025)' }}>
                <div style={{ fontSize: 9, fontWeight: 900 }}>Ruta A</div>
                <div style={{ fontSize: 8, color: providerA?.configured ? '#9d9' : '#d99', marginTop: 3 }}>{providerA?.configured ? 'Lista' : 'Falta clave'}</div>
              </div>
              <div style={{ flex: 1, padding: 8, borderRadius: 9, background: 'rgba(255,255,255,.025)' }}>
                <div style={{ fontSize: 9, fontWeight: 900 }}>Ruta B</div>
                <div style={{ fontSize: 8, color: providerB?.configured ? '#9d9' : '#d99', marginTop: 3 }}>{providerB?.configured ? 'Lista' : 'Falta clave'}</div>
              </div>
            </div>
          </div>

          <div style={{ ...panel, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 900 }}>NAYLA RESPONDE</div>
              <div style={{ fontSize: 8.5, color: '#777', marginTop: 3 }}>El usuario decide cuánto control darle.</div>
            </div>
            <select value={policy.mode} onChange={(event) => setPolicy((prev) => ({ ...prev, mode: event.target.value }))} style={{ background: '#0b0b0b', color: '#ddd', border: '1px solid #272727', borderRadius: 9, padding: 8, fontSize: 9 }}>
              <option value="off">Desactivado</option>
              <option value="suggest">Sugerir respuesta</option>
              <option value="auto">Responder automáticamente</option>
            </select>
            <input value={policy.tone} onChange={(event) => setPolicy((prev) => ({ ...prev, tone: event.target.value }))} placeholder="Tono de respuesta" style={{ background: '#0b0b0b', color: '#ddd', border: '1px solid #272727', borderRadius: 9, padding: 8, fontSize: 9 }} />
            <textarea value={policy.instructions} onChange={(event) => setPolicy((prev) => ({ ...prev, instructions: event.target.value }))} placeholder="Ej.: amable, no discutir; precios → invitar a privado; quejas → pedirme aprobación." rows={5} style={{ resize: 'vertical', background: '#0b0b0b', color: '#ddd', border: '1px solid #272727', borderRadius: 9, padding: 8, fontSize: 9, lineHeight: 1.45 }} />
            <button onClick={() => void savePolicy()} style={{ ...tinyButton(true), width: '100%' }}>{busy === 'policy' ? 'GUARDANDO…' : 'GUARDAR REGLAS'}</button>
          </div>
        </>
      )}
    </div>
  );
}
