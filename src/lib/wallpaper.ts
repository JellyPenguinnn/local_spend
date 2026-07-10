import { createId, nowIso } from "./defaults";
import type { WallpaperImage } from "./types";

export const MAX_WALLPAPERS = 5;
export const MAX_WALLPAPER_SOURCE_BYTES = 8 * 1024 * 1024;
export const MAX_WALLPAPER_STORED_BYTES = 220 * 1024;
export const WALLPAPER_MAX_DIMENSION = 1280;
export const DEFAULT_WALLPAPER_OPACITY = 0.34;

const QUALITY_STEPS = [0.72, 0.62, 0.52, 0.42];

export function trimWallpapers(wallpapers: WallpaperImage[]): WallpaperImage[] {
  return wallpapers.slice(0, MAX_WALLPAPERS);
}

export function clampWallpaperOpacity(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_WALLPAPER_OPACITY;
  return Math.min(0.55, Math.max(0.12, value));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export async function createWallpaperFromFile(file: File): Promise<WallpaperImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file.");
  }
  if (file.size > MAX_WALLPAPER_SOURCE_BYTES) {
    throw new Error(`Choose an image under ${formatBytes(MAX_WALLPAPER_SOURCE_BYTES)}.`);
  }

  const sourceUrl = await readFileAsDataUrl(file);
  const image = await loadImage(sourceUrl);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) {
    throw new Error("This image could not be read.");
  }

  let maxDimension = WALLPAPER_MAX_DIMENSION;
  let output = await renderCompressed(image, sourceWidth, sourceHeight, maxDimension);
  if (output.blob.size > MAX_WALLPAPER_STORED_BYTES) {
    maxDimension = 960;
    output = await renderCompressed(image, sourceWidth, sourceHeight, maxDimension);
  }
  if (output.blob.size > MAX_WALLPAPER_STORED_BYTES) {
    throw new Error("This image is still too large after compression. Try a simpler image.");
  }

  return {
    id: createId("wallpaper"),
    name: cleanFileName(file.name),
    dataUrl: await readBlobAsDataUrl(output.blob),
    mimeType: output.blob.type || output.mimeType,
    sizeBytes: output.blob.size,
    createdAt: nowIso()
  };
}

async function renderCompressed(image: HTMLImageElement, sourceWidth: number, sourceHeight: number, maxDimension: number): Promise<{ blob: Blob; mimeType: string }> {
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Image compression is unavailable in this browser.");
  }
  context.drawImage(image, 0, 0, width, height);

  let fallback: Blob | null = null;
  for (const quality of QUALITY_STEPS) {
    const webp = await canvasToBlob(canvas, "image/webp", quality);
    if (webp?.type === "image/webp") {
      fallback = webp;
      if (webp.size <= MAX_WALLPAPER_STORED_BYTES) {
        return { blob: webp, mimeType: "image/webp" };
      }
    }
  }
  if (fallback) {
    return { blob: fallback, mimeType: "image/webp" };
  }
  const jpeg = await canvasToBlob(canvas, "image/jpeg", QUALITY_STEPS[QUALITY_STEPS.length - 1] ?? 0.42);
  if (!jpeg) {
    throw new Error("Image compression failed.");
  }
  return { blob: jpeg, mimeType: "image/jpeg" };
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not save that image."));
    reader.readAsDataURL(blob);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = document.createElement("img");
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load that image."));
    image.src = dataUrl;
  });
}

function cleanFileName(name: string): string {
  const cleaned = name.replace(/\.[a-z0-9]+$/i, "").trim();
  return cleaned.slice(0, 42) || "Wallpaper";
}
