# Auditoría y Plan de Migración de APIs - Aria Metahumana

## 1. Inventario del Proyecto

### 1.1. Archivos `.env` y de Configuración
*   `.env.example`: Contiene `REMOTION_AWS_ACCESS_KEY_ID`, `REMOTION_AWS_SECRET_ACCESS_KEY`, `MANUS_API_KEY`, `MANUS_API_URL`.
*   El resto de API Keys se manejan dinámicamente desde la base de datos Supabase, específicamente en la tabla `api_keys_pool` (ver `src/utils/apiKeyManager.ts`). Proveedores identificados en el código: `gemini`, `manus_ai`, `pixabay`. Las llaves también tienen fallback en variables de entorno como `GEMINI_API_KEY`, `MANUS_API_KEY`, `REPLICATE_API_TOKEN`, `FAL_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

### 1.2. Uso de Modelos (ElevenLabs, Groq, Mistral)
*   **ElevenLabs:** Mencionado en `ANALISIS.md` y `REPORTE_COMPLETO.md` como una posible integración futura. Actualmente, el endpoint `/api/ia-audio.ts` (TTS) es un mock que devuelve un MP3 estático (SoundHelix). No hay código real usando ElevenLabs.
*   **Mistral y Groq:** No se encontró rastro en el código fuente actual (búsquedas con `grep` no arrojaron resultados en el código, solo menciones nulas). Actualmente, la IA principal implementada usa Google Gemini (`@google/generative-ai` y llamadas a su API) y Manus AI (via API REST). El sistema parece depender fuertemente de Gemini para el "supervisor".

### 1.3. Versiones del Stack
*   **Remotion:** `4.0.483` (en `package.json`).
*   **Node.js:** `v22.22.1` (comprobado en entorno y `package.json` `@types/node`).
*   **Python:** `3.12.13` (comprobado en entorno, usado en `oracle-service/Dockerfile`).

### 1.4. Conexión del Editor (Frontend) con Oracle Service
*   El frontend (Next.js) actúa como proxy hacia el Oracle Service.
*   El frontend envía peticiones POST o GET a endpoints como `/api/extract-video`, `/api/process-clip`, `/api/render`, `/api/render-cancel`, `/api/render-status`.
*   Estas rutas Next.js toman las peticiones, añaden un encabezado `Authorization: Bearer <ORACLE_SECRET>` (obtenido de las variables de entorno) y envían la petición hacia `ORACLE_SERVER_URL` (ej. `https://oracle-api.132.145.184.192.sslip.io`).
*   El Oracle Service (Node.js/Express) recibe estas peticiones, valida el secreto, y ejecuta tareas pesadas como usar `yt-dlp` o procesar video, interactuando directamente con Supabase Storage y la tabla `memoria_nayla`. Devuelve respuestas asíncronas o inmediatas (HTTP 202) para evitar timeouts.

---

## 2. Deuda Técnica y Faltantes

### 2.1. Fallo en Conexión TTS
*   La conexión TTS **no existe actualmente**. El archivo `src/pages/api/ia-audio.ts` contiene una advertencia: `// TODO: Implementar llamada real a servicio de TTS (Texto a voz) usando la API Key.`. Solo extrae la API Key pero siempre devuelve `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3`.
*   La migración a Qwen3-TTS requerirá escribir la lógica de integración completa en este endpoint.

### 2.2. Manejo de Errores Ausente o Inadecuado
*   **`src/pages/api/ia-audio.ts` y `src/pages/api/ia-fotos.ts`**: Verifican que el usuario sea admin (`ajn.liq.128@proton.me`), pero al ser mocks, no manejan errores de red reales de proveedores externos (excepto la obtención de la API key).
*   **Oracle Service (`oracle-service/server.js`)**: El procesamiento de recortes (`/api/process-clip`) falla silenciosamente si la inserción en la base de datos (fallback) falla tras fallar la llamada al API centralizado de Next.js (línea ~470).
*   **Falta validación de Input**: Varios endpoints asumen que el body de la petición tiene la estructura correcta sin validación estricta (ej. Zod no se usa extensamente en los API routes, a pesar de estar en el `package.json`).

### 2.3. APIs Hardcodeadas / Acoplamiento Fuerte
*   **Pixabay**: Integrado directamente en `ia-fotos.ts`, `buscar-fotos.ts`, `buscar-videos-stock.ts`, `buscar-musica-stock.ts`.
*   **Mock TTS**: URL de SoundHelix hardcodeada en `ia-audio.ts`.
*   **Roles de usuario**: El email de administrador `ajn.liq.128@proton.me` está hardcodeado en múltiples archivos (`ia-audio.ts`, `ia-fotos.ts`, `supervisor.ts`, `buscar-youtube.ts`) en lugar de usar un sistema de roles en Supabase.
*   **URLs del Oráculo**: `ORACLE_SERVER_URL` tiene fallbacks hardcodeados a una IP específica (`https://oracle-api.132.145.184.192.sslip.io`) en varios endpoints.

---

## 3. Reporte de Migración y Arquitectura

### 3.1. Mapa de Arquitectura Actual (Diagrama Conceptual)

```text
[ Usuario (NaylaCore UI) ]
         |
         | (HTTP / API Routes)
         v
[ Vercel / Next.js Serverless ]
  - Proxy Seguro y Supervisor (Gemini)
  - Gestión Timeline & UI (Remotion)
  - Mocks (TTS, Imágenes)
         |
         | (Auth Bearer: ORACLE_SECRET)
         v
[ Oracle Cloud VM (Docker) ] -> [ Supabase (DB & Storage) ]
  - Node.js Express (oracle-service)
  - Descargas pesadas (yt-dlp)
  - Renderizado / Delogo (ffmpeg)
```

### 3.2. Tabla de APIs a Migrar

| Servicio / Endpoint | Origen (Actual) | Destino (Propuesto) | Notas |
| :--- | :--- | :--- | :--- |
| **Audio / TTS** (`/api/ia-audio.ts`) | Mock (SoundHelix) / ElevenLabs (plan) | **Qwen3-TTS** (Alibaba) | Requiere implementar la llamada a la API y el guardado temporal del audio en Supabase. |
| **LLM Core** (`apiKeyManager`, etc.) | Google Gemini / Manus AI | **Mistral / Groq** (requerimiento) | Actualmente el código está acoplado a Gemini (`GoogleGenerativeAI`). Habrá que reescribir `executeWithApiKey` para abstraer el proveedor. |
| **Lip-sync MetaHuman** | (No implementado) | **Unreal Engine 5** | Se necesitará un nuevo endpoint/webhook para orquestar los audios generados por Qwen3-TTS hacia UE5 para generar el lip-sync. |

### 3.3. Plan Paso a Paso para Migrar sin Romper Producción

1.  **Abstracción de LLMs (Fase 1 - Core):**
    *   Crear interfaces genéricas para generación de texto (`generateText(prompt, model)`).
    *   Implementar adaptadores para Groq/Mistral junto a los existentes de Gemini.
    *   Añadir llaves de Groq/Mistral al `api_keys_pool` en Supabase y actualizar `apiKeyManager.ts` para soportarlas.
    *   Probar en un entorno staging antes de cambiar el tráfico.
2.  **Implementación TTS Qwen3 (Fase 2 - Audio):**
    *   Obtener acceso y API keys para Qwen3-TTS.
    *   Reescribir `src/pages/api/ia-audio.ts`. Eliminar el mock.
    *   Hacer la llamada a Qwen3-TTS, recibir el buffer de audio, guardarlo en Supabase Storage, y devolver la URL pública.
    *   Asegurar manejo de errores y rate limits para Alibaba Cloud.
3.  **Integración Unreal Engine 5 (Fase 3 - MetaHuman):**
    *   Diseñar un mecanismo de comunicación (ej. WebSockets o webhooks) entre el backend (Next.js/Oracle) y el entorno de Unreal Engine.
    *   Una vez que el TTS genere el audio, enviar el audio (o la URL) y los metadatos a UE5 para el procesamiento de lip-sync.
4.  **Limpieza de Deuda Técnica (Continua):**
    *   Mover emails hardcodeados a variables de entorno o sistema de roles DB.
    *   Refactorizar URLs de Oracle para que dependan estrictamente de `.env`.

### 3.4. Estimación de Ahorro Mensual
*   *Nota: Las cifras exactas dependen del volumen de uso.*
*   **TTS:** ElevenLabs cuesta ~$0.06 - $0.30 por 1000 caracteres (dependiendo del plan). Qwen3-TTS, siendo open-source o alojado en infraestructura propia, tiene un costo marginal cercano a $0 (solo cómputo de servidor) o tarifas de API significativamente menores en Alibaba Cloud. Si Aria genera 1 millón de caracteres al mes, el ahorro sería de **~$60 a $300 mensuales** solo en TTS.
*   **LLM:** Migrar de soluciones costosas a Groq (con Mistral) ofrece inferencia ultrarrápida a un costo mucho menor por token comparado con modelos premium de otros proveedores.
