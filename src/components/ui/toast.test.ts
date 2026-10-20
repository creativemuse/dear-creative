import { describe, expect, it } from "vitest";
import { fallbackToast } from "./toast";

describe("Toast notification fallback", () => {
  it("provides safe fallback methods without throwing", () => {
    const { toast, removeToast } = fallbackToast;

    expect(typeof toast.success).toBe("function");
    expect(typeof toast.error).toBe("function");
    expect(typeof toast.info).toBe("function");
    expect(typeof toast.warning).toBe("function");
    expect(typeof removeToast).toBe("function");

    expect(() => {
      toast.success("Test success");
      toast.error("Test error");
      toast.info("Test info");
      toast.warning("Test warning");
      removeToast("some-id");
    }).not.toThrow();
  });
});
