import { describe, expect, it } from "vitest";
import { parseEpg } from "./eguide.parser.js";

function programme(options: {
  channel: string;
  start: string;
  end: string;
  title: string;
  description?: string;
}): string {
  return [
    `<programme start="${options.start} +0000" stop="${options.end} +0000" channel="${options.channel}">`,
    `<title>${options.title}</title>`,
    ...(options.description === undefined
      ? []
      : [`<desc>${options.description}</desc>`]),
    "</programme>",
  ].join("");
}

describe("parseEpg profanity filtering", () => {
  it("drops profane channels, programmes and descriptions", () => {
    const channels = parseEpg(
      [
        "<tv>",
        '<channel id="safe.uk"><display-name>BBC One.uk</display-name></channel>',
        '<channel id="bad.uk"><display-name>Fuck TV.uk</display-name></channel>',
        programme({
          channel: "safe.uk",
          start: "20260101120000",
          end: "20260101130000",
          title: "Evening News",
          description: "A calm roundup.",
        }),
        programme({
          channel: "safe.uk",
          start: "20260101130000",
          end: "20260101140000",
          title: "Fuck This Show",
          description: "Safe description.",
        }),
        programme({
          channel: "safe.uk",
          start: "20260101140000",
          end: "20260101150000",
          title: "Late Film",
          description: "Some fucking nonsense.",
        }),
        programme({
          channel: "bad.uk",
          start: "20260101150000",
          end: "20260101160000",
          title: "Hidden Programme",
        }),
        "</tv>",
      ].join(""),
    );

    expect(channels).toHaveLength(1);
    expect(channels[0].name).toBe("BBC One");
    expect(channels[0].schedule.map((item) => item.title)).toEqual([
      "Evening News",
      "Late Film",
    ]);
    expect(channels[0].schedule[0].description).toBe("A calm roundup.");
    expect(channels[0].schedule[1].description).toBeUndefined();
  });
});
