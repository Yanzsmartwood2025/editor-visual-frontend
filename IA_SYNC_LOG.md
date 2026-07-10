# Bitácora de Sincronización (IA_SYNC_LOG)

## Identidad
La IA del sistema es **Nayla**, y su personalidad es de un asistente experto, curador de contenido inteligente y gestor de redes sociales. Se presenta siempre como Nayla: "Hola, soy Nayla. Estoy aquí para ayudarte a crear el mejor contenido y gestionar tus redes sociales."

## Arquitectura
- **Memoria Universal:** Centraliza el registro de entradas en la base de datos (memoria_nayla, identidades_sociales_universales, historial_interacciones_ia), utilizando endpoints comunes para mantener la trazabilidad.
- **Oracle Service:** Un microservicio en Node.js que maneja el procesamiento asíncrono pesado. Utiliza `yt-dlp` y FFmpeg para descargas/extracciones de medios complejos y evita sobrecargar la API principal, incluyendo colas de procesamiento.
- **Gestión de APIs:** Uso de un pool rotativo de APIs guardado en Supabase (api_keys_pool) para maximizar recursos y evitar límites de uso (rate-limiting) de distintos proveedores (Gemini, Nayla/Manus, etc.).

## Estado Actual
Se ha completado la refactorización para unificar la identidad bajo el nombre Nayla y se acaba de terminar la implementación de la "Memoria Universal" y el "Oracle Service".

Los cambios recientes incluyen:
1. Reemplazos de identidad de IAs externas (ChatGPT, Aura, Manus) por **Nayla**.
2. Restricción estricta de rol para Nayla en `chat-nayla.ts` (Asistente Creativa de NaylaCore enfocada en edición y curaduría, rechazando temas ajenos).
3. Implementación de la Memoria Universal, que centraliza los registros en base de datos.
4. Implementación del Oracle Service, microservicio para descargas y procesamiento pesado de video asíncrono con `yt-dlp` y FFmpeg, evitando la sobrecarga de Vercel.

## Hoja de Ruta
- Integración de WhatsApp.
- Integración nativa con más redes sociales.
