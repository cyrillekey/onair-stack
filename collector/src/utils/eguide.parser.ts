import { gunzipSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";
import { cleanDescription, isProfane } from "./media.filter.js";
import { stripQualityTags } from "./urlparser.js";

export interface ScheduleItem {
  startTime: Date;
  endTime: Date;
  title: string;
  /** Omitted when the source description is empty or contains profanity. */
  description?: string;
}

export interface Channel {
  name: string;
  id: string;
  logo: string | null;
  schedule: ScheduleItem[];
}

/* ------------------------------------------------------------------ */
/* Raw XMLTV shape (what fast-xml-parser produces with our options)    */
/* ------------------------------------------------------------------ */

/** Element text: a plain string, or an object when the tag has attributes (e.g. lang="en"). */
type RawText = string | { "#text"?: string; "@_lang"?: string };

interface RawIcon {
  "@_src"?: string;
}

interface RawChannel {
  "@_id"?: string;
  "display-name"?: RawText[];
  icon?: RawIcon[];
}

interface RawProgramme {
  "@_start"?: string;
  "@_stop"?: string;
  "@_channel"?: string;
  title?: RawText[];
  desc?: RawText[];
}

interface RawTv {
  channel?: RawChannel[];
  programme?: RawProgramme[];
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Text content of a node, whether it is a plain string or { "#text", "@_lang" }. */
function textOf(node: RawText | undefined): string {
  if (node === undefined) return "";
  if (typeof node === "string") return node.trim();
  return (node["#text"] ?? "").trim();
}

/** Strips a trailing two-letter country suffix: "5.uk" -> "5", "4Seven.uk" -> "4Seven". */
export function stripCountrySuffix(name: string): string {
  const stripped = name.replace(/\.[a-z]{2}$/i, "").trim();
  return stripped || name; // never return an empty name
}

/**
 * Parses an XMLTV timestamp: "YYYYMMDDHHMMSS [+-]HHMM".
 * Seconds / time zone are optional; missing zone is treated as UTC.
 */
export function parseXmltvDate(value: string | undefined): Date | null {
  if (value === undefined) return null;
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?\s*(Z|[+-]\d{4})?$/.exec(value.trim());
  if (!m) return null;

  const [, y, mo, d, h = "00", mi = "00", s = "00", tz = "+0000"] = m;
  const offset = tz === "Z" ? "+00:00" : `${tz.slice(0, 3)}:${tz.slice(3)}`;
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${offset}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/* ------------------------------------------------------------------ */
/* Parser                                                              */
/* ------------------------------------------------------------------ */

const ARRAY_TAGS = new Set(["channel", "programme", "display-name", "icon", "title", "desc"]);

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false, // keep ids like "123" as strings
  parseAttributeValue: false,
  trimValues: true,
  isArray: (tagName) => ARRAY_TAGS.has(tagName),
});

/**
 * Runs the XML parser and narrows its `any` result to the <tv> root.
 * `unknown` forces us to validate before use instead of trusting the input.
 */
function parseTv(xml: string): RawTv {
  const doc: unknown = xmlParser.parse(xml);
  if (!isRecord(doc) || !isRecord(doc.tv)) {
    throw new Error("Invalid XMLTV: missing <tv> root element");
  }
  return doc.tv;
}

/** Parse an XMLTV document (string) into channels with their schedules. */
export function parseEpg(xml: string): Channel[] {
  const tv = parseTv(xml);
  const channels = new Map<string, Channel>();

  for (const ch of tv.channel ?? []) {
    const id = ch["@_id"];
    if (!id) continue;
    const name = stripQualityTags(stripCountrySuffix(textOf(ch["display-name"]?.[0]) || id));
    if (isProfane(name)) continue;
    channels.set(id, {
      id,
      name,
      logo: ch.icon?.[0]?.["@_src"] ?? null,
      schedule: [],
    });
  }

  for (const p of tv.programme ?? []) {
    const channelId = p["@_channel"];
    const channel = channelId === undefined ? undefined : channels.get(channelId);
    if (!channel) continue;

    const startTime = parseXmltvDate(p["@_start"]);
    const endTime = parseXmltvDate(p["@_stop"]);
    if (!startTime || !endTime) continue;

    const title = textOf(p.title?.[0]);
    if (isProfane(title)) continue;

    channel.schedule.push({
      startTime,
      endTime,
      title,
      description: cleanDescription(textOf(p.desc?.[0])),
    });
  }

  const result = [...channels.values()];
  for (const ch of result) {
    ch.schedule.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }
  return result;
}

/** True when the buffer starts with the gzip magic bytes (1f 8b). */
export function isGzip(buf: Uint8Array): boolean {
  return buf[0] === 0x1f && buf[1] === 0x8b;
}

/** Parse raw feed bytes: plain XMLTV or gzip-compressed XMLTV (detected automatically). */
export function parseEpgBuffer(buf: Buffer): Channel[] {
  const xml = (isGzip(buf) ? gunzipSync(buf) : buf).toString("utf8");
  return parseEpg(xml);
}

/**
 * Download and parse an EPG feed. Works with both `.xml` and `.xml.gz` URLs;
 * gzip is detected from the content, not the URL, so servers that compress
 * on the fly (Content-Encoding: gzip, already decoded by fetch) work too.
 */
export async function fetchEpg(url: string): Promise<Channel[]> {
  const res = await fetch(url, { headers: { "User-Agent": "epg-parser/1.0" } });
  if (!res.ok) {
    throw new Error(`Failed to fetch EPG (${String(res.status)} ${res.statusText})`);
  }
  return parseEpgBuffer(Buffer.from(await res.arrayBuffer()));
}