"use client";

import { getBrowserClient } from "@/lib/supabase/browser";
import { ensureAnonymousSession } from "@/lib/auth/anonymous-session";

/** Set once a phone has seen the notice before its first pin photo. */
export const PIN_PHOTO_NOTICE_KEY = "weatherwell.pinPhotoNoticeSeen";

const MAX_SIDE = 1280;
/** The bucket refuses more than 512,000 bytes; stay under it. */
const MAX_BYTES = 500 * 1024;
const QUALITIES = [0.8, 0.6, 0.4];

/** The size to draw a photo at: its shape kept, the longer side at most `max`. */
export function fitWithin(width: number, height: number, max = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Shrinks a photo on the phone before it is sent: at most 1280 pixels on the
 * longer side, JPEG, at most 500 KB. Redrawing it drops the metadata a camera
 * writes into a photo, including where it was taken.
 */
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("photo-unreadable");
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("photo-unreadable");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  for (const quality of QUALITIES) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= MAX_BYTES) return blob;
  }
  throw new Error("photo-too-large");
}

/**
 * How long a photo may take before the pin goes without it. A phone can report
 * a connection while the network is too congested to carry a photo (a typhoon,
 * a crowded cell), and the pin must not wait on it.
 */
const UPLOAD_TIMEOUT_MS = 20_000;

/** What an upload came to: the stored path, or why not ("limit": the day's 10 photos are used). */
export type PhotoUpload = { path: string } | { failed: "limit" | "error" };

const FAILED: PhotoUpload = { failed: "error" };

async function upload(photo: Blob): Promise<PhotoUpload> {
  try {
    const userId = await ensureAnonymousSession();
    if (!userId) return FAILED;
    const path = `${userId}/${crypto.randomUUID()}.jpg`;
    const { error } = await getBrowserClient()
      .storage.from("pin-photos")
      .upload(path, photo, { contentType: "image/jpeg", upsert: false });
    if (!error) return { path };
    // The upload policy refuses an 11th photo in a day (pin_photos_insert_own). Storage has
    // answered a policy refusal as statusCode "403" inside a 400, and as a plain 403.
    const { status, statusCode } = error as { status?: number; statusCode?: string };
    return status === 403 || statusCode === "403" ? { failed: "limit" } : FAILED;
  } catch {
    return FAILED;
  }
}

/**
 * Uploads a shrunk photo into this account's own folder of the private
 * pin-photos bucket (only officials can read it). The path, or why not: the
 * day's limit, or any other failure or a stall. The pin can then go without it. An upload that finishes
 * after the wait leaves a file no pin points to, which the daily cleanup deletes.
 */
export async function uploadPinPhoto(photo: Blob): Promise<PhotoUpload> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stalled = new Promise<PhotoUpload>((resolve) => {
    timer = setTimeout(() => resolve(FAILED), UPLOAD_TIMEOUT_MS);
  });
  try {
    return await Promise.race([upload(photo), stalled]);
  } finally {
    clearTimeout(timer);
  }
}
