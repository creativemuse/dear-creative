import { describe, expect, it } from "vitest";
import {
  NEWSLETTER_POSTAL_ADDRESS,
  UNSUBSCRIBE_PAGE_PATH,
} from "./site-footer";

describe("NEWSLETTER_POSTAL_ADDRESS", () => {
  it("matches G2-approved CAN-SPAM footer text", () => {
    expect(NEWSLETTER_POSTAL_ADDRESS).toBe(
      "Creative Platform Inc, 8 The Green, Suite G, Dover, Delaware 19901",
    );
  });
});

describe("UNSUBSCRIBE_PAGE_PATH", () => {
  it("points at the public unsubscribe page", () => {
    expect(UNSUBSCRIBE_PAGE_PATH).toBe("/unsubscribe");
  });
});
