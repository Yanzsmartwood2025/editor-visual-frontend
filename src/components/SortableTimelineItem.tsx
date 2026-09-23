import React, { useMemo, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Props {
  id: string;
  clip: any;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: (e: React.MouseEvent) => void;
}

const VideoFrameThumbnail: React.FC<{ src: string; time: number }> = ({ src, time }) => {
  const ref = useRef<HTMLVideoElement>(null);

  const seekToFrame = (video: HTMLVideoElement) => {
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : time;
    const target = Math.max(0, Math.min(time, Math.max(0, duration - 0.04)));
    if (Math.abs(video.currentTime - target) > 0.04) {
      try {
        video.currentTime = target;
      } catch {
        // Some browsers reject the first seek until metadata is ready.
      }
    }
    video.pause();
  };

  return (
    <video
      ref={ref}
      src={src}
      muted
      playsInline
      preload="metadata"
      draggable={false}
      onLoadedMetadata={(event) => seekToFrame(event.currentTarget)}
      onDurationChange={(event) => seekToFrame(event.currentTarget)}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        objectFit: 'cover',
        pointerEvents: 'none',
        backgroundColor: '#101010',
      }}
    />
  );
};

export function SortableTimelineItem({ id, clip, isSelected, onSelect, onRemove }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const duration = Number(clip.durationInSeconds || clip.metadata?.durationInSeconds || (clip.tipo === 'foto' ? 5 : 0));
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 5;
  const widthPx = Math.max(44, safeDuration * 20);
  const tileCount = Math.max(1, Math.min(16, Math.ceil(widthPx / 56)));

  const sampleTimes = useMemo(
    () => Array.from({ length: tileCount }, (_, index) => ((index + 0.5) / tileCount) * safeDuration),
    [tileCount, safeDuration]
  );

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 1,
    opacity: isDragging ? 0.8 : 1,
    width: widthPx + 'px'
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      className={`clip-block ${isSelected ? 'selected' : ''}`}
    >
      <div style={{ width: '100%', height: '100%', overflow: 'hidden', display: 'flex', background: '#111' }}>
        {sampleTimes.map((sampleTime, index) => (
          <div
            key={`${clip.id}-frame-${index}`}
            style={{
              flex: '1 1 0',
              minWidth: 0,
              height: '100%',
              overflow: 'hidden',
              borderRight: index === sampleTimes.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {clip.tipo === 'video' ? (
              <VideoFrameThumbnail src={clip.url} time={sampleTime} />
            ) : (
              <img
                src={clip.url}
                alt=""
                draggable={false}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }}
              />
            )}
          </div>
        ))}
      </div>

      <span style={{ position: 'absolute', top: '4px', left: '6px', fontSize: '0.6rem', color: '#fff', fontWeight: 'bold', textShadow: '0 2px 4px #000', backgroundColor: 'rgba(0,0,0,0.5)', padding: '2px 4px', borderRadius: '4px' }}>{clip.etiqueta}</span>

      {isSelected && (
        <div onPointerDown={(e) => { e.stopPropagation(); onRemove(e as any); }}
          style={{ position: 'absolute', top: '-8px', right: '-8px', width: '18px', height: '18px', backgroundColor: '#ff4444', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', zIndex: 20, color: '#fff' }}>✕</div>
      )}
    </div>
  );
}
