# Puente de voz para videos (preparación sin claves)

El editor existente no se modifica ni pierde sus API actuales. El módulo aislado `src/lib/videoVoice/cartesiaVideoPool.ts` solo utiliza seis claves nuevas, cargadas posteriormente como secretos de servidor:

- `CARTESIA_VIDEO_API_KEY_01`
- `CARTESIA_VIDEO_API_KEY_02`
- `CARTESIA_VIDEO_API_KEY_03`
- `CARTESIA_VIDEO_API_KEY_04`
- `CARTESIA_VIDEO_API_KEY_05`
- `CARTESIA_VIDEO_API_KEY_06`

También necesita `CARTESIA_VIDEO_VOICE_ID` y `NAYLA_VIDEO_TTS_ENABLED=true` al finalizar las pruebas. Por defecto está apagado y **no** lee `CARTESIA_API_KEY`, `CARTESIA_DEFAULT_VOICE_ID` ni ninguna clave de `arIA-LLM`.

## Comportamiento

El módulo selecciona credenciales distintas en orden circular **dentro de una instancia**; no es un distribuidor global de cuotas. Una respuesta 429 detiene la solicitud y no salta automáticamente a otras cuentas para eludir restricciones. Antes de uso público, añadir cuotas persistentes por usuario, cuenta y día y respetar las condiciones de cada plan. La biblioteca no genera enlaces públicos ni expone las claves.

## Respaldo Deepgram de YAN'Z

La versión correcta de YAN'Z Smart Wood es `Yanzsmartwood2025/test-vercel`, fuente del proyecto `yanz-smart-wood`. Contiene `api/yanz-voice-speak.js` y `api/_lib/yanz-voice-engine.js`; la API usa `DEEPGRAM_API_KEY` solo en el servidor. No copiarla a este editor.

El servicio de YAN'Z permanece cerrado hasta validar Firebase Auth, App Check, permiso piloto y cuotas Firestore, tal como exige `security/YANZ_PAID_API_SETUP.md`. Solo entonces se podrá conectar como respaldo autenticado.

## Entrega desde ChatGPT

Para recibir WAV/MP3 directamente en ChatGPT será necesaria una conexión/herramienta autorizada capaz de solicitar los audios y transferir el archivo binario. Los cambios aquí son preparación de código, **no** un plugin instalado ni una prueba real de voz. La exportación MP4 seguirá usando el motor local, sin necesidad de renderizado en Vercel.
