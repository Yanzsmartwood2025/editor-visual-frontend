/* eslint-disable */
import React, { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { createClient } from '@supabase/supabase-js';
import { cleanupExpiredPendingShares, deletePendingShare, getPendingShare, isPendingShareExpired, PendingShare } from '../lib/shareTargetQueue';
import { uploadMediaFilesToBodega } from '../lib/mediaUpload';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy_key';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

type ShareTargetStatus = 'loading' | 'needs-auth' | 'uploading' | 'success' | 'error' | 'expired' | 'empty';

export default function ShareTargetPage() {
  const router = useRouter();
  const shareId = useMemo(() => {
    const value = router.query.share_id;
    return Array.isArray(value) ? value[0] : value;
  }, [router.query.share_id]);
  const [pendingShare, setPendingShare] = useState<PendingShare | null>(null);
  const [status, setStatus] = useState<ShareTargetStatus>('loading');
  const [message, setMessage] = useState('Preparando archivos compartidos...');
  const [emailInput, setEmailInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  const processPendingShare = async (share: PendingShare) => {
    if (isPendingShareExpired(share)) {
      await deletePendingShare(share.id);
      setStatus('expired');
      setMessage('El archivo compartido expiró. Por seguridad solo guardamos pendientes durante 24 horas.');
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setStatus('needs-auth');
      setMessage('Recibimos tu archivo. Inicia sesión para guardarlo automáticamente en tu Bóveda.');
      return;
    }

    setStatus('uploading');
    setMessage(`Subiendo ${share.files.length} archivo(s) a tu Bóveda...`);

    await uploadMediaFilesToBodega({
      supabase,
      session,
      files: share.files.map(item => item.file),
      fuente: 'share-target'
    });

    await deletePendingShare(share.id);
    setStatus('success');
    setMessage('Archivo(s) guardado(s) en tu Bóveda. Redirigiendo al editor...');
    window.setTimeout(() => router.replace('/?shared=1'), 1200);
  };

  useEffect(() => {
    if (!router.isReady) return;

    const loadPendingShare = async () => {
      try {
        await cleanupExpiredPendingShares();

        if (!shareId) {
          setStatus('empty');
          setMessage('No encontramos archivos compartidos para procesar.');
          return;
        }

        const share = await getPendingShare(shareId);
        if (!share || share.files.length === 0) {
          setStatus('empty');
          setMessage('No encontramos archivos compartidos para procesar.');
          return;
        }

        setPendingShare(share);
        await processPendingShare(share);
      } catch (error: any) {
        console.error('[share-target] Error procesando archivos compartidos:', error);
        setStatus('error');
        setMessage(error?.message || 'No se pudieron procesar los archivos compartidos.');
      }
    };

    loadPendingShare();
  }, [router.isReady, shareId]);

  const handleEmailAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!emailInput) return;
    setAuthLoading(true);
    setMessage('Enviando código de acceso...');

    try {
      const { error } = await supabase.auth.signInWithOtp({ email: emailInput, options: { shouldCreateUser: true } });
      if (error) throw error;
      setOtpSent(true);
      setMessage('Código enviado. Revisa tu email e ingrésalo para continuar.');
    } catch (error: any) {
      setMessage(error?.message || 'No se pudo enviar el código de acceso.');
      setStatus('error');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleOtpVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!otpInput || !emailInput || !pendingShare) return;
    setAuthLoading(true);
    setMessage('Verificando sesión...');

    try {
      const { error } = await supabase.auth.verifyOtp({ email: emailInput, token: otpInput, type: 'email' });
      if (error) throw error;
      await processPendingShare(pendingShare);
    } catch (error: any) {
      setStatus('needs-auth');
      setMessage(error?.message || 'Código incorrecto. Intenta nuevamente.');
    } finally {
      setAuthLoading(false);
    }
  };

  const discardPendingShare = async () => {
    if (pendingShare) await deletePendingShare(pendingShare.id);
    router.replace('/');
  };

  return (
    <>
      <Head>
        <title>Compartir a NAYLA</title>
      </Head>
      <main style={{ minHeight: '100vh', background: '#050505', color: '#fff', display: 'grid', placeItems: 'center', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <section style={{ width: '100%', maxWidth: 460, border: '1px solid rgba(255,255,255,0.16)', borderRadius: 24, padding: 24, background: 'rgba(255,255,255,0.06)', boxShadow: '0 20px 70px rgba(0,0,0,0.45)' }}>
          <p style={{ color: '#ffd700', fontSize: 12, letterSpacing: 2, margin: '0 0 10px', fontWeight: 700 }}>NAYLA SHARE TARGET</p>
          <h1 style={{ fontSize: 28, margin: '0 0 12px' }}>Guardar en Bóveda</h1>
          <p style={{ color: '#d8d8d8', lineHeight: 1.5, marginBottom: 20 }}>{message}</p>

          {pendingShare?.files?.length ? (
            <div style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: 12, marginBottom: 18 }}>
              <strong>{pendingShare.files.length} archivo(s) pendiente(s)</strong>
              <ul style={{ paddingLeft: 18, color: '#cfcfcf' }}>
                {pendingShare.files.map((item, index) => (
                  <li key={`${item.name}-${index}`}>{item.name || `Archivo ${index + 1}`}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {status === 'needs-auth' ? (
            <form onSubmit={otpSent ? handleOtpVerify : handleEmailAuth} style={{ display: 'grid', gap: 12 }}>
              <input
                type="email"
                value={emailInput}
                onChange={(event) => setEmailInput(event.target.value)}
                placeholder="tu@email.com"
                disabled={authLoading || otpSent}
                style={{ padding: 14, borderRadius: 12, border: '1px solid rgba(255,255,255,0.18)', background: '#111', color: '#fff' }}
              />
              {otpSent ? (
                <input
                  value={otpInput}
                  onChange={(event) => setOtpInput(event.target.value.trim())}
                  placeholder="Código OTP"
                  disabled={authLoading}
                  style={{ padding: 14, borderRadius: 12, border: '1px solid rgba(255,255,255,0.18)', background: '#111', color: '#fff' }}
                />
              ) : null}
              <button type="submit" disabled={authLoading} style={{ padding: 14, border: 0, borderRadius: 12, background: '#ffd700', color: '#000', fontWeight: 800 }}>
                {authLoading ? 'Procesando...' : otpSent ? 'Verificar y subir' : 'Enviar código'}
              </button>
              <button type="button" onClick={discardPendingShare} disabled={authLoading} style={{ padding: 12, borderRadius: 12, border: '1px solid rgba(255,255,255,0.18)', background: 'transparent', color: '#fff' }}>
                Descartar archivo pendiente
              </button>
            </form>
          ) : null}

          {['success', 'empty', 'expired', 'error'].includes(status) ? (
            <button onClick={() => router.replace('/')} style={{ width: '100%', padding: 14, border: 0, borderRadius: 12, background: '#ffd700', color: '#000', fontWeight: 800 }}>
              Volver a NAYLA
            </button>
          ) : null}
        </section>
      </main>
    </>
  );
}
