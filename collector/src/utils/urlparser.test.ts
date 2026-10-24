import { describe, expect, it } from "vitest";
import { parseM3UContent } from "./urlparser.js";

function playlist(...entries: string[]): string {
  return ["#EXTM3U", ...entries].join("\n");
}

describe("parseM3UContent profanity filtering", () => {
  it("keeps safe streams and drops profane names", () => {
    const streams = parseM3UContent(
      playlist(
        '#EXTINF:-1 tvg-id="bbc1" group-title="News",BBC One HD',
        "https://example.com/bbc.m3u8",
        '#EXTINF:-1 tvg-id="bad" group-title="News",Fuck TV',
        "https://example.com/bad.m3u8",
        '#EXTINF:-1 tvg-id="safe" group-title="News",Safe Channel',
        "https://example.com/safe.m3u8",
      ),
    );

    expect(streams.map((stream) => stream.name)).toEqual([
      "BBC One",
      "Safe Channel",
    ]);
  });

  it("drops streams whose group title is profane", () => {
    const streams = parseM3UContent(
      playlist(
        '#EXTINF:-1 group-title="Fuck",Family Channel',
        "https://example.com/family.m3u8",
      ),
    );

    expect(streams).toEqual([]);
  });
});
