import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Props {
  id: string;
  clip: any;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: (e: React.MouseEvent) => void;
}

export function SortableTimelineItem({ id, clip, isSelected, onSelect, onRemove }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 1,
    opacity: isDragging ? 0.8 : 1,
    width: (clip.durationInSeconds || 5) * 20 + 'px'
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
      <div style={{ width: '100%', height: '100%', overflow: 'hidden', display: 'flex' }}>
        {clip.tipo === 'video' ? (
          <div style={{
            width: '100%', height: '100%',
            backgroundColor: '#1a1a1a',
            display: 'flex',
          }}>
            <video src={clip.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted playsInline preload="metadata" />
          </div>
        ) : (
          <img src={clip.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
      </div>

      <span style={{ position: 'absolute', top: '4px', left: '6px', fontSize: '0.6rem', color: '#fff', fontWeight: 'bold', textShadow: '0 2px 4px #000', backgroundColor: 'rgba(0,0,0,0.5)', padding: '2px 4px', borderRadius: '4px' }}>{clip.etiqueta}</span>

      {isSelected && (
        <div onPointerDown={(e) => { e.stopPropagation(); onRemove(e as any); }}
          style={{ position: 'absolute', top: '-8px', right: '-8px', width: '18px', height: '18px', backgroundColor: '#ff4444', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', zIndex: 20, color: '#fff' }}>✕</div>
      )}
    </div>
  );
}
