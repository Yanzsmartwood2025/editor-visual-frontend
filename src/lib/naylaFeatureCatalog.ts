import { REMOTION_CPU_EFFECTS } from './remotionEffects';
import { NAYLA_FILTER_PRESETS } from './naylaFilterPresets';
import { NAYLA_SUBTITLE_STYLE_GUIDE } from './naylaSubtitleStyles';

export const NAYLA_FEATURE_CATALOG_VERSION = '2026-09-24.1';

export type NaylaFeatureCatalogItem = {
  id: string;
  label: string;
  description: string;
  status: 'active';
};

export type NaylaFeatureCatalogCategory = {
  id: string;
  label: string;
  description: string;
  items: NaylaFeatureCatalogItem[];
};

const LABELS: Record<string, string> = {
  'film-burn': 'Film Burn',
  'blur-slide': 'Blur Slide',
  'cross-zoom': 'Cross Zoom',
  'dreamy-zoom': 'Dreamy Zoom',
  'linear-blur': 'Linear Blur',
  'push-cut': 'Push Cut',
  'ken-burns': 'Ken Burns',
  'push-in': 'Push In',
  'pull-out': 'Pull Out',
  'tilt-3d': 'Tilt 3D',
  'parallax-3d': 'Parallax 3D',
  'fragment-reveal': 'Fragment Reveal',
  'carousel-card': 'Carousel Card',
  'depth-stack': 'Depth Stack',
  'split-panels': 'Split Panels',
  'poster-pop': 'Poster Pop',
  'film-grain': 'Film Grain',
  'light-leak': 'Light Leak',
  'high-contrast': 'Alto contraste',
  'chromatic-aberration': 'Aberración cromática',
  'color-correction': 'Corrección de color',
  'zoom-blur': 'Zoom Blur',
  'slide-left': 'Slide Left',
  'slide-right': 'Slide Right',
  'slide-up': 'Slide Up',
  'slide-down': 'Slide Down',
  'zoom-in': 'Zoom In',
  'zoom-out': 'Zoom Out',
  'pulse-grid': 'Pulse Grid',
  'starfield': 'Starfield',
  'glow-orb': 'Glow Orb',
  'energy-pulse': 'Energy Pulse',
  'word-rise': 'Word Rise',
  'lower-third': 'Lower Third',
};

const title = (id: string) =>
  LABELS[id] || id
    .split('-')
    .map((part) => part ? part[0].toUpperCase() + part.slice(1) : part)
    .join(' ');

const items = (values: readonly string[], description: string): NaylaFeatureCatalogItem[] =>
  values
    .filter((id) => id !== 'none')
    .map((id) => ({ id, label: title(id), description, status: 'active' as const }));

const visualDescriptions: Record<string, string> = {
  'fragment-reveal': 'Divide la foto en paneles y revela la siguiente escena detrás.',
  'carousel-card': 'Presenta la imagen como tarjeta que se desplaza tipo carrusel.',
  'depth-stack': 'Apila capas desplazadas para crear profundidad.',
  'split-panels': 'Separa la imagen en paneles que descubren la siguiente escena.',
  'poster-pop': 'Presenta la foto como póster flotante sobre fondo ampliado.',
};

const professionalDescriptions: Record<string, string> = {
  'chromatic-aberration': 'Separa canales de color en bordes para un acabado óptico.',
  'color-correction': 'Ajuste profesional de exposición, contraste, vibrance y saturación.',
  'glow': 'Añade resplandor controlado a zonas luminosas.',
  'pixelate': 'Pixelado ajustable por intensidad.',
  'zoom-blur': 'Desenfoque radial hacia el centro de la imagen.',
  'vignette': 'Oscurece bordes para dirigir la mirada.',
  'light-leak': 'Fugas de luz animadas y reproducibles.',
};

export const NAYLA_EDITOR_FEATURE_CATALOG: NaylaFeatureCatalogCategory[] = [
  {
    id: 'filters',
    label: 'Filtros / Looks',
    description: 'Presets de color y atmósfera aplicables directamente a fotos y videos.',
    items: NAYLA_FILTER_PRESETS
      .filter((preset) => preset.id !== 'none')
      .map((preset) => ({
        id: preset.id,
        label: preset.label,
        description: preset.description,
        status: 'active' as const,
      })),
  },
  {
    id: 'subtitles',
    label: 'Subtítulos',
    description: 'Estilos de texto sincronizado disponibles en el renderer.',
    items: REMOTION_CPU_EFFECTS.captions.styles.map((id) => ({
      id,
      label: title(id),
      description: NAYLA_SUBTITLE_STYLE_GUIDE[id],
      status: 'active' as const,
    })),
  },
  {
    id: 'transitions',
    label: 'Transiciones',
    description: 'Cambios de escena disponibles en Remotion.',
    items: items(REMOTION_CPU_EFFECTS.transitions, 'Transición activa y validada para el timeline.'),
  },
  {
    id: 'motion',
    label: 'Movimiento de imagen',
    description: 'Movimiento, zoom y profundidad simulada para fotos y clips.',
    items: items(REMOTION_CPU_EFFECTS.motion, 'Movimiento activo y reproducible por frame.'),
  },
  {
    id: 'visual-templates',
    label: 'Plantillas visuales',
    description: 'Composiciones complejas listas para usar sin inventar código.',
    items: REMOTION_CPU_EFFECTS.visualTemplates.map((id) => ({
      id,
      label: title(id),
      description: visualDescriptions[id] || 'Plantilla visual activa.',
      status: 'active' as const,
    })),
  },
  {
    id: 'overlays',
    label: 'Overlays',
    description: 'Capas atmosféricas encima de la escena.',
    items: items(REMOTION_CPU_EFFECTS.overlays, 'Capa visual activa para acabado y atmósfera.'),
  },
  {
    id: 'professional-effects',
    label: 'Efectos profesionales',
    description: 'Efectos de procesamiento que pueden encadenarse por clip.',
    items: REMOTION_CPU_EFFECTS.professionalEffects.map((id) => ({
      id,
      label: title(id),
      description: professionalDescriptions[id] || 'Efecto profesional activo.',
      status: 'active' as const,
    })),
  },
  {
    id: 'clip-animation',
    label: 'Animación de clips',
    description: 'Entradas y salidas animadas para fotos y videos.',
    items: items(REMOTION_CPU_EFFECTS.clipMotion.presets, 'Animación GSAP sincronizada por frame.'),
  },
  {
    id: 'procedural',
    label: 'Movimiento procedural',
    description: 'Partículas y fondos animados deterministas.',
    items: items(REMOTION_CPU_EFFECTS.proceduralMotion.presets, 'Capa procedural activa y configurable.'),
  },
  {
    id: 'titles',
    label: 'Títulos animados',
    description: 'Estilos y animaciones independientes de los subtítulos.',
    items: [
      ...items(REMOTION_CPU_EFFECTS.motionTitles.styles, 'Estilo de título activo.'),
      ...items(REMOTION_CPU_EFFECTS.motionTitles.animations, 'Animación de título activa.'),
    ],
  },
  {
    id: 'graphics',
    label: 'Gráficos Skia',
    description: 'Gráficos luminosos y motion graphics sincronizados.',
    items: items(REMOTION_CPU_EFFECTS.skiaGraphics.presets, 'Preset gráfico Skia activo.'),
  },
];

export const getNaylaFeatureCatalogTotal = () =>
  NAYLA_EDITOR_FEATURE_CATALOG.reduce((total, category) => total + category.items.length, 0);
