import { describe, expect, it } from "vitest";
import { decodeHtmlEntitiesOnce } from "./decode-html-entities-once";

describe("decodeHtmlEntitiesOnce", () => {
  it("decodes named entities once", () => {
    expect(decodeHtmlEntitiesOnce("&amp;lt;")).toBe("&lt;");
    expect(decodeHtmlEntitiesOnce("&quot;hi&quot;")).toBe('"hi"');
  });

  it("leaves invalid numeric entities unchanged", () => {
    expect(decodeHtmlEntitiesOnce("&#NaN;")).toBe("&#NaN;");
    expect(decodeHtmlEntitiesOnce("&#xFFFFFFFF;")).toBe("&#xFFFFFFFF;");
    expect(decodeHtmlEntitiesOnce("&#55357;")).toBe("&#55357;");
    expect(decodeHtmlEntitiesOnce("&#xD800;")).toBe("&#xD800;");
  });

  it("decodes valid numeric entities", () => {
    expect(decodeHtmlEntitiesOnce("&#x27;")).toBe("'");
    expect(decodeHtmlEntitiesOnce("&#65;")).toBe("A");
  });
});
