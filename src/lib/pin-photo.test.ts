import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const upload = vi.fn();
vi.mock("@/lib/supabase/browser", () => ({
  getBrowserClient: () => ({ storage: { from: () => ({ upload }) } }),
}));
vi.mock("@/lib/auth/anonymous-session", () => ({ ensureAnonymousSession: async () => "u1" }));

import { fitWithin, shrinkPhoto, uploadPinPhoto } from "./pin-photo";

const KB = 1024;
const blobOf = (bytes: number) => new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });

/** A canvas whose JPEG size depends on the quality asked for. */
function stubCanvas(sizeAt: (quality: number) => number) {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb, _type, quality) {
    cb(blobOf(sizeAt(quality as number)));
  });
}

beforeEach(() => {
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 4000, height: 3000, close: vi.fn() })));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  upload.mockReset();
});

describe("pin photos", () => {
  it("fits a photo within 1280 pixels, keeping its shape", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1280, height: 960 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 960, height: 1280 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("lowers the quality until the photo is at most 500 KB, and gives up past that", async () => {
    stubCanvas((q) => (q >= 0.8 ? 900 * KB : q >= 0.6 ? 600 * KB : 300 * KB));
    expect((await shrinkPhoto(blobOf(5000 * KB))).size).toBe(300 * KB);

    stubCanvas(() => 700 * KB);
    await expect(shrinkPhoto(blobOf(5000 * KB))).rejects.toThrow("photo-too-large");
  });

  it("says a photo it can't decode is unreadable", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => Promise.reject(new Error("bad"))));
    await expect(shrinkPhoto(blobOf(10))).rejects.toThrow("photo-unreadable");
  });

  it("uploads into the resident's own folder", async () => {
    upload.mockResolvedValue({ error: null });
    const result = await uploadPinPhoto(blobOf(10));
    expect(result).toEqual({ path: expect.stringMatching(/^u1\/[0-9a-f-]{36}\.jpg$/) });
    const path = (result as { path: string }).path;
    expect(upload).toHaveBeenCalledWith(path, expect.any(Blob), { contentType: "image/jpeg", upsert: false });
  });

  it("gives no path when the upload fails", async () => {
    upload.mockResolvedValue({ error: { message: "too big" } });
    expect(await uploadPinPhoto(blobOf(10))).toEqual({ failed: "error" });
  });

  it("says the day's photos are used up when the storage policy refuses the upload", async () => {
    // Storage has answered a policy refusal both ways: statusCode "403" inside a 400, and a plain 403.
    upload.mockResolvedValue({ error: { statusCode: "403", status: 400, message: "new row violates row-level security policy" } });
    expect(await uploadPinPhoto(blobOf(10))).toEqual({ failed: "limit" });
    upload.mockResolvedValue({ error: { status: 403, message: "new row violates row-level security policy" } });
    expect(await uploadPinPhoto(blobOf(10))).toEqual({ failed: "limit" });
  });

  it("stops waiting for an upload that stalls, so the pin need not wait for its photo", async () => {
    vi.useFakeTimers();
    try {
      upload.mockReturnValue(new Promise(() => {}));
      const result = uploadPinPhoto(blobOf(10));
      await vi.advanceTimersByTimeAsync(20_000);
      expect(await result).toEqual({ failed: "error" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves no timer running once an upload has finished", async () => {
    vi.useFakeTimers();
    try {
      upload.mockResolvedValue({ error: null });
      await uploadPinPhoto(blobOf(10));
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
