import React, { useEffect, useMemo, useState } from 'react';
import type { FirebaseSession } from '../lib/firebaseClient';
import { firebaseHeaders } from '../lib/apiClient';
import { SOCIAL_NETWORKS } from '../lib/social/types';

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
  onClose?: () => void;
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

type NaylaOption = {
  value: string;
  label: string;
  subtitle?: string;
  platform?: string;
};

const NaylaSelect = ({
  value,
  placeholder,
  options,
  onChange,
}: {
  value: string;
  placeholder: string;
  options: NaylaOption[];
  onChange: (value: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        style={{
          width: '100%',
          minHeight: 46,
          padding: '9px 12px',
          borderRadius: 11,
          border: open ? '1px solid rgba(255,255,255,.5)' : '1px solid rgba(255,255,255,.14)',
          background: '#0b0b0b',
          color: selected ? '#eee' : '#888',
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          textAlign: 'left',
          cursor: 'pointer',
          boxShadow: open ? '0 0 0 1px rgba(255,255,255,.08)' : 'none',
        }}
      >
        {selected?.platform ? <NetworkIcon platform={selected.platform} size={25} /> : null}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 10, fontWeight: selected ? 800 : 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selected?.label || placeholder}
          </span>
          {selected?.subtitle ? (
            <span style={{ display: 'block', marginTop: 2, color: '#777', fontSize: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selected.subtitle}
            </span>
          ) : null}
        </span>
        <span style={{ color: '#aaa', fontSize: 16, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease' }}>⌄</span>
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Cerrar selector"
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9996,
              border: 0,
              background: 'rgba(0,0,0,.42)',
              padding: 0,
            }}
          />
          <div
            style={{
              position: 'fixed',
              left: 18,
              right: 18,
              bottom: 18,
              zIndex: 9997,
              maxHeight: '62dvh',
              overflowY: 'auto',
              borderRadius: 18,
              border: '1px solid rgba(255,255,255,.16)',
              background: '#0b0b0b',
              boxShadow: '0 20px 60px rgba(0,0,0,.75)',
              padding: 8,
            }}
          >
            <div style={{ padding: '7px 9px 10px', color: '#777', fontSize: 9, fontWeight: 850, letterSpacing: '.5px' }}>
              {placeholder.toUpperCase()}
            </div>
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  style={{
                    width: '100%',
                    minHeight: 50,
                    border: 0,
                    borderTop: '1px solid rgba(255,255,255,.055)',
                    borderRadius: 10,
                    background: active ? 'rgba(255,255,255,.09)' : 'transparent',
                    color: '#eee',
                    padding: '8px 9px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  {option.platform ? <NetworkIcon platform={option.platform} size={28} /> : null}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 11, fontWeight: active ? 900 : 750, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {option.label}
                    </span>
                    {option.subtitle ? (
                      <span style={{ display: 'block', marginTop: 3, color: '#777', fontSize: 8.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {option.subtitle}
                      </span>
                    ) : null}
                  </span>
                  <span style={{ width: 20, height: 20, borderRadius: '50%', border: active ? '2px solid #fff' : '1px solid #555', display: 'grid', placeItems: 'center' }}>
                    {active ? <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#fff' }} /> : null}
                  </span>
                </button>
              );
            })}
            {!options.length && (
              <div style={{ padding: 14, color: '#666', fontSize: 10 }}>No hay opciones disponibles.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const metricLabels: Record<string, string> = {
  followers: 'Seguidores',
  reach: 'Alcance',
  impressions: 'Impresiones',
  profileViews: 'Visitas al perfil',
  profile_views: 'Visitas al perfil',
  views: 'Vistas',
  videoViews: 'Vistas de video',
  video_views: 'Vistas de video',
  likes: 'Me gusta',
  comments: 'Comentarios',
  shares: 'Compartidos',
  saves: 'Guardados',
  clicks: 'Clics',
  engagement: 'Interacción',
};

const unwrapMetrics = (value: any): { label: string; value: string | number }[] => {
  const root = value?.analytics || value || {};
  const direct = root?.totals || root?.summary || root?.metrics || root;
  let candidates = direct;

  if (candidates && typeof candidates === 'object' && !Array.isArray(candidates)) {
    const scalarCount = Object.values(candidates).filter((item) => typeof item === 'number' || typeof item === 'string').length;
    if (!scalarCount) {
      const nested = Object.values(candidates).find((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
        return Object.values(item as Record<string, unknown>).some((child) => typeof child === 'number' || typeof child === 'string');
      });
      if (nested) candidates = nested;
    }
  }

  if (!candidates || typeof candidates !== 'object' || Array.isArray(candidates)) return [];
  return Object.entries(candidates)
    .filter(([, item]) => typeof item === 'number' || typeof item === 'string')
    .slice(0, 12)
    .map(([label, item]) => ({
      label: metricLabels[label] || label.replace(/_/g, ' '),
      value: item as string | number,
    }));
};

export default function SocialHub({ session, projectId, results, onClose }: Props) {
  const [tab, setTab] = useState<'inicio' | 'publicar' | 'inbox' | 'metricas' | 'ajustes'>('inicio');
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedResult, setSelectedResult] = useState('');
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [commentTarget, setCommentTarget] = useState('');
  const [commentAccount, setCommentAccount] = useState('');
  const [commentMedia, setCommentMedia] = useState<any[]>([]);
  const [commentSource, setCommentSource] = useState<any>(null);
  const [liveComments, setLiveComments] = useState<any[]>([]);
  const [replying, setReplying] = useState<Record<string, string>>({});
  const [analyticsAccount, setAnalyticsAccount] = useState('');
  const [analytics, setAnalytics] = useState<any>(null);
  const [inboxAccount, setInboxAccount] = useState('');
  const [inboxNotice, setInboxNotice] = useState('');
  const [conversations, setConversations] = useState<any[]>([]);
  const [inboxConversation, setInboxConversation] = useState<any>(null);
  const [inboxMessages, setInboxMessages] = useState<any[]>([]);
  const [messageDraft, setMessageDraft] = useState('');
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

  const connectNetwork = async (network: (typeof SOCIAL_NETWORKS)[number]) => {
    if (!projectId) return;

    const candidates: Array<'upload_post' | 'zernio'> = [];
    if (providerA?.configured && network.uploadPostConnect) candidates.push('upload_post');
    if (
      providerB?.configured &&
      network.zernio &&
      ['oauth', 'telegram_code'].includes(network.zernioConnectMode || 'oauth')
    ) {
      candidates.push('zernio');
    }

    if (!candidates.length) {
      const manual =
        providerB?.configured &&
        network.zernio &&
        ['credentials', 'oauth_channel'].includes(network.zernioConnectMode || '');
      setNotice(
        manual
          ? `${network.label} necesita un paso de conexión especial que todavía no está habilitado en la interfaz.`
          : 'Las conexiones sociales todavía no están activas en este despliegue. Revisa las variables de entorno de Producción.'
      );
      return;
    }

    setBusy(`connect-${network.id}`);
    setNotice('');
    let lastError = '';

    for (const provider of candidates) {
      try {
        const payload = await api('/api/social/connect', {
          method: 'POST',
          body: JSON.stringify({ projectId, provider, platform: network.id }),
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
          setBusy('');
          return;
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'No se pudo conectar.';
      }
    }

    setNotice(lastError || 'No se pudo iniciar la conexión de esta red.');
    setBusy('');
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

  const fetchCommentMedia = async (accountId: string) => {
    if (!projectId || !accountId) return;
    setCommentAccount(accountId);
    setCommentTarget('');
    setCommentSource(null);
    setLiveComments([]);
    setBusy('comment-media');
    try {
      const payload = await api(`/api/social/media?projectId=${encodeURIComponent(projectId)}&accountId=${encodeURIComponent(accountId)}`);
      setCommentMedia(payload.media || []);
      if (payload.notice) setNotice(payload.notice);
    } catch (error) {
      setCommentMedia([]);
      setNotice(error instanceof Error ? error.message : 'No se pudieron traer las publicaciones de esta cuenta.');
    } finally {
      setBusy('');
    }
  };

  const fetchComments = async (mediaId: string) => {
    if (!projectId || !commentAccount || !mediaId) return;
    const media = commentMedia.find((item: any) => String(item.id) === String(mediaId));
    if (!media) return;

    setBusy('comments');
    setCommentTarget(String(media.id));
    setCommentSource({
      accountId: commentAccount,
      postId: String(media.id),
      postUrl: media.permalink || null,
      platform: accounts.find((account: any) => account.id === commentAccount)?.platform || 'social',
    });
    try {
      const params = new URLSearchParams({
        projectId,
        accountId: commentAccount,
        postId: String(media.id),
      });
      if (media.permalink) params.set('postUrl', String(media.permalink));
      const payload = await api('/api/social/comments?' + params.toString());
      setLiveComments(payload.comments || []);
    } catch (error) {
      setLiveComments([]);
      setNotice(error instanceof Error ? error.message : 'No se pudieron traer comentarios.');
    } finally {
      setBusy('');
    }
  };

  const sendReply = async (comment: any) => {
    if (!projectId || !commentSource?.accountId || !commentSource?.postId) return;
    const commentId = String(comment.id || comment.comment_id || comment.commentId || '');
    const message = replying[commentId]?.trim();
    if (!message) return;
    setBusy('reply-' + commentId);
    try {
      await api('/api/social/comments', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          accountId: commentSource.accountId,
          postId: commentSource.postId,
          postUrl: commentSource.postUrl || undefined,
          commentId,
          message,
        }),
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
    setInboxNotice('');
    setInboxConversation(null);
    setInboxMessages([]);
    setMessageDraft('');
    setBusy('inbox');
    try {
      const payload = await api(`/api/social/inbox?projectId=${encodeURIComponent(projectId)}&accountId=${encodeURIComponent(accountId)}`);
      setConversations(payload.conversations || []);
      setInboxNotice(payload.notice || '');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo abrir el Inbox.');
    } finally {
      setBusy('');
    }
  };

  const openInboxConversation = async (conversation: any) => {
    if (!projectId || !inboxAccount) return;
    const conversationId = String(conversation?.id || conversation?._id || '');
    if (!conversationId) return;
    setInboxConversation(conversation);
    setBusy('messages');
    try {
      const payload = await api(
        `/api/social/inbox?projectId=${encodeURIComponent(projectId)}&accountId=${encodeURIComponent(inboxAccount)}&conversationId=${encodeURIComponent(conversationId)}`
      );
      setInboxMessages(payload.messages || conversation.messages || []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo abrir la conversación.');
    } finally {
      setBusy('');
    }
  };

  const sendInboxMessage = async () => {
    if (!projectId || !inboxAccount || !inboxConversation || !messageDraft.trim()) return;
    const conversationId = String(inboxConversation?.id || inboxConversation?._id || '');
    const recipientId = String(inboxConversation?.participantId || inboxConversation?.participant?.id || '');
    const text = messageDraft.trim();
    setBusy('send-message');
    try {
      await api('/api/social/inbox', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          accountId: inboxAccount,
          conversationId: conversationId || undefined,
          recipientId: recipientId || undefined,
          message: text,
        }),
      });
      setInboxMessages((prev) => [
        ...prev,
        { id: `local-${Date.now()}`, message: text, text, direction: 'outbound', createdTime: new Date().toISOString() },
      ]);
      setMessageDraft('');
      setNotice('Mensaje enviado.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo enviar el mensaje.');
    } finally {
      setBusy('');
    }
  };

  const suggestReply = async (comment: any, commentId: string, author: string) => {
    if (!projectId || !commentSource) return;
    const commentText = String(comment.message || comment.text || comment.content || '').trim();
    if (!commentText) return;
    setBusy('suggest-' + commentId);
    try {
      const payload = await api('/api/social/suggest', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          platform: commentSource.platform || 'social',
          authorName: author,
          commentText,
        }),
      });
      setReplying((prev) => ({ ...prev, [commentId]: payload.suggestion || '' }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Nayla no pudo sugerir una respuesta.');
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
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9850,
        width: '100dvw',
        height: '100dvh',
        boxSizing: 'border-box',
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '14px 14px 34px',
        background: '#050505',
        color: '#fff',
      }}
    >
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          margin: '-14px -14px 0',
          padding: '12px 14px',
          minHeight: 62,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          background: 'rgba(5,5,5,.97)',
          borderBottom: '1px solid rgba(255,255,255,.08)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
        }}
      >
        <div>
          <div style={{ fontSize: 17, fontWeight: 950, letterSpacing: '1.2px' }}>REDES</div>
          <div style={{ fontSize: 10, color: '#777', marginTop: 3 }}>Publica · mide · conversa</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <button
            type="button"
            aria-label="Actualizar redes"
            onClick={() => void load(true)}
            disabled={busy === 'sync'}
            style={{ ...tinyButton(false), width: 34, height: 34, padding: 0, fontSize: 15 }}
          >
            {busy === 'sync' ? '…' : '↻'}
          </button>
          <button
            type="button"
            aria-label="Cerrar Redes"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              width: 34,
              height: 34,
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              fontSize: 29,
              fontWeight: 300,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        </div>
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
                        {statusText[account.status] || account.status}
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
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6 }}>
                    {(() => {
                      const canConnect =
                        Boolean(providerA?.configured && network.uploadPostConnect) ||
                        Boolean(
                          providerB?.configured &&
                          network.zernio &&
                          ['oauth', 'telegram_code'].includes(network.zernioConnectMode || 'oauth')
                        );
                      const isConnecting = busy === `connect-${network.id}`;
                      return (
                        <button
                          title={canConnect ? `Conectar ${network.label}` : 'Conexión no disponible todavía'}
                          disabled={!canConnect || Boolean(busy)}
                          onClick={() => void connectNetwork(network)}
                          style={{
                            ...tinyButton(canConnect),
                            minWidth: 72,
                            padding: '5px 8px',
                            fontSize: 8,
                            opacity: canConnect ? 1 : .38,
                          }}
                        >
                          {isConnecting ? '…' : canConnect ? 'Conectar' : 'Pendiente'}
                        </button>
                      );
                    })()}
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
                  <div style={{ fontSize: 8, color: '#6f6f6f' }}>{target.platform}</div>
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
          <NaylaSelect
            value={selectedResult}
            placeholder="Seleccionar R1 / R2"
            onChange={setSelectedResult}
            options={results.map((item) => ({
              value: item.id,
              label: `${item.etiqueta || 'R'} · ${item.nombre || 'Video'}`,
              subtitle: 'Resultado de Nayla',
            }))}
          />
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
                  <span style={{ color: '#666', fontSize: 8 }}>{statusText[account.status] || account.status}</span>
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
            <div style={{ fontSize: 10, fontWeight: 900, marginBottom: 8 }}>COMENTARIOS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <NaylaSelect
                value={commentAccount}
                placeholder="Seleccionar cuenta"
                onChange={(value) => void fetchCommentMedia(value)}
                options={accounts
                  .filter((account: any) => account.status === 'connected' && (
                    !Array.isArray(account.capabilities) || account.capabilities.includes('comments')
                  ))
                  .map((account: any) => ({
                    value: account.id,
                    label: account.display_name || account.handle || account.username || account.platform,
                    subtitle: account.handle ? `@${String(account.handle).replace(/^@/, '')}` : 'Cuenta conectada',
                    platform: account.platform,
                  }))}
              />
              <NaylaSelect
                value={commentTarget}
                placeholder={busy === 'comment-media' ? 'Cargando publicaciones…' : 'Seleccionar publicación'}
                onChange={(value) => void fetchComments(value)}
                options={commentMedia.map((media: any) => ({
                  value: String(media.id),
                  label: String(media.caption || 'Publicación sin texto').slice(0, 72),
                  subtitle: media.timestamp ? new Date(media.timestamp).toLocaleDateString('es') : 'Publicación reciente',
                  platform: accounts.find((account: any) => account.id === commentAccount)?.platform,
                }))}
              />
            </div>
            {commentAccount && !commentMedia.length && busy !== 'comment-media' && (
              <div style={{ marginTop: 8, color: '#666', fontSize: 9, lineHeight: 1.45 }}>
                No encontré publicaciones recientes en esta cuenta.
              </div>
            )}
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
                      <button
                        onClick={() => void suggestReply(comment, id, author)}
                        disabled={busy === 'suggest-' + id}
                        title="Pedir a Nayla una respuesta"
                        style={{ ...tinyButton(false), padding: '5px 7px', fontSize: 8 }}
                      >{busy === 'suggest-' + id ? '…' : 'N'}</button>
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
            <NaylaSelect
              value={inboxAccount}
              placeholder="Seleccionar cuenta"
              onChange={(value) => void fetchInbox(value)}
              options={accounts.map((account: any) => ({
                value: account.id,
                label: account.display_name || account.handle || account.username || 'Cuenta',
                subtitle: 'Mensajes privados',
                platform: account.platform,
              }))}
            />
            {inboxNotice && (
              <div style={{ marginTop: 8, padding: '8px 9px', borderRadius: 9, background: 'rgba(255,255,255,.025)', color: '#777', fontSize: 9, lineHeight: 1.45 }}>
                {inboxNotice}
              </div>
            )}
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {conversations.slice(0, 12).map((conversation: any, index: number) => {
                const conversationId = String(conversation._id || conversation.id || index);
                const active = String(inboxConversation?._id || inboxConversation?.id || '') === conversationId;
                return (
                  <button
                    key={conversationId}
                    onClick={() => void openInboxConversation(conversation)}
                    style={{
                      textAlign: 'left',
                      padding: 8,
                      borderRadius: 9,
                      border: active ? '1px solid rgba(255,255,255,.24)' : '1px solid rgba(255,255,255,.045)',
                      background: active ? 'rgba(255,255,255,.075)' : 'rgba(255,255,255,.025)',
                      color: '#ddd',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: 9, fontWeight: 850 }}>{conversation.participant?.name || conversation.participantName || conversation.username || 'Conversación'}</div>
                    <div style={{ fontSize: 8.5, color: '#888', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conversation.lastMessage?.text || conversation.lastMessage || conversation.preview || 'Abrir conversación'}</div>
                  </button>
                );
              })}
              {inboxAccount && !conversations.length && busy !== 'inbox' && <div style={{ color: '#666', fontSize: 9 }}>No hay conversaciones disponibles para esta ruta/cuenta.</div>}
            </div>

            {inboxConversation && (
              <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,.07)', paddingTop: 9 }}>
                <div style={{ fontSize: 9, fontWeight: 900, marginBottom: 7 }}>
                  {inboxConversation.participant?.name || inboxConversation.participantName || inboxConversation.username || 'Conversación'}
                </div>
                <div style={{ maxHeight: 230, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 2 }}>
                  {inboxMessages.map((message: any, index: number) => {
                    const text = String(message.message || message.text || message.content || '');
                    const outbound = message.direction === 'outbound' || message.isFromMe === true || message.fromMe === true;
                    return (
                      <div
                        key={message.id || message._id || index}
                        style={{
                          alignSelf: outbound ? 'flex-end' : 'flex-start',
                          maxWidth: '88%',
                          padding: '7px 8px',
                          borderRadius: 10,
                          background: outbound ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.035)',
                          fontSize: 9,
                          color: '#ccc',
                          lineHeight: 1.4,
                        }}
                      >
                        {text || 'Mensaje multimedia'}
                      </div>
                    );
                  })}
                  {!inboxMessages.length && busy !== 'messages' && <div style={{ color: '#666', fontSize: 9 }}>Sin mensajes visibles.</div>}
                </div>
                <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
                  <input
                    value={messageDraft}
                    onChange={(event) => setMessageDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void sendInboxMessage();
                      }
                    }}
                    placeholder="Responder mensaje…"
                    style={{ flex: 1, minWidth: 0, background: '#0a0a0a', color: '#ddd', border: '1px solid #242424', borderRadius: 8, padding: 7, fontSize: 9 }}
                  />
                  <button disabled={busy === 'send-message'} onClick={() => void sendInboxMessage()} style={{ ...tinyButton(false), padding: '6px 8px' }}>↗</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'metricas' && (
        <div style={{ ...panel, padding: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 900, marginBottom: 8 }}>RENDIMIENTO</div>
          <NaylaSelect
            value={analyticsAccount}
            placeholder="Seleccionar cuenta"
            onChange={(value) => void fetchAnalytics(value)}
            options={accounts.map((account: any) => ({
              value: account.id,
              label: account.display_name || account.handle || account.username || 'Cuenta',
              subtitle: 'Rendimiento y alcance',
              platform: account.platform,
            }))}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 6, marginTop: 9 }}>
            {unwrapMetrics(analytics).map((metric) => (
              <div key={metric.label} style={{ padding: 9, borderRadius: 10, background: 'rgba(255,255,255,.025)' }}>
                <div style={{ fontSize: 8, color: '#707070', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis' }}>{metric.label}</div>
                <div style={{ fontSize: 14, fontWeight: 900, marginTop: 3 }}>{String(metric.value)}</div>
              </div>
            ))}
          </div>
          {analyticsAccount && analytics && !unwrapMetrics(analytics).length && (
            <div style={{ marginTop: 9, padding: 11, borderRadius: 10, background: 'rgba(255,255,255,.025)', color: '#777', fontSize: 9, lineHeight: 1.45 }}>
              La cuenta está conectada, pero esta red todavía no devolvió métricas resumidas compatibles.
            </div>
          )}
        </div>
      )}

      {tab === 'ajustes' && (
        <>
          <div style={{ ...panel, padding: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 900 }}>CONEXIÓN SOCIAL</div>
            <div style={{ marginTop: 8, padding: 9, borderRadius: 9, background: 'rgba(255,255,255,.025)' }}>
              <div style={{ fontSize: 9, fontWeight: 900 }}>
                {providerA?.configured || providerB?.configured ? 'Lista para conectar cuentas' : 'Configuración pendiente'}
              </div>
              <div style={{ fontSize: 8.5, color: '#777', lineHeight: 1.45, marginTop: 4 }}>
                {providerA?.configured || providerB?.configured
                  ? 'Nayla elegirá automáticamente la conexión disponible para cada red.'
                  : 'Las credenciales del servidor no están disponibles en este despliegue.'}
              </div>
            </div>
          </div>

          <div style={{ ...panel, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 900 }}>NAYLA RESPONDE</div>
              <div style={{ fontSize: 8.5, color: '#777', marginTop: 3 }}>El usuario decide cuánto control darle.</div>
            </div>
            <NaylaSelect
              value={policy.mode}
              placeholder="Modo de respuesta"
              onChange={(value) => setPolicy((prev) => ({ ...prev, mode: value }))}
              options={[
                { value: 'off', label: 'Desactivado', subtitle: 'Nayla no interviene' },
                { value: 'suggest', label: 'Sugerir respuesta', subtitle: 'Tú apruebas antes de publicar' },
                { value: 'auto', label: 'Responder automáticamente', subtitle: 'Según las reglas configuradas' },
              ]}
            />
            <input value={policy.tone} onChange={(event) => setPolicy((prev) => ({ ...prev, tone: event.target.value }))} placeholder="Tono de respuesta" style={{ background: '#0b0b0b', color: '#ddd', border: '1px solid #272727', borderRadius: 9, padding: 8, fontSize: 9 }} />
            <textarea value={policy.instructions} onChange={(event) => setPolicy((prev) => ({ ...prev, instructions: event.target.value }))} placeholder="Ej.: amable, no discutir; precios → invitar a privado; quejas → pedirme aprobación." rows={5} style={{ resize: 'vertical', background: '#0b0b0b', color: '#ddd', border: '1px solid #272727', borderRadius: 9, padding: 8, fontSize: 9, lineHeight: 1.45 }} />
            <button onClick={() => void savePolicy()} style={{ ...tinyButton(true), width: '100%' }}>{busy === 'policy' ? 'GUARDANDO…' : 'GUARDAR REGLAS'}</button>
          </div>
        </>
      )}
    </div>
  );
}
