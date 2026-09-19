# NaylaCore Video Editor

Editor web basado en Next.js + Remotion.

## Arquitectura actual

- **Firebase Auth**: identidad de usuario y verificación de sesión.
- **Supabase**: base de datos para galería, proyectos, memoria, plantillas, configuración y registros del sistema.
- **Cloudflare R2**: Bóveda física para fotos, videos, audios y renders.
- **Remotion + Vercel Sandbox**: composición y render final.
- **Groq / Mistral**: asistencia de Nayla para construir y modificar timelines.

Oracle Cloud PC y Supabase Storage ya no forman parte del flujo activo.

## Flujo de medios

1. El usuario sube un archivo.
2. El archivo físico se guarda en Cloudflare R2 bajo el espacio del usuario.
3. Supabase registra URL, tipo, nombre, metadata, duración y proporción.
4. El editor usa esos registros para construir el timeline.
5. Remotion renderiza en Vercel Sandbox.
6. El MP4 final vuelve a Cloudflare R2 y se registra en la Bóveda.

## Desarrollo

```bash
npm ci
npm run dev
```

Remotion Studio:

```bash
npx remotion studio
```

Pruebas y build:

```bash
npm test
npm run build
```

## Variables principales

Consulta `.env.example`. No guardes secretos en el repositorio.
