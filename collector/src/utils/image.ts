import {
  v2 as cloudinary,
  type UploadApiOptions,
  type UploadApiResponse,
} from "cloudinary";

import { Readable } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";

/* --------------------------------- types --------------------------------- */

/**
 * Fetches an image from a URL and streams it directly to Cloudinary.
 * Nothing is written to disk and the image is never fully buffered in memory.
 */

export async function uploadImageFromUrl(
  url: string,
  options: UploadApiOptions = {},
): Promise<UploadApiResponse> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });

  if (!response.ok || !response.body) {
    throw new Error(
      `Failed to fetch image: ${response.status} ${response.statusText}`,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error(
      `URL did not return an image (content-type: ${contentType || "unknown"})`,
    );
  }

  // Convert the web ReadableStream from fetch into a Node.js Readable
  const source = Readable.fromWeb(
    response.body as unknown as NodeWebReadableStream,
  );

  return new Promise<UploadApiResponse>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { resource_type: "image", ...options },
      (error, result) => {
        if (error || !result) {
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          return reject(error ?? new Error("Cloudinary upload failed"));
        }
        resolve(result);
      },
    );

    source.on("error", (err) => {
      uploadStream.destroy(err);
      reject(err);
    });

    source.pipe(uploadStream);
  });
}
