const normalizeIntentText = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const NUMBER_WORDS: Record<string, number> = {
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
};

export const getRequestedVisualCount = (value: string): number | null => {
  const text = normalizeIntentText(value);
  const numeric = text.match(/\b(\d{1,3})\s+(?:fotos?|imagenes?|fotografias?)\b/);
  if (numeric) {
    const count = Number(numeric[1]);
    return count >= 1 && count <= 250 ? count : null;
  }

  const words = Object.keys(NUMBER_WORDS).join('|');
  const written = text.match(new RegExp(`\\b(${words})\\s+(?:fotos?|imagenes?|fotografias?)\\b`));
  return written ? NUMBER_WORDS[written[1]] || null : null;
};

export const getRequestedTimelineSeconds = (value: string): number | null => {
  const text = normalizeIntentText(value);

  const minuteMatch = text.match(/\b(\d+(?:[.,]\d+)?)\s*(?:minutos?|min)\b/);
  if (minuteMatch) {
    const minutes = Number(minuteMatch[1].replace(',', '.'));
    const seconds = minutes * 60;
    return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 7200) : null;
  }

  if (/\b(?:un|una)\s+minuto\b/.test(text)) return 60;

  const secondMatch = text.match(/\b(\d+(?:[.,]\d+)?)\s*(?:segundos?|seg)\b/);
  if (secondMatch) {
    const seconds = Number(secondMatch[1].replace(',', '.'));
    return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 7200) : null;
  }

  return null;
};

export const hasNaturalProjectPhotoReference = (value: string) => {
  const text = normalizeIntentText(value);
  if (!/\b(fotos?|imagenes?|fotografias?)\b/.test(text)) return false;

  if (getRequestedVisualCount(text)) return true;

  return (
    /\b(todas?|estas?|mis|las)\s+(?:fotos?|imagenes?|fotografias?)\b/.test(text) ||
    /\b(?:fotos?|imagenes?|fotografias?)\s+(?:cargadas?|subidas?|guardadas?|del proyecto|de la boveda|que acabo de subir)\b/.test(text)
  );
};

export const wantsAllProjectPhotos = (value: string) => {
  const text = normalizeIntentText(value);
  return /\b(?:todas?|usar todas?|usa todas?|utiliza todas?)\s+(?:las\s+)?(?:fotos?|imagenes?|fotografias?)\b/.test(text);
};

export const extractSubtitleBlocks = (value: string): string[] => {
  const source = String(value || '').replace(/\r/g, '');
  const matches = Array.from(
    source.matchAll(/(?:^|\n)\s*BLOQUE\s+\d+\s*:?\s*\n([\s\S]*?)(?=(?:\n\s*BLOQUE\s+\d+\s*:?\s*\n)|$)/gi)
  );

  const unique: string[] = [];
  const seen = new Set<string>();

  for (const match of matches) {
    const text = String(match[1] || '')
      .trim()
      .replace(/\n{3,}/g, '\n\n');
    if (!text) continue;

    const key = normalizeIntentText(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(text);
    if (unique.length >= 300) break;
  }

  return unique;
};

export const buildEvenSubtitleTiming = (
  blocks: string[],
  totalSeconds: number
) => {
  if (!blocks.length || !Number.isFinite(totalSeconds) || totalSeconds <= 0) return [];

  const slot = totalSeconds / blocks.length;
  return blocks.map((text, index) => ({
    text,
    start: Math.round(index * slot * 1000) / 1000,
    end: Math.round((index + 1) * slot * 1000) / 1000,
    style: 'clean' as const,
    position: 'center' as const,
  }));
};


export const timelinePlanRequestsRender = (value: string) => {
  const text = normalizeIntentText(value);
  if (!text) return false;

  return (
    /\b(render|renderiza|renderizar|renderice|renderizado|renderizacion|produccion|producir|exporta|exportar)\b/.test(text) ||
    /\b(video final|resultado final|guardar(?:lo)? en la boveda|guardarlo en la boveda)\b/.test(text) ||
    /\b(crea|crear|haz|hacer|genera|generar|monta|montar)\b.{0,36}\bvideo\b/.test(text) ||
    /\bvideo\b.{0,36}\b(crea|crear|haz|hacer|genera|generar|renderiza|renderizar|produce|producir)\b/.test(text)
  );
};
