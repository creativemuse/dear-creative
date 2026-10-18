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

function isAllowedCodePoint(code: number): boolean {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) {
    return false;
  }
  if (code >= 0xd800 && code <= 0xdfff) {
    return false;
  }
  return true;
}

function decodeNumericEntityReference(entity: string, body: string): string {
  const code =
    body[1] === "x" || body[1] === "X"
      ? Number.parseInt(body.slice(2), 16)
      : Number.parseInt(body.slice(1), 10);
  if (!isAllowedCodePoint(code)) {
    return entity;
  }
  try {
    return String.fromCodePoint(code);
  } catch {
    return entity;
  }
}

/**
 * Decode XML/HTML entities exactly once (single pass over the input string).
 */
export function decodeHtmlEntitiesOnce(value: string): string {
  const out = stripCdata(value);
  return out.replace(
    /&(#[xX][0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g,
    (entity, body: string) => {
      if (body.startsWith("#")) {
        return decodeNumericEntityReference(entity, body);
      }
      return NAMED_XML_ENTITIES[body] ?? entity;
    },
  );
}
