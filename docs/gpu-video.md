# GPU Video: imagen a video en Vast

## Alcance

`Generar → GPU → Video` carga su interfaz y consulta su trabajo solamente mientras ese módulo está montado. Mantiene los estilos de cristal del espacio Generar. No alquila al abrir la pantalla.

El contador muestra el tiempo desde la asignación, el estado de actividad/espera/cierre, los clips guardados y el límite restante.

Permite subir JPG/PNG/WebP (20 MB), elegir una foto de la Bóveda del proyecto, escribir el movimiento, elegir orientación vertical/horizontal, 3/5 segundos, encuadre completo/recorte, 30/50 pasos, semilla, intensidad y prompt negativo. Exporta MP4 a 24 fps sin audio. No ofrece voz, sincronización labial, fotograma final ni formatos que el worker no admite.

## Recorrido

1. La subida usa el servicio existente de Bóveda y R2.
2. `/api/generar/gpu-video` autentica Firebase y comprueba propietario, proyecto, chat y foto.
3. Cotiza la receta `wan22-image-to-video` exclusivamente en Vast. La confirmación vuelve a validar la oferta antes de alquilar.
4. El orquestador existente guarda `gpu_jobs`, prepara permisos temporales de entrada/salida e inicia el contenedor.
5. El worker obtiene el manifiesto autenticado, instala las dependencias fijadas, descarga el modelo y produce el video. El prompt se pasa al modelo como texto, nunca se ejecuta como código.
6. Sube el MP4 a R2. El callback comprueba la salida y registra la Bóveda. La sesión permanece disponible hasta dos minutos para otro clip; elegir cerrar destruye la instancia. Si no hay otro pedido, el worker solicita la limpieza al vencer la espera y el cron actúa como respaldo. El panel ofrece reproducir, descargar y usar en el editor.
7. Al volver al panel se recupera el último trabajo del proyecto/chat. Durante la recuperación no se puede iniciar otro. Cancelar solicita el cierre mediante el mecanismo existente de limpieza.

No necesita una tabla nueva. Se reutilizan `gpu_jobs` y `galeria_multimedia` con los controles de propietario del servidor. En la inspección de naylacore, la tarea `nayla-gpu-lease-janitor` estaba activa cada dos minutos. Las claves de Vast, Supabase y R2 no se entregan al navegador ni al modelo.

## Motor y despliegue

- Modelo oficial: `Wan-AI/Wan2.2-TI2V-5B-Diffusers`, revisión `b8fff7315c768468a5333511427288870b2e9635`.
- Contenedor: `pytorch/pytorch:2.4.0-cuda12.4-cudnn9-runtime`.
- Diffusers 0.35.2; dependencias adicionales fijadas en `gpu-workers/wan22/run-job.py`.
- CPU offload y VAE tiling. Filtro conservador: GPU ≥24 GB VRAM, RAM del host ≥64 GB y disco de 80 GB.
- Dimensiones reales: 704×1280 o 1280×704. Se solicitan 4n+1 frames y se recorta el último al exportar para obtener exactamente 3/5 segundos.
- Perfil: hasta USD 0.60/h y plazo de 30 minutos más la gracia global de arranque (8 minutos por defecto), sujeto a los controles globales de presupuesto y disponibilidad.
- El arranque descarga el worker desde `main`, como las recetas existentes. **Debe fusionarse este cambio antes de intentar una generación desde producción o una vista previa.**

La primera descarga e instalación también consume alquiler. El coste mostrado es una estimación, no un tope financiero garantizado: el arranque, transferencia, disco y retraso del cierre pueden cambiar la factura. No se ha alquilado una GPU durante la implementación: la prueba desde la interfaz requiere iniciar sesión en este navegador.

## Validación y límites pendientes

Las pruebas locales verifican contrato, autorización, pertenencia de fotos, reserva con oferta explícita, cancelación y restricciones de la receta. Las pruebas Python comprueban validación, plazos y rechazo de destinos privados sin descargar modelos. TypeScript y la compilación comprueban la integración del módulo.

Antes de considerarlo validado en producción falta una prueba autorizada con coste real: confirmar una oferta, generar un clip de 3 segundos, verificar reproducción/duración y Bóveda, comprobar la destrucción en Vast y probar la cancelación. No se ha medido todavía la memoria, velocidad ni calidad visual en una GPU real. La comprobación visual del navegador está pendiente por el bloqueo de proxy del entorno.

La protección global de trabajos simultáneos del orquestador preexistente consulta el número activo; no constituye una reserva transaccional entre varias pestañas. El módulo bloquea doble clic y recupera trabajos, pero una garantía global estricta requeriría una reserva atómica adicional.

## Referencias oficiales

- https://github.com/Wan-Video/Wan2.2
- https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B-Diffusers
- https://github.com/huggingface/diffusers/blob/v0.35.2/src/diffusers/pipelines/wan/pipeline_wan_i2v.py
- https://docs.vast.ai/guides/serverless/comfyui-wan-2.2 (referencia de infraestructura; su plantilla T2V 14B es distinta de esta receta I2V 5B).
- https://docs.dev.runwayml.com/guides/using-the-api/ (referencia de flujo de producto asíncrono).

## Sesiones reutilizables y almacenamiento

La sesión mantiene un proceso Python y el mismo pipeline en la misma instancia. Cada clip tiene su identificador y clave de salida propia; las escrituras comparan estado, generación y fase para impedir duplicados o continuar una sesión que ya se está cerrando. Se reutiliza el plazo total original: otro clip no renueva ilimitadamente el alquiler. Se exige al menos cinco minutos restantes para aceptar un clip nuevo; eso no garantiza que alcance para cualquier GPU.

La espera consume alquiler. No responder inicia el cierre automático, que puede retrasarse por red o por el cron de respaldo. El contador solo anuncia GPU cerrada cuando el servidor registra la destrucción. Las fotos y videos guardados en R2 permanecen; esta receta no crea volúmenes persistentes en Vast. Destruir la instancia elimina el disco de su contenedor según Vast, pero no permite certificar desde la app un borrado forense del hardware del proveedor.

El inventario oficial del modelo fijado suma 34,201,418,400 bytes (~34.2 GB decimales) en transformer/text_encoder/vae/tokenizer/scheduler/model_index. R2 Standard cuesta USD 0.015/GB-mes, con 10 GB-mes gratuitos compartidos por la cuenta y operaciones facturadas aparte. Como ejemplo, 35 GB constantes costarían aproximadamente USD 0.375/mes de almacenamiento si los 10 GB gratuitos estuvieran disponibles; USD 0.525 si ya se consumieron. R2 no cobra egreso a Internet; revisar también las transferencias del host Vast.

El modelo sigue descargándose desde su repositorio oficial. No se ha creado una copia de 34 GB en R2. Guardarla allí puede dar control de versión/distribución, pero no elimina la descarga hacia una GPU nueva ni sustituye su RAM/VRAM. Una imagen Docker preconstruida evitaría instalar las dependencias en cada arranque; también necesita descargarse cuando el host no la tiene cacheada.

Referencias de almacenamiento: https://developers.cloudflare.com/r2/pricing/ y https://docs.vast.ai/guides/instances/manage-instances.
