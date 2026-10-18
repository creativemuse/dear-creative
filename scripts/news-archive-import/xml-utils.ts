/** Strip CDATA wrappers from RSS/HTML fragments. */
export function stripCdata(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i);
  return match ? match[1]! : trimmed;
}

/**
 * Decode XML/HTML entities exactly once. Numeric hex/dec entities are handled;
 * `&amp;` is decoded last so `&amp;lt;` becomes literal `&lt;`, not `<`.
 */
export function decodeXmlEntitiesOnce(value: string): string {
  let out = stripCdata(value);
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
    String.fromCodePoint(Number.parseInt(hex, 16)),
  );
  out = out.replace(/&#(\d+);/g, (_, dec: string) =>
    String.fromCodePoint(Number(dec)),
  );
  // One level of &amp; only — do not decode &lt;/&gt; so double-encoded teasers stay escaped.
  out = out.replace(/&amp;/g, "&");
  return out;
}

export function readTagInner(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const match = block.match(re);
  if (!match?.[1]) return null;
  return decodeXmlEntitiesOnce(match[1].trim());
}
