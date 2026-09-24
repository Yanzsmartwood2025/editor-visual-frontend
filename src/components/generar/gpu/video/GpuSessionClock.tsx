import { useEffect, useState } from "react";
import type { VideoJob } from "./useGpuVideo";
export const clockText = (milliseconds: number) => {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
};
export default function GpuSessionClock({ job }: { job: VideoJob }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (job.destroyedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [job.destroyedAt]);
  const start = Date.parse(job.startedAt || job.createdAt || "");
  const end = job.destroyedAt ? Date.parse(job.destroyedAt) : now;
  const idle = job.videoSession?.phase === "idle" && !job.destroyedAt;
  const closing = job.status === "cleanup_pending";
  return (
    <div className="gpu-video-clock" aria-label="Tiempo de la sesión GPU">
      <span>
        {job.destroyedAt
          ? "GPU CERRADA"
          : closing
            ? "CERRANDO GPU"
            : idle
              ? "GPU EN ESPERA · ALQUILER ACTIVO"
              : "GPU TRABAJANDO"}
      </span>
      <strong>
        {Number.isFinite(start) ? clockText(end - start) : "00:00"}
      </strong>
      <small>
        Tiempo desde la asignación
        {job.videoSession
          ? ` · ${job.videoSession.clips} video(s) guardado(s)`
          : ""}
      </small>
      {idle && (
        <small>
          Cierre automático en{" "}
          {clockText(Date.parse(job.videoSession!.idleUntil || "") - now)} si no
          envías otro trabajo.
        </small>
      )}
      {!job.destroyedAt && job.videoSession?.hardDeadline && (
        <small>
          Límite restante de esta sesión:{" "}
          {clockText(Date.parse(job.videoSession.hardDeadline) - now)}
        </small>
      )}
    </div>
  );
}
