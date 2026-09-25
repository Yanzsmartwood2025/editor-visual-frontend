import { z } from 'zod';

export const NAYLA_AUDIO_BUSES = ['voice', 'music', 'ambience', 'sfx'] as const;
export type NaylaAudioBus = typeof NAYLA_AUDIO_BUSES[number];

export const NAYLA_AUDIO_MIX_PRESET_NAMES = [
  'balanced',
  'voice-focus',
  'podcast',
  'cinematic',
  'music-video',
  'ambient',
  'dramatic',
] as const;
export type NaylaAudioMixPresetName = typeof NAYLA_AUDIO_MIX_PRESET_NAMES[number];

export type NaylaAudioMixResolved = {
  preset: NaylaAudioMixPresetName;
  masterGain: number;
  autoDucking: boolean;
  duckMusicGain: number;
  duckAttack: number;
  duckRelease: number;
  busGains: Record<NaylaAudioBus, number>;
};

export const NAYLA_AUDIO_MIX_PRESETS: Record<NaylaAudioMixPresetName, NaylaAudioMixResolved> = {
  balanced: {
    preset: 'balanced',
    masterGain: 0.95,
    autoDucking: true,
    duckMusicGain: 0.28,
    duckAttack: 0.3,
    duckRelease: 0.65,
    busGains: { voice: 1, music: 0.62, ambience: 0.42, sfx: 0.78 },
  },
  'voice-focus': {
    preset: 'voice-focus',
    masterGain: 0.96,
    autoDucking: true,
    duckMusicGain: 0.18,
    duckAttack: 0.25,
    duckRelease: 0.7,
    busGains: { voice: 1, music: 0.46, ambience: 0.3, sfx: 0.62 },
  },
  podcast: {
    preset: 'podcast',
    masterGain: 0.96,
    autoDucking: true,
    duckMusicGain: 0.12,
    duckAttack: 0.2,
    duckRelease: 0.75,
    busGains: { voice: 1, music: 0.3, ambience: 0.18, sfx: 0.45 },
  },
  cinematic: {
    preset: 'cinematic',
    masterGain: 0.92,
    autoDucking: true,
    duckMusicGain: 0.34,
    duckAttack: 0.35,
    duckRelease: 0.8,
    busGains: { voice: 1, music: 0.72, ambience: 0.56, sfx: 0.9 },
  },
  'music-video': {
    preset: 'music-video',
    masterGain: 0.9,
    autoDucking: true,
    duckMusicGain: 0.5,
    duckAttack: 0.3,
    duckRelease: 0.55,
    busGains: { voice: 0.92, music: 0.92, ambience: 0.32, sfx: 0.72 },
  },
  ambient: {
    preset: 'ambient',
    masterGain: 0.92,
    autoDucking: true,
    duckMusicGain: 0.38,
    duckAttack: 0.45,
    duckRelease: 1,
    busGains: { voice: 0.94, music: 0.55, ambience: 0.72, sfx: 0.48 },
  },
  dramatic: {
    preset: 'dramatic',
    masterGain: 0.88,
    autoDucking: true,
    duckMusicGain: 0.24,
    duckAttack: 0.22,
    duckRelease: 0.85,
    busGains: { voice: 1, music: 0.66, ambience: 0.5, sfx: 1 },
  },
};

export const NAYLA_AUDIO_MIX_PRESET_INFO = [
  { id: 'balanced', label: 'Balanceado', description: 'Mezcla general con voz al frente y música controlada.' },
  { id: 'voice-focus', label: 'Voz protagonista', description: 'Prioriza locución y baja con fuerza música/ambiente durante la voz.' },
  { id: 'podcast', label: 'Podcast', description: 'Voz muy clara, cama musical discreta y efectos contenidos.' },
  { id: 'cinematic', label: 'Cinemático', description: 'Música y ambiente amplios con impactos fuertes sin tapar la voz.' },
  { id: 'music-video', label: 'Video musical', description: 'Música protagonista; la voz reduce la música solo lo necesario.' },
  { id: 'ambient', label: 'Atmosférico', description: 'Ambiente con más presencia y transiciones de volumen lentas.' },
  { id: 'dramatic', label: 'Dramático', description: 'Impactos SFX marcados, voz firme y música con ducking profundo.' },
] as const;

export const audioBusSchema = z.enum(NAYLA_AUDIO_BUSES);
export const audioMixSettingsSchema = z.object({
  preset: z.enum(NAYLA_AUDIO_MIX_PRESET_NAMES).optional().default('balanced'),
  masterGain: z.number().min(0).max(1.25).optional(),
  autoDucking: z.boolean().optional(),
  duckMusicGain: z.number().min(0).max(1).optional(),
  duckAttack: z.number().min(0).max(5).optional(),
  duckRelease: z.number().min(0).max(8).optional(),
  busGains: z.object({
    voice: z.number().min(0).max(1.5).optional(),
    music: z.number().min(0).max(1.5).optional(),
    ambience: z.number().min(0).max(1.5).optional(),
    sfx: z.number().min(0).max(1.5).optional(),
  }).strict().optional(),
}).strict();

export type NaylaAudioMixSettings = z.infer<typeof audioMixSettingsSchema>;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const resolveNaylaAudioMix = (input?: NaylaAudioMixSettings | null): NaylaAudioMixResolved => {
  const presetName = input?.preset && NAYLA_AUDIO_MIX_PRESET_NAMES.includes(input.preset)
    ? input.preset
    : 'balanced';
  const base = NAYLA_AUDIO_MIX_PRESETS[presetName];

  return {
    preset: presetName,
    masterGain: clamp(input?.masterGain ?? base.masterGain, 0, 1.25),
    autoDucking: input?.autoDucking ?? base.autoDucking,
    duckMusicGain: clamp(input?.duckMusicGain ?? base.duckMusicGain, 0, 1),
    duckAttack: clamp(input?.duckAttack ?? base.duckAttack, 0, 5),
    duckRelease: clamp(input?.duckRelease ?? base.duckRelease, 0, 8),
    busGains: {
      voice: clamp(input?.busGains?.voice ?? base.busGains.voice, 0, 1.5),
      music: clamp(input?.busGains?.music ?? base.busGains.music, 0, 1.5),
      ambience: clamp(input?.busGains?.ambience ?? base.busGains.ambience, 0, 1.5),
      sfx: clamp(input?.busGains?.sfx ?? base.busGains.sfx, 0, 1.5),
    },
  };
};

export const getNaylaAudioBusGain = (
  bus: NaylaAudioBus | undefined,
  mix: NaylaAudioMixResolved
) => bus ? mix.busGains[bus] : 1;

export type NaylaVoiceInterval = { start: number; end: number };

export const getNaylaMusicDuckGain = (
  absoluteSeconds: number,
  voiceIntervals: NaylaVoiceInterval[],
  mix: NaylaAudioMixResolved
) => {
  if (!mix.autoDucking || voiceIntervals.length === 0) return 1;

  let result = 1;
  for (const interval of voiceIntervals) {
    const start = Math.max(0, interval.start);
    const end = Math.max(start, interval.end);
    const attackStart = Math.max(0, start - mix.duckAttack);
    const releaseEnd = end + mix.duckRelease;

    if (absoluteSeconds < attackStart || absoluteSeconds > releaseEnd) continue;

    let gain = mix.duckMusicGain;
    if (absoluteSeconds < start && mix.duckAttack > 0) {
      const progress = (absoluteSeconds - attackStart) / mix.duckAttack;
      gain = 1 + (mix.duckMusicGain - 1) * clamp(progress, 0, 1);
    } else if (absoluteSeconds > end && mix.duckRelease > 0) {
      const progress = (absoluteSeconds - end) / mix.duckRelease;
      gain = mix.duckMusicGain + (1 - mix.duckMusicGain) * clamp(progress, 0, 1);
    }
    result = Math.min(result, gain);
  }

  return clamp(result, 0, 1);
};
