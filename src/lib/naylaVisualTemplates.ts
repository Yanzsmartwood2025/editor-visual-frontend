export const NAYLA_VISUAL_TEMPLATE_NAMES = [
  'fragment-reveal',
  'carousel-card',
  'depth-stack',
  'split-panels',
  'poster-pop',
] as const;

export type NaylaVisualTemplateName = typeof NAYLA_VISUAL_TEMPLATE_NAMES[number];

export const NAYLA_VISUAL_TEMPLATES: Record<NaylaVisualTemplateName, Record<string, unknown>> = {
  'fragment-reveal': {
    visualTemplate: 'fragment-reveal',
    efecto: 'push-in',
    transitionType: 'push-cut',
    transitionDuration: 0.45,
    overlay: 'vignette',
    overlayIntensity: 0.22,
    gsapMotion: { enter: 'fade', enterDuration: 0.45, intensity: 0.5 },
  },
  'carousel-card': {
    visualTemplate: 'carousel-card',
    efecto: 'float',
    transitionType: 'slide',
    transitionDuration: 0.5,
    gsapMotion: { enter: 'slide-right', exit: 'slide-left', enterDuration: 0.5, exitDuration: 0.45, intensity: 0.55 },
  },
  'depth-stack': {
    visualTemplate: 'depth-stack',
    efecto: 'parallax-3d',
    transitionType: 'cross-zoom',
    transitionDuration: 0.5,
    overlay: 'vignette',
    overlayIntensity: 0.3,
    gsapMotion: { enter: 'zoom-in', enterDuration: 0.55, intensity: 0.5 },
  },
  'split-panels': {
    visualTemplate: 'split-panels',
    efecto: 'pan',
    transitionType: 'push-cut',
    transitionDuration: 0.4,
    gsapMotion: { enter: 'fade', enterDuration: 0.35, intensity: 0.45 },
  },
  'poster-pop': {
    visualTemplate: 'poster-pop',
    efecto: 'push-in',
    transitionType: 'film-burn',
    transitionDuration: 0.45,
    overlay: 'film-grain',
    overlayIntensity: 0.16,
    gsapMotion: { enter: 'zoom-in', exit: 'fade', enterDuration: 0.45, exitDuration: 0.4, intensity: 0.55 },
  },
};

export const isNaylaVisualTemplateName = (value: unknown): value is NaylaVisualTemplateName =>
  typeof value === 'string' && (NAYLA_VISUAL_TEMPLATE_NAMES as readonly string[]).includes(value);

export const applyNaylaVisualTemplate = <T extends Record<string, any>>(asset: T): T => {
  const requested = typeof asset.visualTemplate === 'string'
    ? asset.visualTemplate.trim().toLowerCase()
    : '';

  if (!isNaylaVisualTemplateName(requested)) return asset;

  const preset = NAYLA_VISUAL_TEMPLATES[requested];
  return {
    ...preset,
    ...asset,
    visualTemplate: requested,
    professionalEffects: asset.professionalEffects ?? preset.professionalEffects,
    motionBlur: asset.motionBlur ?? preset.motionBlur,
    gsapMotion: asset.gsapMotion ?? preset.gsapMotion,
    proceduralMotion: asset.proceduralMotion ?? preset.proceduralMotion,
  } as T;
};
