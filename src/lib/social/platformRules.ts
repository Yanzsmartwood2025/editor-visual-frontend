import type { SocialPlatform } from './types';

export type SocialCopyRule = {
  platform: SocialPlatform;
  supportsTitle: boolean;
  titleMax: number | null;
  captionMax: number;
  recommendedHashtags: { min: number; max: number };
  hardHashtagMax: number | null;
  titleStrategy: 'short-hook' | 'none' | 'searchable';
  notes: string[];
  limitBasis: 'official' | 'safe-product-limit';
};

const safe = (
  platform: SocialPlatform,
  values: Omit<SocialCopyRule, 'platform' | 'limitBasis'>
): SocialCopyRule => ({ platform, limitBasis: 'safe-product-limit', ...values });

export const SOCIAL_COPY_RULES: Record<SocialPlatform, SocialCopyRule> = {
  youtube: {
    platform: 'youtube',
    supportsTitle: true,
    titleMax: 100,
    captionMax: 5000,
    recommendedHashtags: { min: 3, max: 5 },
    hardHashtagMax: 60,
    titleStrategy: 'searchable',
    notes: [
      'Título máximo oficial: 100 caracteres.',
      'Descripción máxima oficial: 5000 caracteres.',
      'YouTube ignora todos los hashtags si el contenido supera 60 hashtags.',
      'Nayla usa pocos hashtags relevantes y deja al usuario aprobar el texto final.',
    ],
    limitBasis: 'official',
  },
  tiktok: {
    platform: 'tiktok',
    supportsTitle: false,
    titleMax: null,
    captionMax: 2200,
    recommendedHashtags: { min: 3, max: 6 },
    hardHashtagMax: null,
    titleStrategy: 'none',
    notes: [
      'La API oficial usa un único campo de caption/título de hasta 2200 runas UTF-16.',
      'Hashtags y menciones forman parte del caption.',
      'Nayla prioriza gancho breve + pocos hashtags específicos.',
    ],
    limitBasis: 'official',
  },
  instagram: safe('instagram', {
    supportsTitle: false,
    titleMax: null,
    captionMax: 1800,
    recommendedHashtags: { min: 4, max: 8 },
    hardHashtagMax: null,
    titleStrategy: 'none',
    notes: ['Límite interno conservador para mantener captions legibles y compatibles con rutas sociales.'],
  }),
  facebook: safe('facebook', {
    supportsTitle: false,
    titleMax: null,
    captionMax: 4000,
    recommendedHashtags: { min: 1, max: 4 },
    hardHashtagMax: null,
    titleStrategy: 'none',
    notes: ['Nayla prioriza texto natural; los hashtags son secundarios.'],
  }),
  threads: safe('threads', {
    supportsTitle: false,
    titleMax: null,
    captionMax: 450,
    recommendedHashtags: { min: 1, max: 3 },
    hardHashtagMax: null,
    titleStrategy: 'none',
    notes: ['Límite interno conservador para publicaciones breves.'],
  }),
  linkedin: safe('linkedin', {
    supportsTitle: false,
    titleMax: null,
    captionMax: 2800,
    recommendedHashtags: { min: 2, max: 5 },
    hardHashtagMax: null,
    titleStrategy: 'none',
    notes: ['El límite interno deja margen bajo el máximo histórico de 3000 caracteres de UGC.'],
  }),
  pinterest: safe('pinterest', {
    supportsTitle: true,
    titleMax: 90,
    captionMax: 500,
    recommendedHashtags: { min: 2, max: 5 },
    hardHashtagMax: null,
    titleStrategy: 'searchable',
    notes: ['Descripción limitada internamente a 500 caracteres; título corto y buscable.'],
  }),
  x: safe('x', {
    supportsTitle: false,
    titleMax: null,
    captionMax: 270,
    recommendedHashtags: { min: 1, max: 3 },
    hardHashtagMax: null,
    titleStrategy: 'none',
    notes: ['Límite interno conservador para cuentas estándar.'],
  }),
  bluesky: safe('bluesky', {
    supportsTitle: false,
    titleMax: null,
    captionMax: 280,
    recommendedHashtags: { min: 1, max: 3 },
    hardHashtagMax: null,
    titleStrategy: 'none',
    notes: ['Límite interno conservador.'],
  }),
  reddit: safe('reddit', {
    supportsTitle: true,
    titleMax: 250,
    captionMax: 4000,
    recommendedHashtags: { min: 0, max: 0 },
    hardHashtagMax: null,
    titleStrategy: 'searchable',
    notes: ['Nayla no añade hashtags por defecto en Reddit.'],
  }),
  google_business: safe('google_business', {
    supportsTitle: false,
    titleMax: null,
    captionMax: 1200,
    recommendedHashtags: { min: 0, max: 3 },
    hardHashtagMax: null,
    titleStrategy: 'none',
    notes: ['Texto informativo y directo; hashtags opcionales.'],
  }),
  snapchat: safe('snapchat', {
    supportsTitle: false,
    titleMax: null,
    captionMax: 1000,
    recommendedHashtags: { min: 1, max: 4 },
    hardHashtagMax: null,
    titleStrategy: 'none',
    notes: ['Límite interno conservador.'],
  }),
  discord: safe('discord', {
    supportsTitle: false,
    titleMax: null,
    captionMax: 1800,
    recommendedHashtags: { min: 0, max: 0 },
    hardHashtagMax: null,
    titleStrategy: 'none',
    notes: ['No usa hashtags por defecto.'],
  }),
  telegram: safe('telegram', {
    supportsTitle: false,
    titleMax: null,
    captionMax: 3500,
    recommendedHashtags: { min: 1, max: 5 },
    hardHashtagMax: null,
    titleStrategy: 'none',
    notes: ['Límite interno conservador para publicaciones con margen.'],
  }),
};

export const getSocialCopyRule = (platform: SocialPlatform) =>
  SOCIAL_COPY_RULES[platform];

const normalizeHashtag = (value: string) => {
  const cleaned = String(value || '')
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, '')
    .replace(/[^\p{L}\p{N}_-]/gu, '');
  return cleaned ? '#' + cleaned : '';
};

export const normalizeHashtags = (platform: SocialPlatform, values: unknown) => {
  const rule = getSocialCopyRule(platform);
  const list = Array.isArray(values) ? values : [];
  const unique = Array.from(new Set(list.map((value) => normalizeHashtag(String(value))).filter(Boolean)));
  const cap = rule.hardHashtagMax
    ? Math.min(rule.hardHashtagMax, rule.recommendedHashtags.max)
    : rule.recommendedHashtags.max;
  return unique.slice(0, Math.max(0, cap));
};

export const fitGeneratedSocialCopy = ({
  platform,
  title,
  caption,
  hashtags,
}: {
  platform: SocialPlatform;
  title?: string | null;
  caption?: string | null;
  hashtags?: unknown;
}) => {
  const rule = getSocialCopyRule(platform);
  const fittedTitle = rule.supportsTitle
    ? String(title || '').trim().slice(0, rule.titleMax || undefined)
    : '';
  const fittedCaption = String(caption || '').trim().slice(0, rule.captionMax);
  return {
    title: fittedTitle,
    caption: fittedCaption,
    hashtags: normalizeHashtags(platform, hashtags),
  };
};

export const socialCopyRulesForPrompt = (platforms: SocialPlatform[]) =>
  platforms.map((platform) => {
    const rule = getSocialCopyRule(platform);
    return {
      platform,
      supportsTitle: rule.supportsTitle,
      titleMax: rule.titleMax,
      captionMax: rule.captionMax,
      hashtagRange: rule.recommendedHashtags,
      hardHashtagMax: rule.hardHashtagMax,
      titleStrategy: rule.titleStrategy,
      notes: rule.notes,
    };
  });
