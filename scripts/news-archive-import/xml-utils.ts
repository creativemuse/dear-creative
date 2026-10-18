import {
  decodeHtmlEntitiesOnce,
  stripCdata,
} from "../../src/lib/html/decode-html-entities-once";

export { stripCdata };

/** @deprecated use decodeHtmlEntitiesOnce — kept for importer tests and RSS parsing. */
export function decodeXmlEntitiesOnce(value: string): string {
  return decodeHtmlEntitiesOnce(value);
}

export function readTagInner(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const match = block.match(re);
  if (!match?.[1]) return null;
  return decodeHtmlEntitiesOnce(match[1].trim());
}

export function readContentEncoded(block: string): string | null {
  const re = /<content:encoded(?:\s[^>]*)?>([\s\S]*?)<\/content:encoded>/i;
  const match = block.match(re);
  if (!match?.[1]) return null;
  return decodeHtmlEntitiesOnce(match[1].trim());
}
