export const NAYLA_FILTER_PRESETS = [
  { id: 'none', label: 'Sin filtro', description: 'Conserva el color original.', cssFilter: '' },
  { id: 'grayscale', label: 'Blanco y negro', description: 'Monocromo completo.', cssFilter: 'grayscale(100%)' },
  { id: 'sepia', label: 'Sepia', description: 'Tono sepia clásico.', cssFilter: 'sepia(100%)' },
  { id: 'vintage', label: 'Vintage', description: 'Película cálida con contraste moderado.', cssFilter: 'sepia(50%) contrast(1.2) brightness(0.9)' },
  { id: 'cinematic', label: 'Cinematográfico', description: 'Contraste y saturación de cine.', cssFilter: 'contrast(1.3) brightness(0.9) saturate(1.2)' },
  { id: 'blur', label: 'Blur', description: 'Desenfoque fuerte del plano.', cssFilter: 'blur(10px)' },
  { id: 'glow', label: 'Glow', description: 'Brillo suave y resplandor.', cssFilter: 'saturate(1.18) contrast(1.08) brightness(1.05) drop-shadow(0 0 18px rgba(255,255,255,0.22))' },
  { id: 'high-contrast', label: 'Alto contraste', description: 'Negros y luces más marcados.', cssFilter: 'contrast(1.55) saturate(1.08)' },
  { id: 'soft', label: 'Suave', description: 'Contraste reducido y piel más delicada.', cssFilter: 'contrast(0.92) brightness(1.05) saturate(0.92)' },
  { id: 'cool-blue', label: 'Frío azul', description: 'Ambiente frío, limpio y ligeramente desaturado.', cssFilter: 'brightness(0.96) contrast(1.08) saturate(0.88) hue-rotate(8deg)' },
  { id: 'warm', label: 'Cálido', description: 'Temperatura cálida y agradable.', cssFilter: 'sepia(0.14) saturate(1.16) hue-rotate(-6deg) brightness(1.02)' },
  { id: 'teal-orange', label: 'Teal & Orange', description: 'Contraste comercial con sensación turquesa/naranja.', cssFilter: 'contrast(1.18) saturate(1.28) sepia(0.08) hue-rotate(-10deg)' },
  { id: 'noir', label: 'Noir', description: 'Blanco y negro dramático con sombras profundas.', cssFilter: 'grayscale(100%) contrast(1.38) brightness(0.86)' },
  { id: 'desaturated-drama', label: 'Drama desaturado', description: 'Color reducido y contraste intenso.', cssFilter: 'saturate(0.52) contrast(1.28) brightness(0.92)' },
  { id: 'horror-green', label: 'Horror verdoso', description: 'Tono enfermizo y oscuro para terror.', cssFilter: 'sepia(0.18) saturate(0.78) hue-rotate(55deg) contrast(1.25) brightness(0.83)' },
  { id: 'dreamy', label: 'Dreamy', description: 'Imagen luminosa, suave y etérea.', cssFilter: 'brightness(1.07) contrast(0.9) saturate(0.88) blur(0.4px)' },
  { id: 'faded-film', label: 'Faded Film', description: 'Película lavada con saturación reducida.', cssFilter: 'contrast(0.88) brightness(1.03) saturate(0.72) sepia(0.12)' },
  { id: 'cyberpunk', label: 'Cyberpunk', description: 'Color intenso con sesgo neón frío.', cssFilter: 'saturate(1.55) contrast(1.25) hue-rotate(18deg) brightness(0.92) drop-shadow(0 0 12px rgba(0,220,255,0.2))' },
  { id: 'moonlight', label: 'Moonlight', description: 'Noche fría y desaturada.', cssFilter: 'brightness(0.84) contrast(1.14) saturate(0.68) hue-rotate(15deg)' },
  { id: 'sunset', label: 'Sunset', description: 'Atardecer cálido y saturado.', cssFilter: 'sepia(0.16) saturate(1.35) hue-rotate(-10deg) brightness(1.02) contrast(1.08)' },
  { id: 'bleach-bypass', label: 'Bleach Bypass', description: 'Contraste duro y color contenido.', cssFilter: 'saturate(0.45) contrast(1.5) brightness(0.95)' },
  { id: 'purple-night', label: 'Purple Night', description: 'Noche púrpura intensa.', cssFilter: 'brightness(0.78) contrast(1.2) saturate(1.15) hue-rotate(25deg)' },
  { id: 'blue-fire', label: 'Blue Fire', description: 'Azules eléctricos con contraste alto.', cssFilter: 'sepia(0.1) saturate(1.6) hue-rotate(160deg) contrast(1.25) brightness(0.9)' },
] as const;

export type NaylaFilterPresetName = typeof NAYLA_FILTER_PRESETS[number]['id'];

export const NAYLA_FILTER_PRESET_NAMES = NAYLA_FILTER_PRESETS.map((preset) => preset.id) as [
  NaylaFilterPresetName,
  ...NaylaFilterPresetName[],
];

export const getNaylaFilterPreset = (value: unknown) =>
  typeof value === 'string'
    ? NAYLA_FILTER_PRESETS.find((preset) => preset.id === value) || null
    : null;

export const getNaylaFilterCssFilter = (value: unknown): string | undefined => {
  const preset = getNaylaFilterPreset(value);
  return preset?.cssFilter || undefined;
};
