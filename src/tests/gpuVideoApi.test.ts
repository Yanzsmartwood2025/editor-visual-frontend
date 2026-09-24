import { beforeEach, expect, it, vi } from "vitest";
import handler from "../pages/api/generar/gpu-video";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  scope: vi.fn(),
  media: vi.fn(),
  quote: vi.fn(),
  start: vi.fn(),
  saved: vi.fn(),
  status: vi.fn(),
  update: vi.fn(),
  cleanup: vi.fn(),
  admin: vi.fn(),
}));
vi.mock("../lib/firebaseAdmin", () => ({ requireFirebaseUser: mocks.auth }));
vi.mock("../lib/workspaceStore", () => ({
  resolveOwnedWorkspaceScope: mocks.scope,
  getOwnedMediaForUser: mocks.media,
}));
vi.mock("../lib/r2", () => ({
  createR2PresignedGetUrl: () => ({ url: "https://r2.example/fresh.png" }),
}));
vi.mock("../lib/gpu/quote", () => ({ quoteComputeGpuJob: mocks.quote }));
vi.mock("../lib/gpu/orchestrator", () => ({
  startComputeGpuJob: mocks.start,
  getGpuJobStatusForUser: mocks.status,
  cleanupExpiredComputeJobs: mocks.cleanup,
}));
vi.mock("../lib/gpu/jobStore", () => ({
  getGpuJobForUser: mocks.saved,
  updateGpuJobIfStatus: mocks.update,
  getGpuSupabaseAdmin: mocks.admin,
}));
const projectId = "11111111-1111-4111-8111-111111111111",
  threadId = "22222222-2222-4222-8222-222222222222",
  mediaId = "33333333-3333-4333-8333-333333333333";
const body = {
  projectId,
  threadId,
  mediaId,
  prompt: "Slow camera movement",
  options: {},
  operation: "quote",
};
async function invoke(
  value = body,
  method = "POST",
  query: Record<string, string> = { id: mediaId },
) {
  let code = 0,
    data: any;
  const res: any = {
    setHeader() {},
    status(v: number) {
      code = v;
      return res;
    },
    json(v: any) {
      data = v;
      return res;
    },
  };
  await handler(
    {
      method,
      body: value,
      query,
      headers: { host: "editor.example", "x-forwarded-proto": "https" },
    } as any,
    res,
  );
  return { code, data };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ uid: "owner" });
  mocks.scope.mockResolvedValue({ projectId, threadId });
  mocks.media.mockResolvedValue([{ tipo: "foto", r2_key: "owned-photo" }]);
  mocks.quote.mockResolvedValue({ available: true });
  mocks.start.mockResolvedValue({ id: mediaId, status: "booting" });
});
it("quotes with a renewed owned image without renting", async () => {
  expect((await invoke()).code).toBe(200);
  expect(mocks.media).toHaveBeenCalledWith({
    userId: "owner",
    projectId,
    mediaIds: [mediaId],
  });
  expect(mocks.quote.mock.calls[0][0].inputUrls).toEqual([
    "https://r2.example/fresh.png",
  ]);
  expect(mocks.start).not.toHaveBeenCalled();
});
it("starts only the validated saved-project input and explicit offer", async () => {
  expect(
    (
      await invoke({
        ...body,
        operation: "start",
        computeSelectionId: "a".repeat(43),
      } as any)
    ).code,
  ).toBe(202);
  expect(mocks.start.mock.calls[0][0]).toMatchObject({
    userId: "owner",
    projectId,
    threadId,
    input: {
      recipe: "wan22-image-to-video",
      options: { duration: 3 },
      inputUrls: ["https://r2.example/fresh.png"],
    },
  });
});
it("never rents for missing or foreign photo", async () => {
  mocks.media.mockResolvedValue([]);
  expect((await invoke()).code).toBe(404);
  expect(mocks.start).not.toHaveBeenCalled();
  expect(mocks.quote).not.toHaveBeenCalled();
});
it("rejects unsupported options before even reading media", async () => {
  expect((await invoke({ ...body, options: { duration: 90 } })).code).toBe(400);
  expect(mocks.media).not.toHaveBeenCalled();
});
it("rejects anonymous requests", async () => {
  mocks.auth.mockRejectedValue(new Error());
  expect((await invoke()).code).toBe(401);
  expect(mocks.scope).not.toHaveBeenCalled();
});
it("does not expose another owner or a different recipe during recovery", async () => {
  mocks.saved.mockResolvedValue({
    metadata: { request: { recipe: "ace-step-music" } },
  });
  expect((await invoke(body, "GET")).code).toBe(404);
  expect(mocks.status).not.toHaveBeenCalled();
});
it("cancels an owned running video through the cleanup mechanism", async () => {
  mocks.saved.mockResolvedValue({
    id: mediaId,
    instance_id: 123,
    status: "processing",
    metadata: { request: { recipe: "wan22-image-to-video" } },
  });
  expect((await invoke(body, "DELETE")).code).toBe(200);
  expect(mocks.update.mock.calls[0][2]).toMatchObject({
    status: "cleanup_pending",
    metadata: { cancelRequested: true, terminalStatus: "failed" },
  });
  expect(mocks.cleanup).toHaveBeenCalledOnce();
});

it("recovers only the latest video from the owned project and thread", async () => {
  const chain: any = {};
  for (const name of ["select", "eq", "contains", "order"])
    chain[name] = vi.fn(() => chain);
  chain.limit = vi
    .fn()
    .mockResolvedValue({ data: [{ id: mediaId }], error: null });
  mocks.admin.mockReturnValue({ from: vi.fn(() => chain) });
  mocks.saved.mockResolvedValue({
    metadata: { request: { recipe: "wan22-image-to-video" } },
  });
  expect((await invoke(body, "GET", { projectId, threadId })).code).toBe(200);
  expect(chain.eq.mock.calls).toEqual([
    ["user_id", "owner"],
    ["project_id", projectId],
    ["thread_id", threadId],
  ]);
  expect(chain.contains).toHaveBeenCalledWith("metadata", {
    request: { recipe: "wan22-image-to-video" },
  });
  expect(mocks.saved).toHaveBeenCalledWith(mediaId, "owner");
});
it("preserves an output already saved while the GPU is closing", async () => {
  mocks.saved.mockResolvedValue({
    id: mediaId,
    instance_id: 123,
    gallery_item_id: "saved",
    status: "cleanup_pending",
    metadata: { request: { recipe: "wan22-image-to-video" } },
  });
  expect((await invoke(body, "DELETE")).code).toBe(200);
  expect(mocks.update).not.toHaveBeenCalled();
});
