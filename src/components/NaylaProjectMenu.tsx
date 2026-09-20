import React, { useMemo, useRef, useState } from 'react';

export type NaylaProject = {
  id: string;
  name: string;
  status?: string;
};

export type NaylaChannelKind = 'foto' | 'video' | 'audio' | 'modelo3d';

export type NaylaChannelAsset = {
  id: string;
  tipo: NaylaChannelKind;
  nombre: string;
  url?: string;
  etiqueta?: string;
};

type Props = {
  open: boolean;
  projects: NaylaProject[];
  activeProjectId: string | null;
  assets: NaylaChannelAsset[];
  attachedIds: string[];
  uploadingKind?: NaylaChannelKind | null;
  onSelectProject: (projectId: string) => void;
  onNewChat: () => void;
  onNewProject: () => void;
  onUpload: (kind: NaylaChannelKind, files: FileList) => void;
  onToggleAttachment: (asset: NaylaChannelAsset) => void;
  onViewProject: () => void;
  onDeleteProject: () => void;
};

const iconStyle = { width: 24, height: 24, flexShrink: 0 } as const;

const ChatIcon = () => (
  <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>
  </svg>
);
const FolderIcon = () => (
  <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M3 6h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
  </svg>
);
const PhotoIcon = () => (
  <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="3" y="4" width="18" height="16" rx="2"/>
    <circle cx="8.5" cy="9" r="1.5"/>
    <path d="m5 18 5-5 3 3 2-2 4 4"/>
  </svg>
);
const VideoIcon = () => (
  <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="9"/>
    <path d="m10 8 6 4-6 4z"/>
  </svg>
);
const AudioIcon = () => (
  <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M9 18V5l10-2v13"/>
    <circle cx="6" cy="18" r="3"/>
    <circle cx="16" cy="16" r="3"/>
  </svg>
);
const CubeIcon = () => (
  <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="m12 2 9 5-9 5-9-5z"/>
    <path d="m3 7 9 5 9-5v10l-9 5-9-5z"/>
    <path d="M12 12v10"/>
  </svg>
);
const ListIcon = () => (
  <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="4" y="3" width="16" height="18" rx="2"/>
    <path d="M8 8h8M8 12h8M8 16h6"/>
  </svg>
);
const TrashIcon = () => (
  <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14"/>
  </svg>
);
const Chevron = ({ up = false }: { up?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d={up ? 'm18 15-6-6-6 6' : 'm9 18 6-6-6-6'}/>
  </svg>
);

const channelMeta: Array<{
  kind: NaylaChannelKind;
  title: string;
  accept: string;
  multiple: boolean;
  icon: React.ReactNode;
}> = [
  { kind: 'foto', title: 'Canal de fotos', accept: 'image/*', multiple: true, icon: <PhotoIcon /> },
  { kind: 'video', title: 'Canal de videos', accept: 'video/*', multiple: true, icon: <VideoIcon /> },
  { kind: 'audio', title: 'Canal de audio / música', accept: 'audio/*', multiple: true, icon: <AudioIcon /> },
  { kind: 'modelo3d', title: 'Canal 3D', accept: '.glb,model/gltf-binary', multiple: true, icon: <CubeIcon /> },
];

export function NaylaProjectMenu({
  open,
  projects,
  activeProjectId,
  assets,
  attachedIds,
  uploadingKind,
  onSelectProject,
  onNewChat,
  onNewProject,
  onUpload,
  onToggleAttachment,
  onViewProject,
  onDeleteProject,
}: Props) {
  const [showProjects, setShowProjects] = useState(false);
  const [expandedChannel, setExpandedChannel] = useState<NaylaChannelKind | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const modelRef = useRef<HTMLInputElement>(null);

  const refs: Record<NaylaChannelKind, React.RefObject<HTMLInputElement | null>> = {
    foto: photoRef,
    video: videoRef,
    audio: audioRef,
    modelo3d: modelRef,
  };

  const activeProject = projects.find((project) => project.id === activeProjectId) || null;
  const activeProjects = projects.filter((project) => project.status !== 'archived');

  const byChannel = useMemo(() => {
    const result: Record<NaylaChannelKind, NaylaChannelAsset[]> = {
      foto: [],
      video: [],
      audio: [],
      modelo3d: [],
    };
    assets.forEach((asset) => result[asset.tipo]?.push(asset));
    return result;
  }, [assets]);

  if (!open) return null;

  const rowStyle: React.CSSProperties = {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '11px 12px',
    border: '1px solid #2f2f2f',
    borderRadius: 12,
    background: '#0b0b0b',
    color: '#f4f4f4',
    cursor: 'pointer',
    textAlign: 'left',
    boxSizing: 'border-box',
  };

  return (
    <div
      data-no-edge-swipe
      style={{
        position: 'absolute',
        zIndex: 40,
        bottom: 78,
        left: 12,
        width: 'min(520px, calc(100vw - 24px))',
        maxHeight: 'min(64dvh, calc(100dvh - 154px))',
        overflowY: 'auto',
        borderRadius: 18,
        border: '1px solid #3a3a3a',
        background: 'rgba(7,7,7,0.98)',
        boxShadow: '0 18px 60px rgba(0,0,0,0.72)',
        padding: 14,
        color: '#fff',
        boxSizing: 'border-box',
      }}
    >
      <button
        type="button"
        onClick={() => setShowProjects((value) => !value)}
        style={{ ...rowStyle, border: 'none', borderBottom: '1px solid #303030', borderRadius: 0, padding: '10px 6px 14px' }}
      >
        <FolderIcon />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: '#8d8d8d', fontSize: 13 }}>
            Proyecto:{' '}
            <strong style={{ color: '#fff', fontSize: 15, fontWeight: 650 }}>
              {activeProject?.name || 'Sin proyecto'}
            </strong>
          </div>
        </div>
        <Chevron up={showProjects} />
      </button>

      {showProjects && (
        <div style={{ display: 'grid', gap: 6, padding: '8px 0 2px' }}>
          {activeProjects.map((project) => (
            <button
              type="button"
              key={project.id}
              onClick={() => {
                onSelectProject(project.id);
                setShowProjects(false);
              }}
              style={{
                ...rowStyle,
                borderColor: project.id === activeProjectId ? '#777' : '#252525',
                background: project.id === activeProjectId ? '#1a1a1a' : '#0a0a0a',
                padding: '9px 11px',
              }}
            >
              <FolderIcon />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</span>
              {project.id === activeProjectId && <span style={{ color: '#cfcfcf', fontSize: 12 }}>ACTUAL</span>}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gap: 8, paddingTop: 10 }}>
        <button type="button" onClick={onNewChat} style={{ ...rowStyle, background: '#1b1b1b', borderColor: '#4a4a4a' }}>
          <ChatIcon /><span style={{ flex: 1 }}>Nuevo chat</span>
        </button>
        <button type="button" onClick={onNewProject} style={{ ...rowStyle, border: 'none', background: 'transparent' }}>
          <FolderIcon /><span style={{ flex: 1 }}>Nuevo proyecto</span>
        </button>
      </div>

      <div style={{ borderTop: '1px solid #303030', marginTop: 8, paddingTop: 12 }}>
        <div style={{ color: '#f2f2f2', fontSize: 12, letterSpacing: '0.18em', fontWeight: 700 }}>CANALES DEL PROYECTO</div>
        <div style={{ color: '#838383', fontSize: 12, marginTop: 5, marginBottom: 10 }}>
          Sube, revisa y adjunta contenido al chat.
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          {channelMeta.map((channel) => {
            const list = byChannel[channel.kind];
            const expanded = expandedChannel === channel.kind;
            const isUploading = uploadingKind === channel.kind;
            return (
              <div key={channel.kind}>
                <button
                  type="button"
                  onClick={() => setExpandedChannel(expanded ? null : channel.kind)}
                  style={rowStyle}
                >
                  {channel.icon}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{channel.title}</div>
                    <div style={{ fontSize: 12, color: '#858585', marginTop: 2 }}>
                      {isUploading ? 'Subiendo…' : `${list.length} archivo${list.length === 1 ? '' : 's'} · Subir y organizar`}
                    </div>
                  </div>
                  <Chevron up={expanded} />
                </button>

                <input
                  ref={refs[channel.kind]}
                  type="file"
                  accept={channel.accept}
                  multiple={channel.multiple}
                  style={{ display: 'none' }}
                  onChange={(event) => {
                    if (event.target.files?.length) onUpload(channel.kind, event.target.files);
                    event.currentTarget.value = '';
                  }}
                />

                {expanded && (
                  <div style={{
                    marginTop: 5,
                    border: '1px solid #242424',
                    borderRadius: 12,
                    background: '#070707',
                    padding: 8,
                  }}>
                    <button
                      type="button"
                      disabled={isUploading}
                      onClick={() => refs[channel.kind].current?.click()}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: 9,
                        border: '1px solid #4a4a4a',
                        background: '#f3f3f3',
                        color: '#050505',
                        fontWeight: 750,
                        cursor: isUploading ? 'wait' : 'pointer',
                        opacity: isUploading ? 0.55 : 1,
                      }}
                    >
                      {isUploading ? 'SUBIENDO…' : 'SUBIR ARCHIVOS'}
                    </button>

                    {list.length ? (
                      <div style={{ display: 'grid', gap: 6, marginTop: 8, maxHeight: 188, overflowY: 'auto' }}>
                        {list.map((asset) => {
                          const selected = attachedIds.includes(asset.id);
                          return (
                            <button
                              type="button"
                              key={asset.id}
                              onClick={() => onToggleAttachment(asset)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                width: '100%',
                                padding: 8,
                                borderRadius: 9,
                                border: selected ? '1px solid #bdbdbd' : '1px solid #242424',
                                background: selected ? '#202020' : '#0c0c0c',
                                color: '#fff',
                                cursor: 'pointer',
                                textAlign: 'left',
                              }}
                            >
                              {asset.tipo === 'foto' && asset.url ? (
                                <img src={asset.url} alt="" style={{ width: 38, height: 38, objectFit: 'cover', borderRadius: 7, background: '#111' }} />
                              ) : (
                                <div style={{ width: 38, height: 38, borderRadius: 7, border: '1px solid #333', display: 'grid', placeItems: 'center' }}>
                                  {asset.tipo === 'video' ? <VideoIcon /> : asset.tipo === 'audio' ? <AudioIcon /> : <CubeIcon />}
                                </div>
                              )}
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                  <span style={{
                                    flex: '0 0 auto',
                                    border: '1px solid #555',
                                    borderRadius: 6,
                                    padding: '1px 5px',
                                    fontSize: 11,
                                    fontWeight: 800,
                                    color: '#fff',
                                  }}>
                                    {asset.etiqueta || '—'}
                                  </span>
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>
                                    {asset.nombre}
                                  </span>
                                </div>
                                <div style={{ color: '#777', fontSize: 11, marginTop: 3 }}>{selected ? 'Adjunto al próximo mensaje' : 'Toca para adjuntar al chat'}</div>
                              </div>
                              {selected && <span style={{ fontSize: 17 }}>✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ color: '#666', fontSize: 12, textAlign: 'center', padding: '12px 6px 4px' }}>
                        Este canal todavía está vacío.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ borderTop: '1px solid #303030', marginTop: 12, paddingTop: 12 }}>
        <div style={{ color: '#f2f2f2', fontSize: 12, letterSpacing: '0.18em', fontWeight: 700 }}>GESTIÓN DEL PROYECTO</div>
        <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
          <button type="button" onClick={onViewProject} style={{ ...rowStyle, border: 'none', background: 'transparent' }}>
            <ListIcon /><span style={{ flex: 1 }}>Ver proyecto actual</span><Chevron />
          </button>
          <button
            type="button"
            disabled={!activeProject}
            onClick={onDeleteProject}
            style={{ ...rowStyle, border: 'none', background: 'transparent', opacity: activeProject ? 1 : 0.45 }}
          >
            <TrashIcon />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Eliminar proyecto: {activeProject?.name || '—'}
            </span>
            <Chevron />
          </button>
        </div>
      </div>
    </div>
  );
}
