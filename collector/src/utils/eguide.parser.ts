import { XMLParser, XMLValidator } from "fast-xml-parser";

export interface EpgProgramme {
  name: string;
  start: Date;
  stop: Date;
  date?: string;
  desc?: string;
  channel?: string;
}

export interface EpgParserOptions {
  /** Maximum XML response size in characters. Default: 20 MB. */
  maxSize?: number;

  /** Reject programmes without a valid XMLTV start/stop timestamp. */
  validateTimestamps?: boolean;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  cdataPropName: "#cdata",
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  processEntities: true,

  // Always return an array for programme elements.
  isArray: (name) => name === "programme",
});

const TIMESTAMP_REGEX = /^\d{14}(?:\s*[+-]\d{4})?$/;

function getText(value: unknown): string | undefined {
  if (value == null) return undefined;

  if (typeof value === "string" || typeof value === "number") {
    const text = String(value).trim();
    return text || undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const text = getText(item);
      if (text) return text;
    }
    return undefined;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;

    // Prefer normal text, falling back to CDATA.
    return getText(obj["#text"]) ?? getText(obj["#cdata"]);
  }

  return undefined;
}

function getFirst(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function getField(
  programme: Record<string, unknown>,
  field: string,
): string | undefined {
  return getText(getFirst(programme[field]));
}

function getAttribute(
  programme: Record<string, unknown>,
  name: string,
): string | undefined {
  const value = programme[`@_${name}`];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function parseEpg(
  xml: string,
  options: EpgParserOptions = {},
): EpgProgramme[] {
  const { maxSize = 20 * 1024 * 1024, validateTimestamps = true } = options;

  if (!xml.trim()) {
    throw new Error("EPG XML response is empty");
  }

  if (xml.length > maxSize) {
    throw new Error(`EPG XML exceeds maximum size of ${maxSize} characters`);
  }

  // This parser does not need DTDs or custom entity declarations.
  // Reject them rather than accepting unnecessary XML features.
  if (/<!DOCTYPE\b|<!ENTITY\b/i.test(xml)) {
    throw new Error("EPG XML must not contain DTD/entity declarations");
  }

  const validation = XMLValidator.validate(xml);

  if (validation !== true) {
    throw new Error(
      `Invalid EPG XML: ${validation.err.msg} ` +
        `(line ${validation.err.line}, column ${validation.err.col})`,
    );
  }

  let document: Record<string, unknown>;

  try {
    document = parser.parse(xml) as Record<string, unknown>;
  } catch (error) {
    throw new Error("Failed to parse EPG XML", { cause: error });
  }

  const tv = document.tv;

  if (!tv || typeof tv !== "object" || Array.isArray(tv)) {
    throw new Error("Invalid EPG document: expected <tv> root element");
  }

  const programmes = (tv as Record<string, unknown>).programme;

  if (programmes == null) return [];

  if (!Array.isArray(programmes)) {
    throw new Error("Invalid EPG document: programme collection is invalid");
  }

  const result: EpgProgramme[] = [];

  for (const entry of programmes) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }

    const programme = entry as Record<string, unknown>;

    const name = getField(programme, "title");
    const start = getAttribute(programme, "start");
    const stop = getAttribute(programme, "stop");

    // Ignore incomplete programme records.
    if (!name || !start || !stop) continue;

    if (
      validateTimestamps &&
      (!TIMESTAMP_REGEX.test(start) || !TIMESTAMP_REGEX.test(stop))
    ) {
      continue;
    }

    const item: EpgProgramme = {
      name,
      start: parseXmltvDate(start),
      stop: parseXmltvDate(stop),
    };

    const channel = getAttribute(programme, "channel");
    const date = getField(programme, "date");
    const desc = getField(programme, "desc");

    if (channel) item.channel = channel;
    if (date) item.date = date;
    if (desc) item.desc = desc;

    result.push(item);
  }

  return result;
}

export function parseXmltvDate(value: string): Date {
  const match = value.match(
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-])(\d{2})(\d{2}))?$/,
  );

  if (!match) {
    throw new Error(`Invalid XMLTV timestamp: ${value}`);
  }

  const [
    ,
    year,
    month,
    day,
    hour,
    minute,
    second,
    sign,
    offsetHour,
    offsetMinute,
  ] = match;

  const timestamp = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );

  // Validate the calendar date and time.
  const date = new Date(timestamp);

  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day) ||
    date.getUTCHours() !== Number(hour) ||
    date.getUTCMinutes() !== Number(minute) ||
    date.getUTCSeconds() !== Number(second)
  ) {
    throw new Error(`Invalid XMLTV date/time: ${value}`);
  }

  if (sign) {
    const hours = Number(offsetHour);
    const minutes = Number(offsetMinute);

    if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) {
      throw new Error(`Invalid XMLTV timezone offset: ${value}`);
    }

    const offsetMs = (hours * 60 + minutes) * 60_000 * (sign === "+" ? 1 : -1);

    return new Date(timestamp - offsetMs);
  }

  // XMLTV timestamps without an offset are interpreted as UTC here.
  return date;
}
