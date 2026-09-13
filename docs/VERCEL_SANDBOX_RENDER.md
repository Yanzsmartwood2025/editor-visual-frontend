# Renderizado de Remotion en Vercel Sandbox

El endpoint `POST /api/render` ejecuta el renderizado síncrono completo: crea un
bundle de `src/remotion/index.ts`, crea un Sandbox, sube el bundle, renderiza la
composición `MainComposition`, lee el archivo generado desde el filesystem del
Sandbox y lo almacena en Cloudflare R2.

## Decisión de bundling

El bundle se crea **una vez por instancia caliente de la función de Vercel** y se
reutiliza para las solicitudes posteriores de esa instancia. Es un artefacto
inmutable del código desplegado, por lo que no depende de los `inputProps` de un
render. En cambio, se crea y se destruye un Sandbox por solicitud: así los
archivos temporales, procesos de Chromium y el ciclo de vida de cada render no
se comparten entre usuarios. Una nueva instancia fría vuelve a generar el bundle.

## Configuración necesaria

Configura las credenciales que requiere `@vercel/sandbox` para el proyecto de
Vercel, junto con las variables ya usadas por `src/lib/r2.ts`:

- `CLOUDFLARE_R2_ACCOUNT_ID`
- `CLOUDFLARE_R2_ACCESS_KEY_ID`
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
- `CLOUDFLARE_R2_BUCKET`
- `CLOUDFLARE_R2_PUBLIC_BASE_URL`

El SDK de Vercel Sandbox resuelve sus propias credenciales desde el contexto
OIDC del entorno de Vercel. Para desarrollo local, enlaza el proyecto y expón
`VERCEL_OIDC_TOKEN` (por ejemplo, mediante `vercel env pull`). No se pasan
tokens manualmente al renderizador.
