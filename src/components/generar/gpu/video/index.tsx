import { useMemo, useRef, useState } from "react";
import type { GenerarMediaItem, GenerarModuleProps } from "../../types";
import { uploadMediaFilesToBodega } from "../../../../lib/mediaUpload";
import {
  gpuVideoOptionsSchema,
  type GpuVideoOptions,
} from "../../../../lib/gpu/videoContract";
import GpuQuotePanel from "../GpuQuotePanel";
import useGpuVideo from "./useGpuVideo";
import VideoStyles from "./VideoStyles";
const stages: Record<string, string> = {
  renting: "Reservando GPU",
  booting: "Preparando el motor",
  processing: "Preparando el modelo y generando video",
  running: "GPU trabajando",
  cleanup_pending: "Cerrando GPU",
  completed: "Video terminado",
  expired: "Se alcanzó el tiempo límite",
  failed: "Trabajo detenido",
};
export default function GpuVideoModule({ context }: GenerarModuleProps) {
  const {
    session,
    projectId,
    threadId,
    mediaLibrary = [],
    selectedMediaIds = [],
    onUseMedia,
  } = context;
  const [uploads, setUploads] = useState<GenerarMediaItem[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState<GpuVideoOptions>(() =>
    gpuVideoOptionsSchema.parse({}),
  );
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [localError, setLocalError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadLock = useRef(false);
  const work = useGpuVideo(context);
  const photos = useMemo(
    () =>
      [
        ...uploads,
        ...mediaLibrary
          .filter(
            (item) =>
              item.tipo === "foto" &&
              (!item.project_id || item.project_id === projectId),
          )
          .slice()
          .reverse(),
      ].filter(
        (item, index, items) =>
          items.findIndex((other) => other.id === item.id) === index,
      ),
    [uploads, mediaLibrary, projectId],
  );
  const source =
    photos.find((item) => item.id === sourceId) ||
    photos.find((item) => selectedMediaIds.includes(item.id)) ||
    photos[0];
  const frozen = uploading || work.busy || work.running || !!work.quote;
  const change = (patch: Partial<GpuVideoOptions>) => {
    setOptions((old) => ({ ...old, ...patch }));
    work.clearQuote();
  };
  const upload = async (file?: File) => {
    if (!file || !session || !projectId || !threadId || uploadLock.current)
      return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 20 * 1024 * 1024
    ) {
      setLocalError("Usa una imagen JPG, PNG o WebP de hasta 20 MB.");
      return;
    }
    uploadLock.current = true;
    setUploading(true);
    setProgress(0);
    setLocalError("");
    try {
      const result = await uploadMediaFilesToBodega({
        session,
        files: [file],
        projectId,
        threadId,
        fuente: "gpu-video",
        existingItems: photos as any,
        forcedTipo: "foto",
        onProgress: (value) => setProgress(value.percent),
      });
      setUploads((old) => [...result, ...old]);
      setSourceId(result[0].id);
      work.clearQuote();
    } catch (e: any) {
      setLocalError(e.message || "No se pudo subir la foto.");
    } finally {
      uploadLock.current = false;
      setUploading(false);
    }
  };
  const result = work.job?.galleryItem;
  const resultUrl = result?.url || work.job?.outputUrl;
  return (
    <section data-generar-module="video" className="generar-module-stage">
      <VideoStyles />
      <div className="generar-stage-inner gpu-video-layout">
        <div className="generar-stage-heading">
          <span className="generar-eyebrow">NAYLA COMPUTE · VIDEO</span>
          <h2>Dale movimiento a tu imagen</h2>
          <p>
            Sube una foto, describe la escena y revisa el precio antes de
            generar.
          </p>
        </div>
        <div className="gpu-video-columns">
          <div className="generar-glass-panel gpu-video-source">
            <span className="generar-form-label">IMAGEN INICIAL</span>
            {source ? (
              <img
                className="gpu-video-reference"
                src={source.url}
                alt={source.nombre || "Imagen inicial"}
              />
            ) : (
              <div className="gpu-video-empty">Tu foto aparecerá aquí</div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="generar-secondary-action glass-glow-button"
              disabled={frozen || !session || !projectId || !threadId}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? `SUBIENDO ${Math.round(progress)}%` : "SUBIR FOTO"}
            </button>
            <small>JPG, PNG o WebP · hasta 20 MB</small>
            {!!photos.length && (
              <>
                <label
                  className="generar-form-label"
                  htmlFor="gpu-video-source"
                >
                  O ELEGIR DE LA BÓVEDA
                </label>
                <select
                  id="gpu-video-source"
                  disabled={frozen}
                  value={source?.id || ""}
                  onChange={(e) => {
                    setSourceId(e.target.value);
                    work.clearQuote();
                  }}
                >
                  {photos.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.etiqueta} · {item.nombre}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
          <div className="generar-glass-panel gpu-video-form">
            <label className="generar-form-label" htmlFor="gpu-video-prompt">
              ¿QUÉ DEBE SUCEDER?
            </label>
            <textarea
              id="gpu-video-prompt"
              className="generar-textarea"
              disabled={frozen}
              value={prompt}
              maxLength={1500}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="La cámara se acerca lentamente. La protagonista mira hacia la luz y su cabello se mueve con una brisa suave…"
            />
            <div className="gpu-video-presets" aria-label="Ideas de movimiento">
              {[
                "Acercamiento lento",
                "Cámara lateral suave",
                "Plano fijo, movimiento natural",
              ].map((text) => (
                <button
                  type="button"
                  className="glass-glow-button"
                  key={text}
                  disabled={frozen}
                  onClick={() =>
                    setPrompt((old) =>
                      (old + (old ? ". " : "") + text).slice(0, 1500),
                    )
                  }
                >
                  {text}
                </button>
              ))}
            </div>
            <div className="gpu-video-fields">
              <label>
                Formato
                <select
                  disabled={frozen}
                  value={options.orientation}
                  onChange={(e) =>
                    change({
                      orientation: e.target
                        .value as GpuVideoOptions["orientation"],
                    })
                  }
                >
                  <option value="portrait">Vertical · 704 × 1280</option>
                  <option value="landscape">Horizontal · 1280 × 704</option>
                </select>
              </label>
              <label>
                Duración
                <select
                  disabled={frozen}
                  value={options.duration}
                  onChange={(e) =>
                    change({ duration: Number(e.target.value) as 3 | 5 })
                  }
                >
                  <option value={3}>3 segundos</option>
                  <option value={5}>5 segundos</option>
                </select>
              </label>
              <label>
                Encuadre
                <select
                  disabled={frozen}
                  value={options.fit}
                  onChange={(e) =>
                    change({ fit: e.target.value as "contain" | "cover" })
                  }
                >
                  <option value="contain">
                    Foto completa · bordes si hace falta
                  </option>
                  <option value="cover">
                    Llenar pantalla · recorte central
                  </option>
                </select>
              </label>
              <label>
                Procesamiento
                <select
                  disabled={frozen}
                  value={options.steps}
                  onChange={(e) =>
                    change({ steps: Number(e.target.value) as 30 | 50 })
                  }
                >
                  <option value={30}>Estándar · 30 pasos</option>
                  <option value={50}>Más pasos · 50 · mayor espera</option>
                </select>
              </label>
            </div>
            <details className="gpu-video-advanced">
              <summary>Opciones avanzadas</summary>
              <label>
                Evitar en el video
                <textarea
                  className="generar-textarea"
                  disabled={frozen}
                  maxLength={1000}
                  value={options.negativePrompt}
                  onChange={(e) => change({ negativePrompt: e.target.value })}
                />
              </label>
              <div className="gpu-video-fields">
                <label>
                  Semilla · repetir configuración
                  <input
                    type="number"
                    min={0}
                    max={2147483647}
                    disabled={frozen}
                    value={options.seed}
                    onChange={(e) => change({ seed: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Fuerza del prompt · {options.guidance}
                  <input
                    type="range"
                    min={1}
                    max={7}
                    step={0.5}
                    disabled={frozen}
                    value={options.guidance}
                    onChange={(e) =>
                      change({ guidance: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
            </details>
            <p className="gpu-video-note">
              24 fotogramas por segundo · sin audio generado. La primera
              preparación descarga el modelo y puede tardar varios minutos. El
              tiempo de preparación también consume alquiler.
            </p>
            {!work.quote && (
              <button
                type="button"
                className="generar-primary-action glass-glow-button"
                disabled={
                  frozen ||
                  work.recoveryFailed ||
                  !session ||
                  !projectId ||
                  !threadId ||
                  !source ||
                  prompt.trim().length < 3 ||
                  !gpuVideoOptionsSchema.safeParse(options).success
                }
                onClick={() =>
                  void work.prepare({
                    mediaId: source!.id,
                    prompt: prompt.trim(),
                    options,
                  })
                }
              >
                {work.busy ? "CONSULTANDO…" : "COTIZAR GPU"}
              </button>
            )}
            {work.quote && (
              <GpuQuotePanel
                quote={work.quote}
                selectedId={work.selectedId}
                onSelect={work.setSelectedId}
                onCancel={work.clearQuote}
                onConfirm={() => void work.confirm()}
                confirming={work.busy}
              />
            )}
            {(!projectId || !threadId) && (
              <p>Abre un proyecto y un chat para guardar tu video.</p>
            )}
          </div>
        </div>
        {(work.error || localError) && (
          <div className="generar-status-card error" role="alert">
            {localError || work.error}
            <button
              type="button"
              className="generar-secondary-action glass-glow-button"
              disabled={work.busy}
              onClick={work.refresh}
            >
              CONSULTAR ESTADO
            </button>
          </div>
        )}
        {work.job && (
          <div
            className="generar-glass-panel gpu-video-result"
            aria-live="polite"
          >
            <strong>{stages[work.job.status] || work.job.status}</strong>
            {work.running && !result && (
              <>
                <p>
                  Puedes salir de esta pantalla y volver. El trabajo continúa;
                  el control de tiempo sigue activo.
                </p>
                <button
                  type="button"
                  className="generar-secondary-action glass-glow-button"
                  disabled={work.busy}
                  onClick={() => void work.cancel()}
                >
                  CANCELAR TRABAJO Y CERRAR GPU
                </button>
              </>
            )}
            {work.job.error && <p>{work.job.error}</p>}
            {resultUrl && result && (
              <>
                <video
                  src={resultUrl}
                  controls
                  playsInline
                  preload="metadata"
                />
                <div className="generar-action-row">
                  <a
                    className="generar-secondary-action glass-glow-button"
                    href={resultUrl}
                    target="_blank"
                    rel="noreferrer"
                    download
                  >
                    DESCARGAR / ABRIR
                  </a>
                  {onUseMedia && (
                    <button
                      type="button"
                      className="generar-primary-action glass-glow-button"
                      onClick={() =>
                        void Promise.resolve(onUseMedia(result)).catch((e) =>
                          setLocalError(e.message),
                        )
                      }
                    >
                      USAR EN EL EDITOR
                    </button>
                  )}
                </div>
                <small>
                  Guardado en tu Bóveda
                  {work.job.destroyedAt
                    ? " · GPU cerrada"
                    : " · comprobando cierre de GPU"}
                </small>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
