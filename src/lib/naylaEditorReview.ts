import type { NaylaAction } from './naylaActions';
import { buildVisualTimelineMetrics, getItemDurationInFrames, getItemDelayInFrames } from './timelineMetrics';

export type EditorReviewRow = { section: string; resource: string; start: number; end: number; details: string; text?: string };
export type EditorReview = { id: string; status: 'pending' | 'accepted' | 'cancelled'; duration: number; format?: string; render: boolean; rows: EditorReviewRow[]; execution?: Extract<NaylaAction, { action: 'BUILD_TIMELINE' }> & { renderContext?: Record<string, unknown> } };
const names: Record<string, string> = {
  efecto: 'Movimiento / aspecto', transitionType: 'Transición', transitionDuration: 'Duración de transición',
  volume: 'Volumen', volumeKeyframes: 'Curva de volumen', fadeIn: 'Entrada', fadeOut: 'Salida',
  professionalEffects: 'Efectos', motionBlur: 'Desenfoque de movimiento', gsapMotion: 'Animación', proceduralMotion: 'Gráficos',
  fontSize: 'Tamaño', style: 'Estilo', position: 'Posición', color: 'Color', startFrom: 'Recorte inicial',
  trimBefore: 'Recorte inicial', trimAfter: 'Recorte final', playbackRate: 'Velocidad', loop: 'Repetir',
  scale: 'Escala', brightness: 'Brillo', contrast: 'Contraste', saturation: 'Saturación', overlay: 'Capa', overlayIntensity: 'Intensidad',
  fontFamily: 'Fuente', fontWeight: 'Grosor', highlightColor: 'Color activo', animation: 'Animación',
};
const excluded = new Set(['type', 'source', 'url', 'label', 'durationInSeconds', 'delay', 'text', 'start', 'end']);
const readable = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(readable).join('; ');
  if (value && typeof value === 'object') return Object.entries(value).map(([key, val]) => `${names[key] || key}: ${readable(val)}`).join(', ');
  return typeof value === 'boolean' ? (value ? 'sí' : 'no') : String(value);
};
export const describeEditorControls = (item: Record<string, unknown>) => Object.entries(item)
  .filter(([key, value]) => !excluded.has(key) && value !== undefined)
  .map(([key, value]) => `${names[key] || key}: ${readable(value)}`).join(' · ');

export const buildEditorReview = (action: Extract<NaylaAction, { action: 'BUILD_TIMELINE' }>, id = ''): EditorReview => {
  const fps = 30;
  const items = action.assets.map((asset, index) => {
    if (!asset.durationInSeconds) throw new Error('El plan necesita la duración de cada foto, video y audio antes de aceptarlo.');
    return { ...asset, id: String(index), tipo: (asset.type === 'image' ? 'foto' : asset.type) as 'foto' | 'video' | 'audio' };
  });
  const visual = buildVisualTimelineMetrics(items, fps);
  const rows: EditorReviewRow[] = items.map((item, index) => {
    const metric = visual.find(v => v.id === item.id);
    const start = metric?.absoluteStartFrame ?? getItemDelayInFrames(item, fps);
    const duration = metric?.durationInFrames ?? getItemDurationInFrames(item, fps);
    return { section: item.tipo === 'audio' ? 'Sonidos' : item.tipo === 'foto' ? 'Fotos' : 'Videos', resource: item.label || `${item.tipo} ${index + 1}`, start: start / fps, end: (start + duration) / fps, details: describeEditorControls(action.assets[index]) };
  });
  for (const [section, collection] of [
    ['Subtítulos', action.subtitles], ['Títulos', action.titles], ['3D', action.threeScenes],
    ['Animaciones vectoriales', action.vectorAnimations], ['Gráficos', action.skiaGraphics],
  ] as const) {
    collection?.forEach((entry, index) => rows.push({ section, resource: 'label' in entry ? String(entry.label) : `${index + 1}`, start: entry.start, end: entry.end, text: 'text' in entry ? String(entry.text) : undefined, details: describeEditorControls(entry) }));
  }
  return { id, status: 'pending', duration: Math.max(0, ...rows.map(r => r.end)), render: Boolean(action.render), rows };
};
