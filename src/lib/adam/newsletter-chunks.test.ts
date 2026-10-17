import { describe, expect, it } from "vitest";
import { chunkSubscriberIds } from "./newsletter-chunks";
import { NEWSLETTER_CHUNK_SIZE } from "./newsletter-chunk-constants";

describe("chunkSubscriberIds", () => {
  it("splits 250 ids into three chunks of 100, 100, and 50", () => {
    const ids = Array.from({ length: 250 }, (_, index) => `sub-${index}`);
    const chunks = chunkSubscriberIds(ids);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(NEWSLETTER_CHUNK_SIZE);
    expect(chunks[1]).toHaveLength(NEWSLETTER_CHUNK_SIZE);
    expect(chunks[2]).toHaveLength(50);
  });
});
