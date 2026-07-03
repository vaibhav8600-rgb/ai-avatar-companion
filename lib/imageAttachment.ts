"use client";

import { makeThumbnail } from "./visionClient";

/**
 * Turn a picked image File into a downscaled data-URL attachment, entirely on
 * the device. Non-image files return null. Downscaling (default ≤1024px) keeps
 * the payload small for the vision route and localStorage history.
 *
 * Shared by the WhatsApp-style chat composer and the voice-screen text box.
 */
export async function fileToAttachment(
  file: File | undefined,
  maxWidth = 1024,
  quality = 0.8,
): Promise<string | null> {
  if (!file || !file.type.startsWith("image/")) return null;
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return makeThumbnail(dataUrl, maxWidth, quality);
}
