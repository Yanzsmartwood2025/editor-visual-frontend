import React, { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import type { Model3DAsset } from '../lib/model3d';

type Model3DWorkspaceProps = {
  assets: Model3DAsset[];
  activeAssetId: string | null;
  uploading?: boolean;
  onSelect: (asset: Model3DAsset) => void;
  onUpload: (files: FileList) => void;
  onDelete: (asset: Model3DAsset) => void;
  onNaylaAction: (mode: 'text_to_3d' | 'image_to_3d' | 'multiview_to_3d' | 'texture' | 'optimize' | 'rig' | 'animate' | 'retarget', prompt?: string) => void;
  embedded?: boolean;
  showCreatePrompt?: boolean;
};

const MODEL_VIEWER_SRC =
  'https://ajax.googleapis.com/ajax/libs/model-viewer/4.3.1/model-viewer.min.js';

export function Model3DWorkspace({
  assets,
  activeAssetId,
  uploading = false,
  onSelect,
  onUpload,
  onDelete,
  onNaylaAction,
  embedded = false,
  showCreatePrompt = true,
}: Model3DWorkspaceProps) {
  const activeAsset = assets.find((asset) => asset.id === activeAssetId) || assets[0] || null;
  const viewerRef = useRef<any>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [animations, setAnimations] = useState<string[]>([]);
  const [selectedAnimation, setSelectedAnimation] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined' && window.customElements?.get('model-viewer')) {
      setViewerReady(true);
    }
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const onProgress = (event: any) => {
      const progress = Number(event?.detail?.totalProgress);
      if (Number.isFinite(progress)) setLoadProgress(Math.round(progress * 100));
    };

    const onLoad = () => {
      setLoadProgress(100);
      const available = Array.isArray(viewer.availableAnimations)
        ? viewer.availableAnimations.filter((name: unknown): name is string => typeof name === 'string')
        : [];
      setAnimations(available);
      setSelectedAnimation((current) => current && available.includes(current) ? current : available[0] || '');
      if (available.length) {
        viewer.animationName = available[0];
        viewer.play?.();
      }
    };

    viewer.addEventListener?.('progress', onProgress);
    viewer.addEventListener?.('load', onLoad);
    return () => {
      viewer.removeEventListener?.('progress', onProgress);
      viewer.removeEventListener?.('load', onLoad);
    };
  }, [activeAsset?.url, viewerReady]);

  const resetCamera = () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.cameraOrbit = '0deg 75deg auto';
    viewer.cameraTarget = 'auto auto auto';
    viewer.fieldOfView = '45deg';
    viewer.jumpCameraToGoal?.();
  };

  const playAnimation = (name: string) => {
    setSelectedAnimation(name);
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.animationName = name;
    viewer.currentTime = 0;
    viewer.play?.();
  };

  const renderModelViewer = () => {
    if (!activeAsset) {
      return (
        <div style={{
          width: '100%',
          height: '100%',
          minHeight: 360,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 18,
          color: '#777',
          background:
            'radial-gradient(circle at 50% 45%, rgba(0,255,204,0.10), rgba(0,0,0,0) 36%), #000',
        }}>
          <svg width="104" height="104" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.8" style={{ opacity: 0.7 }}>
            <path d="M12 2 21 7 12 12 3 7 12 2Z" />
            <path d="M3 7v10l9 5 9-5V7" />
            <path d="M12 12v10" />
          </svg>
          <div style={{ textAlign: 'center', maxWidth: 420, padding: '0 20px' }}>
            <div style={{ color: '#e5e5e5', fontWeight: 800, letterSpacing: '0.08em', fontSize: '0.9rem' }}>
              ESTUDIO 3D
            </div>
            <div style={{ marginTop: 7, fontSize: '0.78rem', lineHeight: 1.5 }}>
              Sube un GLB o pide a Nayla crear un modelo. Aquí podrás girarlo, acercarlo, revisar animaciones y preparar rigging/optimización.
            </div>
          </div>
        </div>
      );
    }

    if (!viewerReady) {
      return (
        <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#00ffcc' }}>
          Cargando visor 3D…
        </div>
      );
    }

    return React.createElement('model-viewer', {
      ref: viewerRef,
      src: activeAsset.url,
      alt: activeAsset.nombre || 'Modelo 3D de Nayla',
      'camera-controls': true,
      'touch-action': 'pan-y',
      'auto-rotate': autoRotate ? true : undefined,
      autoplay: true,
      'shadow-intensity': '1',
      'environment-image': 'neutral',
      'tone-mapping': 'aces',
      exposure: '1',
      style: {
        width: '100%',
        height: '100%',
        minHeight: 360,
        background:
          'radial-gradient(circle at 50% 48%, rgba(255,255,255,0.08), rgba(0,0,0,0) 44%), #000',
      },
    });
  };

  return (
    <>
      <Script
        id="nayla-model-viewer"
        type="module"
        src={MODEL_VIEWER_SRC}
        strategy="afterInteractive"
        onLoad={() => setViewerReady(true)}
      />

      {embedded && (
        <style jsx global>{`
          .model3d-workspace.embedded {
            background:
              radial-gradient(circle at 50% 42%, rgba(var(--glow-color-rgb), .07), transparent 46%),
              rgba(2,3,5,.56) !important;
          }
          .model3d-workspace.embedded > div:last-child {
            background: rgba(5,5,7,.66) !important;
            border-top: 1px solid rgba(var(--glow-color-rgb), .14) !important;
            backdrop-filter: blur(var(--glass-blur));
            -webkit-backdrop-filter: blur(var(--glass-blur));
          }
          .model3d-workspace.embedded button,
          .model3d-workspace.embedded label {
            background: linear-gradient(145deg, rgba(255,255,255,.075), rgba(255,255,255,.025)) !important;
            border-color: rgba(var(--glow-color-rgb), calc(var(--glow-intensity) * .42)) !important;
            color: #f2f2f4 !important;
            box-shadow:
              inset 0 1px 0 rgba(255,255,255,.10),
              0 8px 24px rgba(0,0,0,.26),
              0 0 calc(var(--glow-spread) * .34) rgba(var(--glow-color-rgb), calc(var(--glow-intensity) * .10));
            backdrop-filter: blur(calc(var(--glass-blur) * .7));
            -webkit-backdrop-filter: blur(calc(var(--glass-blur) * .7));
          }
          .model3d-workspace.embedded button:hover,
          .model3d-workspace.embedded label:hover {
            background: linear-gradient(145deg, rgba(255,255,255,.12), rgba(255,255,255,.04)) !important;
          }
          .model3d-workspace.embedded input,
          .model3d-workspace.embedded select {
            background: rgba(0,0,0,.34) !important;
            border-color: rgba(var(--glow-color-rgb), .18) !important;
            color: #fff !important;
            box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
          }
          .model3d-workspace.embedded input:focus,
          .model3d-workspace.embedded select:focus {
            border-color: rgba(var(--glow-color-rgb), calc(var(--glow-intensity) * .76)) !important;
            outline: none;
          }
        `}</style>
      )}

      <div className={`model3d-workspace ${embedded ? 'embedded' : ''}`} style={{
        width: '100%',
        height: '100%',
        display: 'grid',
        gridTemplateRows: 'minmax(0, 1fr) auto',
        backgroundColor: '#000',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'relative', minHeight: 0 }}>
          {renderModelViewer()}

          <div style={{
            position: 'absolute',
            left: 12,
            top: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: '6px 9px',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 10,
            background: 'rgba(0,0,0,0.62)',
            backdropFilter: 'blur(8px)',
            color: '#ddd',
            fontSize: '0.68rem',
            zIndex: 8,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: activeAsset ? '#00cc66' : '#555' }} />
            {activeAsset ? `${activeAsset.etiqueta} · GLB` : 'SIN MODELO'}
          </div>

          {activeAsset && loadProgress < 100 && (
            <div style={{
              position: 'absolute',
              left: '20%',
              right: '20%',
              bottom: 18,
              height: 3,
              borderRadius: 99,
              overflow: 'hidden',
              backgroundColor: '#222',
              zIndex: 8,
            }}>
              <div style={{ width: `${loadProgress}%`, height: '100%', backgroundColor: '#00ffcc', transition: 'width 180ms ease' }} />
            </div>
          )}

          {activeAsset && (
            <div style={{
              position: 'absolute',
              right: 12,
              top: 12,
              display: 'flex',
              gap: 6,
              zIndex: 8,
            }}>
              <button
                type="button"
                onClick={() => setAutoRotate((value) => !value)}
                style={{
                  border: '1px solid #333',
                  borderRadius: 9,
                  backgroundColor: autoRotate ? '#143229' : 'rgba(0,0,0,0.68)',
                  color: autoRotate ? '#00ffcc' : '#aaa',
                  padding: '6px 9px',
                  fontSize: '0.68rem',
                  cursor: 'pointer',
                }}
              >
                {autoRotate ? 'ROTACIÓN ON' : 'ROTACIÓN OFF'}
              </button>
              <button
                type="button"
                onClick={resetCamera}
                style={{
                  border: '1px solid #333',
                  borderRadius: 9,
                  backgroundColor: 'rgba(0,0,0,0.68)',
                  color: '#ddd',
                  padding: '6px 9px',
                  fontSize: '0.68rem',
                  cursor: 'pointer',
                }}
              >
                CENTRAR
              </button>
            </div>
          )}

          {activeAsset && animations.length > 0 && (
            <div style={{
              position: 'absolute',
              left: 12,
              bottom: 12,
              zIndex: 8,
              border: '1px solid #2a2a2a',
              borderRadius: 10,
              padding: 7,
              backgroundColor: 'rgba(0,0,0,0.72)',
              backdropFilter: 'blur(8px)',
            }}>
              <select
                value={selectedAnimation}
                onChange={(event) => playAnimation(event.target.value)}
                style={{
                  maxWidth: 210,
                  backgroundColor: '#111',
                  border: '1px solid #333',
                  borderRadius: 7,
                  color: '#fff',
                  padding: '6px 8px',
                  fontSize: '0.7rem',
                }}
              >
                {animations.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
          )}
        </div>

        <div style={{
          minHeight: 118,
          maxHeight: '42vh',
          overflowY: 'auto',
          borderTop: '1px solid #1b1b1b',
          backgroundColor: '#050505',
          padding: 10,
          display: 'grid',
          gap: 10,
        }}>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
            <label style={{
              minWidth: 98,
              height: 72,
              border: '1px dashed #3a3a3a',
              borderRadius: 11,
              display: 'grid',
              placeItems: 'center',
              color: uploading ? '#666' : '#ddd',
              fontSize: '0.68rem',
              cursor: uploading ? 'wait' : 'pointer',
              flexShrink: 0,
            }}>
              <span>{uploading ? 'SUBIENDO…' : '+ SUBIR GLB'}</span>
              <input
                type="file"
                accept=".glb,model/gltf-binary"
                disabled={uploading}
                style={{ display: 'none' }}
                onChange={(event) => {
                  if (event.target.files?.length) onUpload(event.target.files);
                  event.currentTarget.value = '';
                }}
              />
            </label>

            {assets.map((asset) => {
              const selected = activeAsset?.id === asset.id;
              return (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => onSelect(asset)}
                  style={{
                    minWidth: 138,
                    maxWidth: 180,
                    height: 72,
                    borderRadius: 11,
                    border: selected ? '1px solid #00ffcc' : '1px solid #292929',
                    backgroundColor: selected ? '#0b211c' : '#0c0c0c',
                    color: '#fff',
                    textAlign: 'left',
                    padding: 9,
                    cursor: 'pointer',
                    flexShrink: 0,
                    position: 'relative',
                  }}
                >
                  <div style={{ fontSize: '0.62rem', color: selected ? '#00ffcc' : '#777', fontWeight: 800 }}>
                    {asset.etiqueta}
                  </div>
                  <div style={{ marginTop: 6, fontSize: '0.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {asset.nombre}
                  </div>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(asset);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        onDelete(asset);
                      }
                    }}
                    style={{
                      position: 'absolute',
                      right: 6,
                      top: 5,
                      color: '#777',
                      fontSize: '0.7rem',
                      padding: 3,
                    }}
                  >
                    ✕
                  </span>
                </button>
              );
            })}
          </div>

          {showCreatePrompt && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8 }}>
            <input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe el modelo 3D que quieres crear…"
              style={{
                minWidth: 0,
                backgroundColor: '#0d0d0d',
                border: '1px solid #2a2a2a',
                color: '#fff',
                borderRadius: 10,
                padding: '9px 10px',
                fontSize: '0.76rem',
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={() => onNaylaAction('text_to_3d', prompt.trim())}
              disabled={!prompt.trim()}
              style={{
                border: 'none',
                borderRadius: 10,
                backgroundColor: prompt.trim() ? '#00cc66' : '#222',
                color: prompt.trim() ? '#001a0d' : '#666',
                fontWeight: 800,
                padding: '8px 12px',
                cursor: prompt.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              CREAR
            </button>
          </div>
          )}

          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
            {[
              ['image_to_3d', 'IMAGEN → 3D'],
              ['multiview_to_3d', 'MULTIVISTA'],
              ['texture', 'TEXTURA'],
              ['optimize', 'OPTIMIZAR'],
              ['rig', 'RIGGING'],
              ['animate', 'ANIMAR'],
              ['retarget', 'RETARGET'],
            ].map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => onNaylaAction(mode as any)}
                style={{
                  whiteSpace: 'nowrap',
                  border: '1px solid #2d2d2d',
                  borderRadius: 9,
                  backgroundColor: '#0c0c0c',
                  color: '#ccc',
                  padding: '7px 9px',
                  fontSize: '0.66rem',
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
