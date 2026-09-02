export type ImageGenerationRequest = { prompt: string; sourceImageUrl?: string };
export type AudioGenerationRequest = { text: string };

/** Provider seams: configure provider names and credentials later without changing API contracts. */
export async function generateImage(_request: ImageGenerationRequest): Promise<{ url: string }> {
  void _request;
  if (!process.env.IMAGE_GENERATION_PROVIDER) throw new Error('IMAGE_GENERATION_PROVIDER no configurado.');
  throw new Error('El proveedor de generación de imágenes aún no fue seleccionado.');
}

export async function generateSpeech(_request: AudioGenerationRequest): Promise<{ url: string }> {
  void _request;
  if (!process.env.TTS_PROVIDER) throw new Error('TTS_PROVIDER no configurado.');
  throw new Error('El proveedor TTS aún no fue seleccionado.');
}
