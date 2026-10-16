import { describe, expect, it } from "vitest";
import { NEWSLETTER_POSTAL_ADDRESS } from "./site-footer";

describe("NEWSLETTER_POSTAL_ADDRESS", () => {
  it("matches G2-approved CAN-SPAM footer text", () => {
    expect(NEWSLETTER_POSTAL_ADDRESS).toBe(
      "Creative Platform Inc, 8 The Green, Suite G, Dover, Delaware 19901",
    );
  });
});
