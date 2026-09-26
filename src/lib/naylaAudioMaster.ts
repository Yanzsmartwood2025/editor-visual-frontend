import { z } from 'zod';

export const NAYLA_AUDIO_MASTER_PRESETS = [
  'none',
  'clean-master',
  'voice-polish',
  'podcast-master',
  'cinematic-master',
  'telephone',
  'radio',
  'dreamy-reverb',
  'underwater',
  'club',
] as const;

export type NaylaAudioMasterPreset = typeof NAYLA_AUDIO_MASTER_PRESETS[number];

export const NAYLA_AUDIO_MASTER_PRESET_INFO = [
  { id: 'clean-master', label: 'Master limpio', description: 'Corte de graves, compresión suave y limiter para un resultado controlado.' },
  { id: 'voice-polish', label: 'Voz pulida', description: 'Limpia graves, realza presencia, reduce sibilancia y controla dinámica.' },
  { id: 'podcast-master', label: 'Podcast Master', description: 'Reducción de ruido, presencia vocal, compresión, limiter y normalización.' },
  { id: 'cinematic-master', label: 'Master cinematográfico', description: 'Más cuerpo y control dinámico manteniendo impacto.' },
  { id: 'telephone', label: 'Teléfono', description: 'Banda estrecha de voz con compresión tipo llamada telefónica.' },
  { id: 'radio', label: 'Radio', description: 'Banda media, compresión y eco muy corto para carácter de radio.' },
  { id: 'dreamy-reverb', label: 'Dreamy Reverb', description: 'Eco/reverb suave para sensación amplia y etérea.' },
  { id: 'underwater', label: 'Underwater', description: 'Filtro grave cerrado con eco corto para efecto sumergido.' },
  { id: 'club', label: 'Club', description: 'Refuerzo de graves, brillo y limiter para música con más pegada.' },
] as const;

export const audioMasterSettingsSchema = z.object({
  preset: z.enum(NAYLA_AUDIO_MASTER_PRESETS).optional().default('none'),
  lowCutHz: z.number().min(20).max(1200).optional(),
  highCutHz: z.number().min(800).max(20000).optional(),
  bassDb: z.number().min(-12).max(12).optional(),
  presenceDb: z.number().min(-12).max(12).optional(),
  compressor: z.boolean().optional(),
  limiter: z.boolean().optional(),
  normalize: z.boolean().optional(),
  targetLufs: z.number().min(-24).max(-8).optional(),
  noiseReduction: z.boolean().optional(),
  noiseGate: z.boolean().optional(),
  deEsser: z.number().min(0).max(1).optional(),
  reverb: z.number().min(0).max(1).optional(),
  echo: z.number().min(0).max(1).optional(),
  pan: z.number().min(-1).max(1).optional(),
}).strict();

export type NaylaAudioMasterSettings = z.infer<typeof audioMasterSettingsSchema>;

const trimNumber = (value: number) => {
  const fixed = Number(value.toFixed(4));
  return Number.isInteger(fixed) ? String(fixed) : String(fixed);
};

const equalizer = (frequency: number, gain: number, width = 1) =>
  `equalizer=f=${Math.round(frequency)}:width_type=o:w=${trimNumber(width)}:g=${trimNumber(gain)}`;

const compressor = () =>
  'acompressor=threshold=0.125:ratio=3:attack=20:release=250:makeup=1.35';

const limiter = () =>
  'alimiter=limit=0.95:attack=5:release=50';

const deEsser = (amount: number) => {
  const gain = -2 - Math.max(0, Math.min(1, amount)) * 6;
  return equalizer(6500, gain, 1.2);
};

const reverb = (amount: number) => {
  const wet = 0.08 + Math.max(0, Math.min(1, amount)) * 0.28;
  const secondary = Math.max(0.04, wet * 0.6);
  return `aecho=0.82:0.9:55|110:${trimNumber(wet)}|${trimNumber(secondary)}`;
};

const echo = (amount: number) => {
  const decay = 0.08 + Math.max(0, Math.min(1, amount)) * 0.42;
  return `aecho=0.84:0.9:240:${trimNumber(decay)}`;
};

const pan = (value: number) => {
  const normalized = Math.max(-1, Math.min(1, value));
  const left = normalized <= 0 ? 1 : 1 - normalized;
  const right = normalized >= 0 ? 1 : 1 + normalized;
  return `pan=stereo|c0=${trimNumber(left)}*c0|c1=${trimNumber(right)}*c1`;
};

export const buildNaylaAudioMasterFilter = (
  raw?: NaylaAudioMasterSettings | null
): string | null => {
  if (!raw) return null;

  const parsed = audioMasterSettingsSchema.safeParse(raw);
  if (!parsed.success) return null;
  const settings = parsed.data;
  const filters: string[] = [];

  switch (settings.preset) {
    case 'clean-master':
      filters.push('highpass=f=70', compressor(), limiter());
      break;
    case 'voice-polish':
      filters.push(
        'highpass=f=80',
        equalizer(2600, 2.8, 1.1),
        equalizer(6500, -3.5, 1.2),
        compressor(),
        limiter()
      );
      break;
    case 'podcast-master':
      filters.push(
        'highpass=f=70',
        'afftdn=nf=-28',
        equalizer(2800, 2.4, 1),
        equalizer(6500, -3, 1.1),
        compressor(),
        limiter(),
        'loudnorm=I=-16:TP=-1.5:LRA=11'
      );
      break;
    case 'cinematic-master':
      filters.push(
        equalizer(110, 2.5, 1),
        equalizer(3200, 1.2, 1.2),
        'acompressor=threshold=0.16:ratio=2.2:attack=28:release=360:makeup=1.18',
        limiter()
      );
      break;
    case 'telephone':
      filters.push(
        'highpass=f=300',
        'lowpass=f=3400',
        'acompressor=threshold=0.11:ratio=4:attack=8:release=130:makeup=1.5',
        limiter()
      );
      break;
    case 'radio':
      filters.push(
        'highpass=f=180',
        'lowpass=f=5200',
        equalizer(1800, 2.2, 1),
        'acompressor=threshold=0.12:ratio=4:attack=12:release=160:makeup=1.4',
        'aecho=0.9:0.88:38:0.10',
        limiter()
      );
      break;
    case 'dreamy-reverb':
      filters.push(
        'highpass=f=60',
        'aecho=0.82:0.9:60|120:0.24|0.14',
        limiter()
      );
      break;
    case 'underwater':
      filters.push(
        'lowpass=f=900',
        equalizer(180, 3.5, 1.2),
        'aecho=0.84:0.9:90:0.18',
        limiter()
      );
      break;
    case 'club':
      filters.push(
        equalizer(95, 4, 1),
        equalizer(9000, 2.2, 1.1),
        'acompressor=threshold=0.18:ratio=2.5:attack=15:release=220:makeup=1.18',
        limiter()
      );
      break;
    case 'none':
    default:
      break;
  }

  if (settings.lowCutHz) filters.push(`highpass=f=${Math.round(settings.lowCutHz)}`);
  if (settings.highCutHz) filters.push(`lowpass=f=${Math.round(settings.highCutHz)}`);
  if (settings.bassDb) filters.push(equalizer(110, settings.bassDb, 1));
  if (settings.presenceDb) filters.push(equalizer(2800, settings.presenceDb, 1));
  if (settings.noiseReduction) filters.push('afftdn=nf=-28');
  if (settings.noiseGate) filters.push('agate=threshold=0.025:ratio=3:attack=20:release=250');
  if (settings.deEsser && settings.deEsser > 0) filters.push(deEsser(settings.deEsser));
  if (settings.compressor) filters.push(compressor());
  if (settings.reverb && settings.reverb > 0) filters.push(reverb(settings.reverb));
  if (settings.echo && settings.echo > 0) filters.push(echo(settings.echo));
  if (settings.pan !== undefined && Math.abs(settings.pan) > 0.001) filters.push(pan(settings.pan));
  if (settings.normalize) filters.push(`loudnorm=I=${trimNumber(settings.targetLufs ?? -16)}:TP=-1.5:LRA=11`);
  if (settings.limiter) filters.push(limiter());

  return filters.length ? filters.join(',') : null;
};

export const hasNaylaAudioMasterProcessing = (raw?: NaylaAudioMasterSettings | null) =>
  Boolean(buildNaylaAudioMasterFilter(raw));
