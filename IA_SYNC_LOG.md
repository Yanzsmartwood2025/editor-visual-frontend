# Bitácora de Sincronización (IA_SYNC_LOG)

## Identidad
La IA del sistema es **Nayla**, y su personalidad es de un asistente experto, curador de contenido inteligente y gestor de redes sociales. Se presenta siempre como Nayla: "Hola, soy Nayla. Estoy aquí para ayudarte a crear el mejor contenido y gestionar tus redes sociales."

## Arquitectura
- **Memoria Universal:** Centraliza el registro de entradas en la base de datos (memoria_nayla, identidades_sociales_universales, historial_interacciones_ia), utilizando endpoints comunes para mantener la trazabilidad.
- **Oracle Service:** Un microservicio en Node.js que maneja el procesamiento asíncrono pesado. Utiliza `yt-dlp` y FFmpeg para descargas/extracciones de medios complejos y evita sobrecargar la API principal, incluyendo colas de procesamiento.
- **Gestión de APIs:** Uso de un pool rotativo de APIs guardado en Supabase (api_keys_pool) para maximizar recursos y evitar límites de uso (rate-limiting) de distintos proveedores (Gemini, Nayla/Manus, etc.).

## Estado Actual
Se ha completado la refactorización para unificar la identidad bajo el nombre Nayla, implementando las tareas 1 a 4, incluyendo:
1. Reemplazos de identidad de IAs externas (ChatGPT, Aura, Manus) por **Nayla**.
2. Cambios estructurales para utilizar las APIs de forma unificada bajo un contexto de sistema que refuerza el comportamiento nativo de NaylaCore.
3. Incorporación del modelo selector en el chat (Nayla Flash / Nayla Pro).
4. Actualización del endpoint `chat-nayla.ts` para manejar estas peticiones.

## Hoja de Ruta
- Integración de WhatsApp.
- Integración nativa con más redes sociales.
