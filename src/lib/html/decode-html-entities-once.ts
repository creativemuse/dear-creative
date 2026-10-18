/** Strip CDATA wrappers from RSS/HTML fragments. */
export function stripCdata(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i);
  return match ? match[1]! : trimmed;
}

const NAMED_XML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/**
 * Decode XML/HTML entities exactly once (single pass over the input string).
 */
export function decodeHtmlEntitiesOnce(value: string): string {
  const out = stripCdata(value);
  return out.replace(
    /&(#[xX][0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g,
    (entity, body: string) => {
      if (body.startsWith("#")) {
        if (body[1] === "x" || body[1] === "X") {
          return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
        }
        return String.fromCodePoint(Number(body.slice(1)));
      }
      return NAMED_XML_ENTITIES[body] ?? entity;
    },
  );
}
