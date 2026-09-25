export const NAYLA_SUBTITLE_STYLES = [
  'clean',
  'cinematic',
  'tiktok',
  'karaoke',
  'neon',
  'glow',
  'outline',
  'shadow-3d',
  'extrude-3d',
  'glass',
  'boxed',
  'marker',
  'underline',
  'minimal-dark',
  'gradient',
  'retro',
  'glitch',
  'starlight',
  'word-rise',
  'pop',
  'typewriter',
] as const;

export type NaylaSubtitleStyle = typeof NAYLA_SUBTITLE_STYLES[number];

export const NAYLA_SUBTITLE_STYLE_GUIDE: Record<NaylaSubtitleStyle, string> = {
  clean: 'Texto limpio con sombra de legibilidad.',
  cinematic: 'Caja oscura translúcida con tratamiento cinematográfico.',
  tiktok: 'Palabras agrupadas y palabra activa resaltada.',
  karaoke: 'Seguimiento por palabra con inversión blanco/negro.',
  neon: 'Trazo brillante tipo neón.',
  glow: 'Texto luminoso con halo suave.',
  outline: 'Texto con contorno fuerte y centro limpio.',
  'shadow-3d': 'Profundidad simulada mediante sombras escalonadas.',
  'extrude-3d': 'Extrusión visual más marcada con capas de sombra.',
  glass: 'Texto sobre panel de vidrio translúcido.',
  boxed: 'Texto dentro de caja sólida redondeada.',
  marker: 'Resaltado tipo marcador detrás del texto.',
  underline: 'Subrayado visual de acento.',
  'minimal-dark': 'Tratamiento sobrio oscuro con alta legibilidad.',
  gradient: 'Texto con degradado de color.',
  retro: 'Tratamiento retro con sombra desplazada.',
  glitch: 'Desfase cromático y microdesplazamiento animado.',
  starlight: 'Brillo elegante con degradado y resplandor.',
  'word-rise': 'Entrada escalonada de palabras desde abajo.',
  pop: 'Entrada con escala elástica por palabra.',
  typewriter: 'Revelado progresivo de caracteres.',
};

export const isNaylaSubtitleStyle = (value: unknown): value is NaylaSubtitleStyle =>
  typeof value === 'string' && (NAYLA_SUBTITLE_STYLES as readonly string[]).includes(value);
