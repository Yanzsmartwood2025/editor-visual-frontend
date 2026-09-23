import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { FirebaseSession } from '../lib/firebaseClient';
import { firebaseHeaders } from '../lib/apiClient';
import { SOCIAL_NETWORKS } from '../lib/social/types';
import { cleanNaylaChatText } from '../lib/naylaText';
import { uploadMediaFilesToBodega } from '../lib/mediaUpload';

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
  onResultsUploaded?: (items: ResultMedia[]) => void;
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

const AccountAvatar = ({
  account,
  size = 30,
}: {
  account: any;
  size?: number;
}) => {
  const avatar =
    account?.avatar_url ||
    account?.avatarUrl ||
    account?.raw?.profilePicture ||
    account?.raw?.avatarUrl ||
    account?.raw?.metadata?.profileData?.profilePicture ||
    null;

  if (!avatar) return <NetworkIcon platform={account?.platform || ''} size={size} />;

  return (
    <img
      src={String(avatar)}
      alt={String(account?.display_name || account?.handle || account?.username || account?.platform || 'Cuenta')}
      style={{
        width: size,
        height: size,
        flex: '0 0 auto',
        borderRadius: '50%',
        objectFit: 'cover',
        border: '1px solid rgba(255,255,255,.18)',
        background: '#090909',
      }}
      onError={(event) => {
        event.currentTarget.style.display = 'none';
      }}
    />
  );
};

const getAccountAvatarUrl = (account: any): string | null =>
  account?.avatar_url ||
  account?.avatarUrl ||
  account?.raw?.profilePicture ||
  account?.raw?.avatarUrl ||
  account?.raw?.metadata?.profileData?.profilePicture ||
  null;

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
  avatarUrl?: string | null;
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
        {selected?.avatarUrl
          ? <AccountAvatar account={{ platform: selected.platform, avatar_url: selected.avatarUrl, display_name: selected.label }} size={25} />
          : selected?.platform
            ? <NetworkIcon platform={selected.platform} size={25} />
            : null}
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
                  {option.avatarUrl
                    ? <AccountAvatar account={{ platform: option.platform, avatar_url: option.avatarUrl, display_name: option.label }} size={28} />
                    : option.platform
                      ? <NetworkIcon platform={option.platform} size={28} />
                      : null}
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

export default function SocialHub({ session, projectId, results, onResultsUploaded, onClose }: Props) {
  const [tab, setTab] = useState<'inicio' | 'publicar' | 'inbox' | 'metricas' | 'ajustes'>('inicio');
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [publishFeedback, setPublishFeedback] = useState<{
    tone: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);
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
  const [socialChatMessages, setSocialChatMessages] = useState<any[]>([]);
  const [socialChatDraft, setSocialChatDraft] = useState('');
  const [socialIntelligenceLoaded, setSocialIntelligenceLoaded] = useState(false);
  const [knownPeopleCount, setKnownPeopleCount] = useState(0);
  const [automationRule, setAutomationRule] = useState({
    enabled: false,
    channel: 'comments',
    minDelayHours: 3,
    maxDelayHours: 4,
    dailyReplyLimit: 20,
    personCooldownHours: 3,
    simpleOnly: true,
    instructions: '',
  });
  const [naylaSettingsOpen, setNaylaSettingsOpen] = useState(false);
  const [naylaSettingsSnapshot, setNaylaSettingsSnapshot] = useState<any>(null);
  const [naylaPlusOpen, setNaylaPlusOpen] = useState(false);
  const [socialUploads, setSocialUploads] = useState<ResultMedia[]>([]);
  const [socialUploadPercent, setSocialUploadPercent] = useState(0);
  const socialUploadInputRef = useRef<HTMLInputElement | null>(null);
  const socialChatEndRef = useRef<HTMLDivElement | null>(null);

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
    void load(true);
  }, [projectId, session?.user?.id]);

  useEffect(() => {
    if (!projectId || !session) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(false);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [projectId, session?.user?.id]);

  useEffect(() => {
    if (tab !== 'ajustes') return;
    const frame = window.requestAnimationFrame(() => {
      socialChatEndRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [tab, socialChatMessages.length, busy]);

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
  const availableResults = useMemo(() => {
    const map = new Map<string, ResultMedia>();
    [...results, ...socialUploads].forEach((item) => map.set(item.id, item));
    return Array.from(map.values()).sort((a, b) => {
      const aNum = Number(String(a.etiqueta || '').match(/^R(\d+)$/i)?.[1] || 0);
      const bNum = Number(String(b.etiqueta || '').match(/^R(\d+)$/i)?.[1] || 0);
      return bNum - aNum;
    });
  }, [results, socialUploads]);
  const connectedPlatforms = useMemo(() => new Set(accounts.filter((a: any) => a.status === 'connected').map((a: any) => a.platform)), [accounts]);
  const recentTargets = data?.targets || [];
  const latestMetricsByAccount = useMemo(() => {
    const map = new Map<string, any>();
    for (const snapshot of data?.metrics || []) {
      if (!map.has(snapshot.account_id)) map.set(snapshot.account_id, snapshot.metrics || {});
    }
    return map;
  }, [data?.metrics]);
  const providerA = data?.providers?.find((p: any) => p.id === 'upload_post');
  const providerB = data?.providers?.find((p: any) => p.id === 'zernio');

  const providerUsage = (provider: 'upload_post' | 'zernio') =>
    accounts.filter((account: any) =>
      account.provider === provider &&
      account.status !== 'disconnected'
    ).length;

  const providerHasCapacity = (provider: any, providerId: 'upload_post' | 'zernio') => {
    if (!provider?.configured) return false;
    const limit = provider.accountLimit;
    return limit == null || providerUsage(providerId) < Number(limit);
  };

  const routeAHasPlatformSlot = (platform: string) =>
    !accounts.some((account: any) =>
      account.provider === 'upload_post' &&
      account.platform === platform &&
      account.status !== 'disconnected'
    );

  const connectNetwork = async (network: (typeof SOCIAL_NETWORKS)[number]) => {
    if (!projectId) return;

    const candidates: Array<'upload_post' | 'zernio'> = [];
    const routeAAvailable =
      Boolean(providerA?.configured) &&
      routeAHasPlatformSlot(network.id) &&
      Boolean(network.uploadPostConnect) &&
      (network.id !== 'tiktok' || providerA?.tiktokPublishingEnabled === true);
    const routeBAvailable =
      providerHasCapacity(providerB, 'zernio') &&
      Boolean(network.zernio) &&
      ['oauth', 'telegram_code'].includes(network.zernioConnectMode || 'oauth');

    if (routeAAvailable) candidates.push('upload_post');
    if (routeBAvailable) candidates.push('zernio');

    if (!candidates.length) {
      const manual =
        providerB?.configured &&
        network.zernio &&
        ['credentials', 'oauth_channel'].includes(network.zernioConnectMode || '');
      const routeAPlatformFull =
        providerA?.configured &&
        Boolean(network.uploadPostConnect) &&
        !routeAHasPlatformSlot(network.id);
      const routeATikTokBlocked =
        network.id === 'tiktok' &&
        providerA?.configured &&
        providerA?.tiktokPublishingEnabled !== true;
      const routeBFull =
        providerB?.configured &&
        providerB.accountLimit != null &&
        providerUsage('zernio') >= Number(providerB.accountLimit);

      setNotice(
        routeATikTokBlocked && routeBFull
          ? `TikTok no publica por la Ruta A gratuita y Ruta B ya está llena (${providerUsage('zernio')}/${providerB.accountLimit}).`
          : routeAPlatformFull && routeBFull
            ? `${network.label} ya ocupa el espacio de esa red en Ruta A y Ruta B está llena (${providerUsage('zernio')}/${providerB.accountLimit}).`
            : manual
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
  const uploadSocialResults = async (files: File[]) => {
    if (!session || !projectId || !files.length) return;

    const supported = files.filter((file) =>
      file.type.startsWith('image/') || file.type.startsWith('video/')
    );
    if (!supported.length) {
      setNotice('Selecciona una foto o un video para publicar.');
      return;
    }

    setBusy('social-upload');
    setSocialUploadPercent(0);
    setNotice('');
    try {
      const uploaded = await uploadMediaFilesToBodega({
        session,
        files: supported,
        existingItems: availableResults as any,
        projectId,
        fuente: 'social-upload',
        labelMode: 'result',
        onProgress: (progress) => setSocialUploadPercent(progress.percent),
      });

      const publishable = uploaded
        .filter((item) => item.tipo === 'foto' || item.tipo === 'video')
        .map((item) => ({
          id: item.id,
          nombre: item.nombre,
          etiqueta: item.etiqueta,
          url: item.url,
          tipo: item.tipo,
        }));

      setSocialUploads((previous) => {
        const map = new Map(previous.map((item) => [item.id, item]));
        publishable.forEach((item) => map.set(item.id, item));
        return Array.from(map.values());
      });
      onResultsUploaded?.(publishable);

      if (publishable[0]) {
        setSelectedResult(publishable[0].id);
        setTab('publicar');
      }

      const labels = publishable.map((item) => item.etiqueta).filter(Boolean).join(', ');
      setNotice(labels
        ? `${labels} ${publishable.length === 1 ? 'está listo' : 'están listos'} para publicar.`
        : 'Archivo listo para publicar.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo subir el archivo para publicar.');
    } finally {
      setBusy('');
      setSocialUploadPercent(0);
      if (socialUploadInputRef.current) socialUploadInputRef.current.value = '';
    }
  };

  const publish = async () => {
    if (!projectId || !selectedResult || !selectedAccounts.length) {
      setNotice('Selecciona un resultado y al menos una cuenta.');
      return;
    }
    setBusy('publish');
    setNotice('');
    setPublishFeedback(null);
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

      const published = Number(payload.published || 0);
      const processing = Number(payload.processing || 0);
      const failed = Number(payload.failed || 0);
      const summary = `${published} publicada${published === 1 ? '' : 's'} · ${processing} procesando · ${failed} fallida${failed === 1 ? '' : 's'}`;

      if (published > 0 && processing === 0 && failed === 0) {
        setPublishFeedback({
          tone: 'success',
          message: `✓ Publicación completada con éxito. ${summary}.`,
        });
      } else if (published > 0 || processing > 0) {
        setPublishFeedback({
          tone: 'warning',
          message: `Publicación enviada. ${summary}. Revisa Actividad reciente si algún destino sigue procesando.`,
        });
      } else {
        setPublishFeedback({
          tone: 'error',
          message: `No se pudo publicar. ${summary}.`,
        });
      }

      await load(true);
      setTab('inicio');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo publicar.';
      setPublishFeedback({ tone: 'error', message: `✕ ${message}` });
      setNotice(message);
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

    const selectedAccount = accounts.find((account: any) => account.id === accountId);
    const isTikTokPersonal =
      selectedAccount?.platform === 'tiktok' &&
      selectedAccount?.raw?.metadata?.profileData?.extraData?.isBusinessAccount === false;

    if (isTikTokPersonal) {
      setInboxNotice('Esta cuenta de TikTok está conectada, pero TikTok limita los mensajes privados por API a cuentas Business compatibles.');
    }

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
          accountId: commentSource.accountId,
          commentId,
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

  const loadSocialIntelligence = async () => {
    if (!projectId || socialIntelligenceLoaded) return;
    setBusy('nayla-load');
    try {
      const [chat, automation, people] = await Promise.all([
        api(`/api/social/chat?projectId=${encodeURIComponent(projectId)}`),
        api(`/api/social/automation/rules?projectId=${encodeURIComponent(projectId)}`),
        api(`/api/social/people?projectId=${encodeURIComponent(projectId)}`),
      ]);

      setSocialChatMessages(chat.messages || []);
      setKnownPeopleCount((people.people || []).length);

      if (automation.rule) {
        setAutomationRule({
          enabled: Boolean(automation.rule.enabled),
          channel: automation.rule.channel || 'comments',
          minDelayHours: Number(automation.rule.min_delay_minutes || 180) / 60,
          maxDelayHours: Number(automation.rule.max_delay_minutes || 240) / 60,
          dailyReplyLimit: Number(automation.rule.daily_reply_limit || 20),
          personCooldownHours: Number(automation.rule.person_cooldown_minutes || 180) / 60,
          simpleOnly: automation.rule.simple_only !== false,
          instructions: automation.rule.instructions || '',
        });
      }

      setSocialIntelligenceLoaded(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo cargar la inteligencia social.');
    } finally {
      setBusy('');
    }
  };

  const sendSocialChat = async () => {
    if (!projectId || !socialChatDraft.trim() || busy === 'nayla-chat') return;
    const text = socialChatDraft.trim();
    setSocialChatDraft('');
    setSocialChatMessages((prev) => [
      ...prev,
      { id: `local-user-${Date.now()}`, role: 'user', content: text, created_at: new Date().toISOString() },
    ]);
    setBusy('nayla-chat');

    try {
      const payload = await api('/api/social/chat', {
        method: 'POST',
        body: JSON.stringify({ projectId, message: text }),
      });
      if (payload.message) {
        setSocialChatMessages((prev) => [...prev, payload.message]);
      }
      if (typeof payload.activityReview?.peopleCount === 'number') {
        setKnownPeopleCount(payload.activityReview.peopleCount);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Nayla no pudo responder.');
    } finally {
      setBusy('');
    }
  };

  const openNaylaSettings = () => {
    setNaylaSettingsSnapshot({
      policy: { ...policy },
      automationRule: { ...automationRule },
    });
    setNaylaSettingsOpen(true);
  };

  const cancelNaylaSettings = () => {
    if (naylaSettingsSnapshot) {
      setPolicy({ ...naylaSettingsSnapshot.policy });
      setAutomationRule({ ...naylaSettingsSnapshot.automationRule });
    }
    setNaylaSettingsSnapshot(null);
    setNaylaSettingsOpen(false);
  };

  const saveNaylaSettings = async () => {
    if (!projectId || busy === 'nayla-settings') return;
    setBusy('nayla-settings');

    try {
      const automationPayload = await api('/api/social/automation/rules', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          enabled: automationRule.enabled,
          channel: automationRule.channel,
          minDelayMinutes: Math.round(Number(automationRule.minDelayHours || 0) * 60),
          maxDelayMinutes: Math.round(Number(automationRule.maxDelayHours || 0) * 60),
          dailyReplyLimit: Math.round(Number(automationRule.dailyReplyLimit || 20)),
          personCooldownMinutes: Math.round(Number(automationRule.personCooldownHours || 0) * 60),
          simpleOnly: automationRule.simpleOnly,
          instructions: automationRule.instructions,
        }),
      });

      const nextPolicy = automationRule.enabled && policy.mode !== 'auto'
        ? { ...policy, mode: 'auto' }
        : { ...policy };

      await api('/api/social/policy', {
        method: 'POST',
        body: JSON.stringify({ projectId, ...nextPolicy }),
      });

      if (automationPayload.rule) {
        setAutomationRule((prev) => ({
          ...prev,
          enabled: Boolean(automationPayload.rule.enabled),
          channel: automationPayload.rule.channel || prev.channel,
          minDelayHours: Number(automationPayload.rule.min_delay_minutes || 180) / 60,
          maxDelayHours: Number(automationPayload.rule.max_delay_minutes || 240) / 60,
          dailyReplyLimit: Number(automationPayload.rule.daily_reply_limit || 20),
          personCooldownHours: Number(automationPayload.rule.person_cooldown_minutes || 180) / 60,
          simpleOnly: automationPayload.rule.simple_only !== false,
          instructions: automationPayload.rule.instructions || '',
        }));
      }

      setPolicy(nextPolicy);
      setNaylaSettingsSnapshot(null);
      setNaylaSettingsOpen(false);
      setNotice('Configuración de Nayla guardada.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo guardar la configuración de Nayla.');
    } finally {
      setBusy('');
    }
  };

  const openSocialTab = (nextTab: 'inicio' | 'publicar' | 'inbox' | 'metricas' | 'ajustes') => {
    setTab(nextTab);
    setNotice('');

    if (nextTab === 'inbox' && !commentAccount) {
      const account = accounts.find((item: any) =>
        item.status === 'connected' &&
        (!Array.isArray(item.capabilities) || item.capabilities.includes('comments'))
      );
      if (account) void fetchCommentMedia(account.id);
    }

    if (nextTab === 'metricas' && !analyticsAccount) {
      const account = accounts.find((item: any) => item.status === 'connected');
      if (account) void fetchAnalytics(account.id);
    }

    if (nextTab === 'ajustes') {
      void loadSocialIntelligence();
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
        overflowY: tab === 'ajustes' ? 'hidden' : 'auto',
        overscrollBehavior: 'contain',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: tab === 'ajustes' ? '14px 14px max(12px, env(safe-area-inset-bottom))' : '14px 14px 34px',
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

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5,minmax(0,1fr))',
          gap: 6,
          padding: '3px 0 5px',
          minHeight: 56,
          boxSizing: 'border-box',
          overflow: 'visible',
          flex: '0 0 auto',
          alignItems: 'stretch',
        }}
      >
        {[
          ['inicio', 'Inicio'],
          ['publicar', 'Publicar'],
          ['inbox', 'Inbox'],
          ['metricas', 'Datos'],
          ['ajustes', 'Nayla'],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => openSocialTab(id as any)}
            style={{
              ...tinyButton(tab === id),
              minHeight: 48,
              height: 48,
              padding: '0 4px',
              borderRadius: 14,
              fontSize: 11,
              lineHeight: 1.2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxSizing: 'border-box',
              overflow: 'visible',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {publishFeedback && (
        <div
          role="status"
          aria-live="polite"
          style={{
            ...panel,
            padding: '12px 13px',
            fontSize: 11.5,
            color: '#fff',
            lineHeight: 1.5,
            border: '1px solid rgba(255,255,255,.24)',
            background: publishFeedback.tone === 'success'
              ? 'rgba(255,255,255,.10)'
              : publishFeedback.tone === 'warning'
                ? 'rgba(255,255,255,.065)'
                : 'rgba(255,255,255,.045)',
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <span style={{ flex: 1 }}>{publishFeedback.message}</span>
          <button
            type="button"
            aria-label="Cerrar aviso"
            onClick={() => setPublishFeedback(null)}
            style={{ background: 'transparent', border: 0, color: '#aaa', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      )}

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
                    <AccountAvatar account={account} size={28} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 10, fontWeight: 850, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {account.display_name || account.handle || account.username || account.platform}
                      </div>
                      <div style={{ fontSize: 8, color: account.status === 'connected' ? '#9d9' : '#d99', marginTop: 2 }}>
                        {statusText[account.status] || account.status}
                        {account.handle ? ` · @${String(account.handle).replace(/^@/, '')}` : ''}
                      </div>
                      {(() => {
                        const metrics = latestMetricsByAccount.get(account.id) || {};
                        const likes = metrics['Me gusta'] ?? metrics.likes ?? metrics.Likes;
                        const comments = metrics.Comentarios ?? metrics.comments;
                        if (likes == null && comments == null) return null;
                        return (
                          <div style={{ fontSize: 8, color: '#777', marginTop: 2 }}>
                            {likes != null ? `♥ ${likes}` : ''}
                            {likes != null && comments != null ? ' · ' : ''}
                            {comments != null ? `💬 ${comments}` : ''}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 10, color: '#777', lineHeight: 1.5 }}>Aún no hay cuentas. Elige una red abajo para conectarla.</div>
            )}
          </div>

          <div style={{ ...panel, padding: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 9 }}>
              <div style={{ fontSize: 10, fontWeight: 900 }}>CONECTAR RED</div>
              <div style={{ fontSize: 8.5, color: '#777', textAlign: 'right' }}>
                A {providerUsage('upload_post')} redes · 1 por red · B {providerUsage('zernio')}/{providerB?.accountLimit ?? '∞'}
              </div>
            </div>
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
          <input
            ref={socialUploadInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            hidden
            onChange={(event) => {
              const files = Array.from(event.target.files || []);
              if (files.length) void uploadSocialResults(files);
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 900 }}>PUBLICAR RESULTADO</div>
            <button
              type="button"
              disabled={busy === 'social-upload'}
              onClick={() => socialUploadInputRef.current?.click()}
              style={{ ...tinyButton(false), padding: '6px 8px', fontSize: 8 }}
            >
              {busy === 'social-upload' ? `SUBIENDO ${socialUploadPercent}%` : '+ TELÉFONO'}
            </button>
          </div>
          <NaylaSelect
            value={selectedResult}
            placeholder="Seleccionar R1 / R2"
            onChange={setSelectedResult}
            options={availableResults.map((item) => ({
              value: item.id,
              label: `${item.etiqueta || 'R'} · ${item.nombre || (item.tipo === 'foto' ? 'Foto' : 'Video')}`,
              subtitle: item.tipo === 'foto' ? 'Foto lista para publicar' : 'Video listo para publicar',
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
                  <AccountAvatar account={account} size={24} />
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
                    avatarUrl: getAccountAvatarUrl(account),
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
                avatarUrl: getAccountAvatarUrl(account),
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
              avatarUrl: getAccountAvatarUrl(account),
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
        <div style={{ flex: 1, minHeight: 0, display: 'flex', position: 'relative' }}>
          <div
            style={{
              ...panel,
              flex: 1,
              minHeight: 0,
              width: '100%',
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 18,
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 950, letterSpacing: '.2px' }}>NAYLA SOCIAL</div>
                <div style={{ fontSize: 10.5, color: '#777', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {knownPeopleCount} persona{knownPeopleCount === 1 ? '' : 's'} en memoria · comunidad conectada
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {busy === 'nayla-load' && <span style={{ color: '#777', fontSize: 12 }}>…</span>}
                <button
                  type="button"
                  onClick={() => openSocialTab('metricas')}
                  style={{ ...tinyButton(false), padding: '7px 10px', fontSize: 9.5 }}
                >
                  DATOS
                </button>
              </div>
            </div>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                overscrollBehavior: 'contain',
                marginTop: 10,
                padding: '12px 2px 8px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                borderTop: '1px solid rgba(255,255,255,.06)',
                borderBottom: '1px solid rgba(255,255,255,.06)',
                scrollbarWidth: 'thin',
              }}
            >
              {!socialChatMessages.length && busy !== 'nayla-load' && (
                <div style={{ margin: 'auto', maxWidth: 480, textAlign: 'center', color: '#777', fontSize: 13, lineHeight: 1.6, padding: 22 }}>
                  Háblame como lo harías con una persona. Puedo revisar la actividad de tus cuentas conectadas, organizar comentarios y mensajes, consultar métricas y preparar acciones para que tú las confirmes.
                </div>
              )}

              {socialChatMessages.map((message: any, index: number) => {
                const isUser = message.role === 'user';
                return (
                  <div
                    key={message.id || index}
                    style={{
                      alignSelf: isUser ? 'flex-end' : 'flex-start',
                      width: isUser ? 'auto' : '96%',
                      maxWidth: isUser ? '88%' : '96%',
                      padding: isUser ? '10px 12px' : '11px 12px',
                      borderRadius: isUser ? '17px 17px 4px 17px' : '17px 17px 17px 4px',
                      background: isUser ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.035)',
                      border: '1px solid rgba(255,255,255,.07)',
                      color: '#e5e5e5',
                      fontSize: 14,
                      lineHeight: 1.55,
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {isUser ? message.content : cleanNaylaChatText(String(message.content || ''))}
                  </div>
                );
              })}

              {busy === 'nayla-chat' && (
                <div style={{ alignSelf: 'flex-start', padding: '9px 11px', color: '#777', fontSize: 12 }}>
                  Nayla está revisando…
                </div>
              )}
              <div ref={socialChatEndRef} />
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 7, marginTop: 10, position: 'relative' }}>
              {naylaPlusOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Cerrar menú"
                    onClick={() => setNaylaPlusOpen(false)}
                    style={{ position: 'fixed', inset: 0, zIndex: 9990, border: 0, background: 'transparent', padding: 0 }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      bottom: 56,
                      zIndex: 9991,
                      width: 230,
                      borderRadius: 14,
                      border: '1px solid rgba(255,255,255,.15)',
                      background: '#0b0b0b',
                      boxShadow: '0 16px 42px rgba(0,0,0,.72)',
                      padding: 7,
                    }}
                  >
                    <button
                      type="button"
                      disabled={busy === 'social-upload'}
                      onClick={() => {
                        setNaylaPlusOpen(false);
                        socialUploadInputRef.current?.click();
                      }}
                      style={{ ...tinyButton(false), width: '100%', textAlign: 'left', padding: '10px 11px', fontSize: 10 }}
                    >
                      {busy === 'social-upload' ? `Subiendo… ${socialUploadPercent}%` : 'Subir foto o video para publicar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNaylaPlusOpen(false);
                        openNaylaSettings();
                      }}
                      style={{ ...tinyButton(false), width: '100%', textAlign: 'left', padding: '10px 11px', fontSize: 10, marginTop: 5 }}
                    >
                      Opciones de Nayla
                    </button>
                  </div>
                </>
              )}
              <input
                ref={socialUploadInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                hidden
                onChange={(event) => {
                  const files = Array.from(event.target.files || []);
                  if (files.length) void uploadSocialResults(files);
                }}
              />
              <button
                type="button"
                aria-label="Abrir acciones de Nayla"
                title="Acciones"
                onClick={() => setNaylaPlusOpen((open) => !open)}
                style={{
                  ...tinyButton(false),
                  width: 48,
                  height: 48,
                  padding: 0,
                  borderRadius: 15,
                  fontSize: 25,
                  fontWeight: 350,
                  flex: '0 0 auto',
                }}
              >
                +
              </button>
              <textarea
                value={socialChatDraft}
                onChange={(event) => setSocialChatDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void sendSocialChat();
                  }
                }}
                placeholder="Habla con Nayla…"
                rows={1}
                style={{
                  flex: 1,
                  resize: 'none',
                  minHeight: 48,
                  maxHeight: 128,
                  boxSizing: 'border-box',
                  background: '#090909',
                  color: '#eee',
                  border: '1px solid rgba(255,255,255,.18)',
                  borderRadius: 15,
                  padding: '12px 13px',
                  fontSize: 14,
                  lineHeight: 1.45,
                  outline: 'none',
                }}
              />
              <button
                type="button"
                disabled={!socialChatDraft.trim() || busy === 'nayla-chat'}
                onClick={() => void sendSocialChat()}
                style={{ ...tinyButton(true), width: 48, height: 48, padding: 0, borderRadius: 15, fontSize: 22, flex: '0 0 auto' }}
              >
                ↑
              </button>
            </div>
          </div>

          {naylaSettingsOpen && (
            <>
              <button
                type="button"
                aria-label="Cerrar opciones"
                onClick={cancelNaylaSettings}
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 9992,
                  border: 0,
                  background: 'rgba(0,0,0,.68)',
                  backdropFilter: 'blur(4px)',
                  WebkitBackdropFilter: 'blur(4px)',
                  padding: 0,
                }}
              />
              <div
                style={{
                  position: 'fixed',
                  left: 12,
                  right: 12,
                  bottom: 'max(12px, env(safe-area-inset-bottom))',
                  zIndex: 9994,
                  maxHeight: '80dvh',
                  overflowY: 'auto',
                  borderRadius: 20,
                  border: '1px solid rgba(255,255,255,.16)',
                  background: '#0a0a0a',
                  boxShadow: '0 -12px 48px rgba(0,0,0,.7)',
                  padding: 14,
                }}
              >
                <div
                  style={{
                    position: 'sticky',
                    top: -14,
                    zIndex: 2,
                    margin: '-14px -14px 12px',
                    padding: '13px 14px 11px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    background: 'rgba(10,10,10,.97)',
                    borderBottom: '1px solid rgba(255,255,255,.07)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 950 }}>OPCIONES DE NAYLA</div>
                    <div style={{ fontSize: 10, color: '#777', marginTop: 2 }}>Automatización y forma de responder</div>
                  </div>
                  <button
                    type="button"
                    aria-label="Cancelar cambios"
                    onClick={cancelNaylaSettings}
                    style={{ border: 0, background: 'transparent', color: '#ddd', fontSize: 27, lineHeight: 1, padding: 4, cursor: 'pointer' }}
                  >
                    ×
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ ...panel, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 900 }}>RESPUESTAS CON RELOJ</div>
                        <div style={{ fontSize: 10, color: '#777', marginTop: 3 }}>Nayla espera el tiempo configurado y evita temas delicados.</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAutomationRule((prev) => ({ ...prev, enabled: !prev.enabled }))}
                        style={{
                          width: 50,
                          height: 29,
                          borderRadius: 999,
                          border: '1px solid rgba(255,255,255,.18)',
                          background: automationRule.enabled ? 'rgba(255,255,255,.2)' : '#050505',
                          padding: 3,
                          cursor: 'pointer',
                          flex: '0 0 auto',
                        }}
                      >
                        <span
                          style={{
                            display: 'block',
                            width: 21,
                            height: 21,
                            borderRadius: '50%',
                            background: automationRule.enabled ? '#fff' : '#555',
                            transform: automationRule.enabled ? 'translateX(20px)' : 'translateX(0)',
                            transition: 'transform .18s ease',
                          }}
                        />
                      </button>
                    </div>

                    <NaylaSelect
                      value={automationRule.channel}
                      placeholder="Dónde puede responder"
                      onChange={(value) => setAutomationRule((prev) => ({ ...prev, channel: value }))}
                      options={[
                        { value: 'comments', label: 'Comentarios', subtitle: 'Respuestas públicas' },
                        { value: 'dms', label: 'Mensajes privados', subtitle: 'Solo donde la red lo permita' },
                        { value: 'both', label: 'Comentarios + mensajes', subtitle: 'Según capacidades de cada cuenta' },
                      ]}
                    />

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }}>
                      <label style={{ padding: 9, borderRadius: 11, background: 'rgba(255,255,255,.025)', color: '#777', fontSize: 10 }}>
                        ESPERAR MÍNIMO
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
                          <input
                            type="number"
                            min="0"
                            max="720"
                            step="0.5"
                            value={automationRule.minDelayHours}
                            onChange={(event) => setAutomationRule((prev) => ({ ...prev, minDelayHours: Number(event.target.value) }))}
                            style={{ width: '100%', background: '#050505', color: '#fff', border: '1px solid #272727', borderRadius: 9, padding: 8, fontSize: 12 }}
                          />
                          <span>h</span>
                        </div>
                      </label>
                      <label style={{ padding: 9, borderRadius: 11, background: 'rgba(255,255,255,.025)', color: '#777', fontSize: 10 }}>
                        ESPERAR MÁXIMO
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
                          <input
                            type="number"
                            min="0"
                            max="720"
                            step="0.5"
                            value={automationRule.maxDelayHours}
                            onChange={(event) => setAutomationRule((prev) => ({ ...prev, maxDelayHours: Number(event.target.value) }))}
                            style={{ width: '100%', background: '#050505', color: '#fff', border: '1px solid #272727', borderRadius: 9, padding: 8, fontSize: 12 }}
                          />
                          <span>h</span>
                        </div>
                      </label>
                      <label style={{ padding: 9, borderRadius: 11, background: 'rgba(255,255,255,.025)', color: '#777', fontSize: 10 }}>
                        MÁXIMO / DÍA
                        <input
                          type="number"
                          min="1"
                          max="500"
                          value={automationRule.dailyReplyLimit}
                          onChange={(event) => setAutomationRule((prev) => ({ ...prev, dailyReplyLimit: Number(event.target.value) }))}
                          style={{ width: '100%', boxSizing: 'border-box', marginTop: 6, background: '#050505', color: '#fff', border: '1px solid #272727', borderRadius: 9, padding: 8, fontSize: 12 }}
                        />
                      </label>
                      <label style={{ padding: 9, borderRadius: 11, background: 'rgba(255,255,255,.025)', color: '#777', fontSize: 10 }}>
                        PAUSA / PERSONA
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
                          <input
                            type="number"
                            min="0"
                            max="720"
                            step="0.5"
                            value={automationRule.personCooldownHours}
                            onChange={(event) => setAutomationRule((prev) => ({ ...prev, personCooldownHours: Number(event.target.value) }))}
                            style={{ width: '100%', background: '#050505', color: '#fff', border: '1px solid #272727', borderRadius: 9, padding: 8, fontSize: 12 }}
                          />
                          <span>h</span>
                        </div>
                      </label>
                    </div>

                    <button
                      type="button"
                      onClick={() => setAutomationRule((prev) => ({ ...prev, simpleOnly: !prev.simpleOnly }))}
                      style={{ ...tinyButton(automationRule.simpleOnly), width: '100%', textAlign: 'left', lineHeight: 1.45, fontSize: 10.5 }}
                    >
                      {automationRule.simpleOnly ? '✓ ' : ''}Solo responder automáticamente mensajes simples
                    </button>

                    <textarea
                      value={automationRule.instructions}
                      onChange={(event) => setAutomationRule((prev) => ({ ...prev, instructions: event.target.value }))}
                      placeholder="Reglas extra para las respuestas automáticas…"
                      rows={3}
                      style={{ resize: 'vertical', background: '#050505', color: '#ddd', border: '1px solid #272727', borderRadius: 10, padding: 10, fontSize: 11.5, lineHeight: 1.45 }}
                    />
                    <div style={{ color: '#6f6f6f', fontSize: 9.5, lineHeight: 1.45 }}>
                      Quejas, precios, reembolsos y temas delicados quedan para aprobación.
                    </div>
                  </div>

                  <div style={{ ...panel, padding: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 900 }}>PERSONALIDAD DE NAYLA</div>
                      <div style={{ fontSize: 10, color: '#777', marginTop: 3 }}>Estas reglas se aplican a sugerencias y respuestas automáticas.</div>
                    </div>
                    <input
                      value={policy.tone}
                      onChange={(event) => setPolicy((prev) => ({ ...prev, tone: event.target.value }))}
                      placeholder="Tono de respuesta"
                      style={{ background: '#050505', color: '#eee', border: '1px solid #272727', borderRadius: 10, padding: 10, fontSize: 11.5 }}
                    />
                    <textarea
                      value={policy.instructions}
                      onChange={(event) => setPolicy((prev) => ({ ...prev, instructions: event.target.value }))}
                      placeholder="Ej.: cercana, no discutir; si preguntan algo delicado, pedirme aprobación."
                      rows={4}
                      style={{ resize: 'vertical', background: '#050505', color: '#ddd', border: '1px solid #272727', borderRadius: 10, padding: 10, fontSize: 11.5, lineHeight: 1.45 }}
                    />
                  </div>

                  <button
                    type="button"
                    disabled={busy === 'nayla-settings'}
                    onClick={() => void saveNaylaSettings()}
                    style={{ ...tinyButton(true), width: '100%', minHeight: 48, padding: 11, borderRadius: 14, fontSize: 12 }}
                  >
                    {busy === 'nayla-settings' ? 'GUARDANDO…' : 'ACEPTAR'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
