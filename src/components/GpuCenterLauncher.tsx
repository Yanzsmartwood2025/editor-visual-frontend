import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import GpuCenter from './GpuCenter';
import { firebaseHeaders } from '../lib/apiClient';
import { getFirebaseSession, type FirebaseSession } from '../lib/firebaseClient';

const MOUNT_ID = 'nayla-gpu-center-toolbar-slot';

const findToolbar = () => {
  if (typeof document === 'undefined') return null;
  const settings = document.querySelector<HTMLButtonElement>('button.main-btn[title="AJUSTES"]');
  return settings?.parentElement || null;
};

export default function GpuCenterLauncher() {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [session, setSession] = useState<FirebaseSession | null>(null);
  const [open, setOpen] = useState(false);
  const [activeCount, setActiveCount] = useState(0);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const attach = () => {
      const toolbar = findToolbar();
      if (!toolbar) return false;
      let slot = document.getElementById(MOUNT_ID);
      if (!slot) {
        slot = document.createElement('div');
        slot.id = MOUNT_ID;
        slot.style.display = 'contents';
        const settings = toolbar.querySelector<HTMLButtonElement>('button.main-btn[title="AJUSTES"]');
        toolbar.insertBefore(slot, settings || null);
      }
      setMount(slot);
      return true;
    };

    if (attach()) return;
    const observer = new MutationObserver(() => {
      if (attach()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;
    const readSession = async () => {
      try {
        const current = await getFirebaseSession();
        if (alive) setSession(current);
      } catch {
        if (alive) setSession(null);
      }
    };
    void readSession();
    const timer = window.setInterval(() => void readSession(), 30_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const refreshCount = useCallback(async () => {
    if (!session) {
      setActiveCount(0);
      return;
    }
    try {
      const response = await fetch('/api/gpu/overview?limit=20', {
        headers: firebaseHeaders(session),
        cache: 'no-store',
      });
      if (!response.ok) return;
      const payload = await response.json().catch(() => ({}));
      setActiveCount(Math.max(0, Number(payload?.activeCount) || 0));
    } catch {
      // El Centro GPU sigue accesible aunque el contador no pueda actualizarse.
    }
  }, [session]);

  useEffect(() => {
    void refreshCount();
    const timer = window.setInterval(() => void refreshCount(), 8000);
    return () => window.clearInterval(timer);
  }, [refreshCount]);

  if (!mount) return null;

  return createPortal(
    <>
      <button
        type="button"
        className={'main-btn ' + (open ? 'active' : '')}
        title="CENTRO GPU"
        aria-label={activeCount ? `Centro GPU, ${activeCount} activas` : 'Centro GPU'}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
          void refreshCount();
        }}
        style={{ position: 'relative' }}
      >
        <div style={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="3" />
            <path d="M8 9h8v6H8z" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            <path d="M7 2v3M17 2v3M7 19v3M17 19v3" opacity=".65" />
          </svg>
          {activeCount > 0 && (
            <span style={{
              position: 'absolute',
              right: -9,
              top: -9,
              minWidth: 17,
              height: 17,
              padding: '0 4px',
              display: 'grid',
              placeItems: 'center',
              borderRadius: 999,
              border: '1px solid #aaffd5',
              background: '#0a2c1d',
              color: '#7dffbb',
              boxShadow: '0 0 10px rgba(73,225,158,.3)',
              fontSize: '9px',
              lineHeight: 1,
              fontWeight: 900,
            }}>{Math.min(99, activeCount)}</span>
          )}
        </div>
      </button>
      {open && session && (
        <GpuCenter
          session={session}
          onClose={() => {
            setOpen(false);
            void refreshCount();
          }}
        />
      )}
      {open && !session && (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: 'fixed', inset: 0, zIndex: 350000, background: 'rgba(0,0,0,.86)', display: 'grid', placeItems: 'center', padding: 18, color: '#fff' }}
          onClick={() => setOpen(false)}
        >
          <div style={{ width: 'min(420px,100%)', border: '1px solid #30343a', borderRadius: 18, background: '#090a0c', padding: 20 }} onClick={(event) => event.stopPropagation()}>
            <strong>CENTRO GPU</strong>
            <p style={{ color: '#8e949a', lineHeight: 1.5, fontSize: '.8rem' }}>La sesión de Nayla todavía no está lista. Cierra y vuelve a abrir el Centro GPU en unos segundos.</p>
            <button type="button" onClick={() => setOpen(false)} style={{ minHeight: 40, border: '1px solid #3a3f45', borderRadius: 11, background: '#111318', color: '#fff', padding: '0 14px', fontWeight: 800 }}>CERRAR</button>
          </div>
        </div>
      )}
    </>,
    mount
  );
}
