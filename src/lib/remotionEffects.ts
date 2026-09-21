export const REMOTION_CPU_EFFECTS = {
  transitions: [
    'fade',
    'wipe',
    'slide',
    'zoom',
    'blur-slide',
    'cross-zoom',
    'dreamy-zoom',
    'film-burn',
    'linear-blur',
    'push-cut',
  ] as const,
  looks: [
    'none',
    'grayscale',
    'sepia',
    'vintage',
    'cinematic',
    'blur',
    'glow',
    'high-contrast',
    'soft',
  ] as const,
  professionalEffects: [
    'chromatic-aberration',
    'pro-glow',
    'zoom-blur',
    'pixelate',
    'duotone',
    'cinematic-grade',
    'pro-vignette',
  ] as const,
  motion: [
    'none',
    'ken-burns',
    'pan',
    'rotate',
    'push-in',
    'pull-out',
    'float',
    'tilt-3d',
    'parallax-3d',
  ] as const,
  overlays: [
    'none',
    'vignette',
    'film-grain',
    'light-leak',
    'letterbox',
  ] as const,
  subtitleStyles: [
    'clean',
    'cinematic',
    'tiktok',
    'karaoke',
  ] as const,
};

export type NaylaProfessionalEffect = {
  type: (typeof REMOTION_CPU_EFFECTS.professionalEffects)[number];
  intensity?: number;
};

export const REMOTION_CPU_PUBLIC_CATALOG = {
  engine: 'Nayla Render CPU',
  purpose: 'Edición y composición profesional dentro del motor de render de Nayla.',
  transitions: REMOTION_CPU_EFFECTS.transitions,
  looks: REMOTION_CPU_EFFECTS.looks,
  professionalEffects: REMOTION_CPU_EFFECTS.professionalEffects,
  motion: REMOTION_CPU_EFFECTS.motion,
  overlays: REMOTION_CPU_EFFECTS.overlays,
  subtitleStyles: REMOTION_CPU_EFFECTS.subtitleStyles,
  controls: [
    'duración por clip',
    'volumen',
    'fade de audio/video',
    'velocidad',
    'recorte',
    'retraso',
    'escala',
    'brillo',
    'contraste',
    'saturación',
    'hasta 4 efectos profesionales por video',
    'subtítulos con estilo y posición',
  ],
  notes: [
    'Los efectos profesionales WebGL se aplican actualmente a video.',
    'Fotos mantienen los efectos de movimiento, color y overlays del motor base.',
    'Las transiciones avanzadas funcionan entre fotos y videos.',
  ],
};
