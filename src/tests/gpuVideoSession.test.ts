import { beforeEach, expect, it, vi } from "vitest";
import {
  canContinueVideo,
  continueVideoSession,
  newVideoSession,
  requestVideoSessionClose,
} from "../lib/gpu/videoSession";
const mock = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock("../lib/gpu/jobStore", () => ({ getGpuSupabaseAdmin: mock.admin }));
vi.mock("../lib/r2", () => ({
  createR2StorageUrl: (key: string) => `https://storage.example/${key}`,
}));
const makeJob = () =>
  ({
    id: "job",
    user_id: "owner",
    project_id: "project",
    thread_id: "chat",
    status: "processing",
    instance_id: 123,
    destroyed_at: null,
    gallery_item_id: "output",
    lease_expires_at: new Date(Date.now() + 120000).toISOString(),
    metadata: {
      request: { recipe: "wan22-image-to-video" },
      videoSession: {
        ...newVideoSession(new Date(Date.now() + 1200000).toISOString()),
        phase: "idle",
        idleUntil: new Date(Date.now() + 120000).toISOString(),
        clips: 1,
      },
    },
  }) as any;
let chain: any;
beforeEach(() => {
  chain = {};
  for (const key of ["update", "eq", "select"]) chain[key] = vi.fn(() => chain);
  chain.maybeSingle = vi
    .fn()
    .mockResolvedValue({ data: { id: "job" }, error: null });
  mock.admin.mockReturnValue({ from: vi.fn(() => chain) });
});
it("continues only while idle, alive and inside both time limits", () => {
  const job = makeJob();
  expect(canContinueVideo(job)).toBe(true);
  for (const value of [
    { ...job, destroyed_at: new Date().toISOString() },
    { ...job, status: "cleanup_pending" },
    { ...job, instance_id: null },
  ])
    expect(canContinueVideo(value)).toBe(false);
  expect(canContinueVideo(job, Date.now() + 121000)).toBe(false);
  job.metadata.videoSession.hardDeadline = new Date(
    Date.now() + 240000,
  ).toISOString();
  expect(canContinueVideo(job)).toBe(false);
});
it("reuses the same instance and hard deadline with a new output and generation", async () => {
  const job = makeJob();
  const id = job.metadata.videoSession.generationId;
  await continueVideoSession(job, {
    prompt: "Move gently",
    inputUrls: ["https://photo.example/a.png"],
    options: {},
  });
  const patch = chain.update.mock.calls[0][0];
  expect(patch.lease_expires_at).toBe(job.metadata.videoSession.hardDeadline);
  expect(patch.metadata.videoSession.generationId).not.toBe(id);
  expect(patch.metadata.videoSession.phase).toBe("queued");
  expect(patch.gallery_item_id).toBeNull();
  expect(patch.instance_id).toBeUndefined();
  expect(patch.metadata.outputKey).toContain("gpu/video/job-");
});
it("compares generation and phase to reject a racing second submission", async () => {
  const job = makeJob();
  chain.maybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(
    continueVideoSession(job, {
      prompt: "Move gently",
      inputUrls: ["https://photo.example/a.png"],
      options: {},
    }),
  ).rejects.toThrow("sesión cambió");
  expect(chain.eq).toHaveBeenCalledWith(
    "metadata->videoSession->>generationId",
    job.metadata.videoSession.generationId,
  );
  expect(chain.eq).toHaveBeenCalledWith(
    "metadata->videoSession->>phase",
    "idle",
  );
});
it("closes an idle session preserving its successful output", async () => {
  await requestVideoSessionClose(makeJob());
  expect(chain.update.mock.calls[0][0]).toMatchObject({
    status: "cleanup_pending",
    metadata: {
      terminalStatus: "completed",
      cancelRequested: true,
      videoSession: { phase: "closing" },
    },
  });
  expect(chain.update.mock.calls[0][0].gallery_item_id).toBeUndefined();
});
it("cancels a generating session as failed and leaves old saved clips alone", async () => {
  const job = makeJob();
  job.metadata.videoSession.phase = "generating";
  await requestVideoSessionClose(job);
  expect(chain.update.mock.calls[0][0].metadata.terminalStatus).toBe("failed");
});
