import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyM3U8 } from "./url.js";

const MASTER_URL = "https://cdn.example.com/master.m3u8";

type FetchHandler = () => Response;

function mediaPlaylist(segments: string[]): string {
  return [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-TARGETDURATION:6",
    "#EXT-X-MEDIA-SEQUENCE:0",
    ...segments.flatMap((segment) => ["#EXTINF:6.0,", segment]),
    "#EXT-X-ENDLIST",
  ].join("\n");
}

function playlistResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/vnd.apple.mpegurl" },
  });
}

function segmentResponse(): Response {
  return new Response(new Uint8Array([0x47, 0x40, 0x00, 0x10]), {
    status: 200,
    headers: { "content-type": "video/mp2t" },
  });
}

function installFetch(routes: Record<string, FetchHandler>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const handler = routes[url];
      if (!handler) return Promise.resolve(new Response("not found", { status: 404, statusText: "Not Found" }));
      return Promise.resolve(handler());
    }),
  );
}

describe("verifyM3U8 master playlist parsing", () => {
  beforeEach(() => {
    // Skip DNS resolution in the SSRF guard; these tests never touch the network.
    process.env.VERIFIER_ALLOW_PRIVATE_IPS = "1";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.VERIFIER_ALLOW_PRIVATE_IPS;
  });

  it("tolerates a STREAM-INF entry with no following URI when another variant is playable", async () => {
    installFetch({
      [MASTER_URL]: () =>
        playlistResponse(
          [
            "#EXTM3U",
            "#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080",
            "#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=1280x720",
            "low/index.m3u8",
          ].join("\n"),
        ),
      "https://cdn.example.com/low/index.m3u8": () => playlistResponse(mediaPlaylist(["seg0.ts"])),
      "https://cdn.example.com/low/seg0.ts": segmentResponse,
    });

    const result = await verifyM3U8(MASTER_URL);

    expect(result.isValid).toBe(true);
    expect(result.playabilityStatus).toBe("confirmed");
    expect(result.isPlayable).toBe(true);
    expect(result.deepCheckPassed).toBe(true);
    expect(result.variantCount).toBe(1);
    expect(result.resolution).toBe("hd");
    expect(result.error).toBeUndefined();
  });

  it("tolerates a variant with an unusable URI when another variant is playable", async () => {
    installFetch({
      [MASTER_URL]: () =>
        playlistResponse(
          [
            "#EXTM3U",
            "#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=3840x2160",
            "file:///local/high.m3u8",
            "#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=1280x720",
            "low/index.m3u8",
          ].join("\n"),
        ),
      "https://cdn.example.com/low/index.m3u8": () => playlistResponse(mediaPlaylist(["seg0.ts"])),
      "https://cdn.example.com/low/seg0.ts": segmentResponse,
    });

    const result = await verifyM3U8(MASTER_URL);

    expect(result.isValid).toBe(true);
    expect(result.playabilityStatus).toBe("confirmed");
    expect(result.variantCount).toBe(1);
    // The skipped 4K entry must not influence the reported resolution.
    expect(result.resolution).toBe("hd");
  });

  it("still rejects a master playlist when every variant entry is malformed", async () => {
    installFetch({
      [MASTER_URL]: () =>
        playlistResponse(["#EXTM3U", "#EXT-X-STREAM-INF:BANDWIDTH=5000000"].join("\n")),
    });

    const result = await verifyM3U8(MASTER_URL);

    expect(result.isValid).toBe(false);
    expect(result.isPlayable).toBe(false);
    expect(result.playabilityStatus).toBe("unplayable");
    expect(result.error).toContain("EXT-X-STREAM-INF tag without a following URI");
  });

  it("keeps the tolerant parse behavior when deep checking is disabled", async () => {
    installFetch({
      [MASTER_URL]: () =>
        playlistResponse(
          [
            "#EXTM3U",
            "#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080",
            "#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=1280x720",
            "low/index.m3u8",
          ].join("\n"),
        ),
    });

    const result = await verifyM3U8(MASTER_URL, { deepCheck: false });

    expect(result.isValid).toBe(true);
    expect(result.isPlayable).toBe(true);
    expect(result.playabilityStatus).toBe("unverified");
    expect(result.variantCount).toBe(1);
    expect(result.variants).toBeUndefined();
  });

  it("still skips a dead variant and confirms the next one", async () => {
    installFetch({
      [MASTER_URL]: () =>
        playlistResponse(
          [
            "#EXTM3U",
            "#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080",
            "high/index.m3u8",
            "#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=1280x720",
            "low/index.m3u8",
          ].join("\n"),
        ),
      "https://cdn.example.com/low/index.m3u8": () => playlistResponse(mediaPlaylist(["seg0.ts"])),
      "https://cdn.example.com/low/seg0.ts": segmentResponse,
    });

    const result = await verifyM3U8(MASTER_URL);

    expect(result.playabilityStatus).toBe("confirmed");
    expect(result.deepCheckPassed).toBe(true);
  });
});
