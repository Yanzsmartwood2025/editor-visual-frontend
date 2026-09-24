import { useCallback, useEffect, useRef, useState } from "react";
import { firebaseHeaders } from "../../../../lib/apiClient";
import type { GenerarMediaItem, GenerarModuleContext } from "../../types";
import type { GpuVideoOptions } from "../../../../lib/gpu/videoContract";
import type { GenerarGpuQuote } from "../GpuQuotePanel";
export type VideoJob = {
  id: string;
  status: string;
  error?: string;
  outputUrl?: string;
  galleryItem?: GenerarMediaItem;
  gpuName?: string;
  runtimeCostEstimate?: number;
  destroyedAt?: string;
  createdAt?: string;
  startedAt?: string;
  videoSession?: {
    phase: string;
    idleUntil?: string;
    hardDeadline: string;
    clips: number;
    clipStartedAt: string;
    canContinue: boolean;
  } | null;
};
export type VideoDraft = {
  mediaId: string;
  prompt: string;
  options: GpuVideoOptions;
};
const terminal = new Set(["completed", "failed", "expired"]);
export default function useGpuVideo(context: GenerarModuleContext) {
  const { session, projectId, threadId } = context;
  const [quote, setQuote] = useState<GenerarGpuQuote | null>(null);
  const [draft, setDraft] = useState<VideoDraft | null>(null);
  const [job, setJob] = useState<VideoJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(true);
  const [recoveryFailed, setRecoveryFailed] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const lock = useRef(false);
  const mutationEpoch = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const request = useCallback(
    async (
      path: string,
      method = "GET",
      body?: unknown,
      signal?: AbortSignal,
    ) => {
      if (!session) throw new Error("Inicia sesión.");
      const response = await fetch("/api/generar/gpu-video" + path, {
        method,
        headers: firebaseHeaders(session, {
          "Content-Type": "application/json",
        }),
        cache: "no-store",
        body: body ? JSON.stringify(body) : undefined,
        signal,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "La operación no pudo completarse.");
      return result;
    },
    [session],
  );
  const refresh = useCallback(async () => {
    if (!projectId || !threadId) return;
    const result = await request(
      `?projectId=${projectId}&threadId=${threadId}`,
    );
    setJob(result.job);
    setError("");
    setRecoveryFailed(false);
  }, [request, projectId, threadId]);
  useEffect(() => {
    const active = new AbortController();
    controller.current = active;
    setRecovering(true);
    setRecoveryFailed(false);
    if (session && projectId && threadId) {
      request(
        `?projectId=${projectId}&threadId=${threadId}`,
        "GET",
        undefined,
        active.signal,
      )
        .then((result) => {
          if (!active.signal.aborted) setJob(result.job);
        })
        .catch((e) => {
          if (!active.signal.aborted) {
            setError(e.message);
            setRecoveryFailed(true);
          }
        })
        .finally(() => {
          if (!active.signal.aborted) setRecovering(false);
        });
    } else {
      setRecovering(false);
    }
    return () => active.abort();
  }, [request, session, projectId, threadId]);
  useEffect(() => {
    if (!job || terminal.has(job.status)) return;
    const active = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const epoch = mutationEpoch.current;
      try {
        const result = await request(
          "?id=" + job.id,
          "GET",
          undefined,
          active.signal,
        );
        if (
          !active.signal.aborted &&
          epoch === mutationEpoch.current &&
          !lock.current
        ) {
          setJob(result.job);
          setError("");
        }
      } catch (e: any) {
        if (!active.signal.aborted)
          setError(
            "No se pudo consultar. El trabajo continúa en la GPU; vuelve a consultar antes de iniciar otro.",
          );
      }
      if (!active.signal.aborted) timer = setTimeout(poll, 5000);
    };
    timer = setTimeout(poll, 2000);
    return () => {
      active.abort();
      clearTimeout(timer);
    };
  }, [job?.id, job?.status, request]);
  const run = async (operation: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    mutationEpoch.current++;
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (e: any) {
      if (!controller.current?.signal.aborted) setError(e.message);
    } finally {
      mutationEpoch.current++;
      lock.current = false;
      if (!controller.current?.signal.aborted) setBusy(false);
    }
  };
  const prepare = (input: VideoDraft) =>
    run(async () => {
      if (recovering || recoveryFailed || (job && !terminal.has(job.status)))
        throw new Error("Consulta el trabajo anterior antes de cotizar.");
      const result = await request(
        "",
        "POST",
        { ...input, projectId, threadId, operation: "quote" },
        controller.current?.signal,
      );
      setDraft(input);
      setQuote(result.quote);
      setSelectedId(result.quote.selectedSelectionId || "");
    });
  const confirm = () =>
    run(async () => {
      if (
        !draft ||
        !selectedId ||
        recovering ||
        recoveryFailed ||
        (job && !terminal.has(job.status))
      )
        return;
      const body = {
        ...draft,
        projectId,
        threadId,
        computeSelectionId: selectedId,
      };
      const verified = await request(
        "",
        "POST",
        { ...body, operation: "quote" },
        controller.current?.signal,
      );
      setQuote(verified.quote);
      if (!verified.quote.available)
        throw new Error(
          verified.quote.reason || "La GPU cambió. Vuelve a cotizar.",
        );
      const result = await request(
        "",
        "POST",
        { ...body, operation: "start" },
        controller.current?.signal,
      );
      setJob(result.job);
      setQuote(null);
      setDraft(null);
    });
  const continueWork = (input: VideoDraft) =>
    run(async () => {
      if (!job?.videoSession?.canContinue || job.destroyedAt)
        throw new Error("La sesión ya no está disponible.");
      const result = await request(
        "",
        "POST",
        { ...input, projectId, threadId, operation: "continue", jobId: job.id },
        controller.current?.signal,
      );
      setJob(result.job);
    });
  const cancel = () =>
    run(async () => {
      if (!job) return;
      const result = await request(
        "?id=" + job.id,
        "DELETE",
        undefined,
        controller.current?.signal,
      );
      setJob(result.job);
    });
  return {
    quote,
    job,
    busy: busy || recovering,
    recoveryFailed,
    error,
    selectedId,
    setSelectedId,
    prepare,
    confirm,
    continueWork,
    idle:
      job?.videoSession?.phase === "idle" &&
      !job.destroyedAt &&
      !terminal.has(job.status),
    cancel,
    refresh: () => run(refresh),
    clearQuote: () => {
      setQuote(null);
      setDraft(null);
    },
    running:
      !!job && !terminal.has(job.status) && job.videoSession?.phase !== "idle",
    draft,
  };
}
