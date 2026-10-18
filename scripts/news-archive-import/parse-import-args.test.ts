import { describe, expect, it } from "vitest";
import { parseArchiveImportArgs } from "./parse-import-args";

describe("parseArchiveImportArgs", () => {
  it("defaults to dry-run when no flags", () => {
    expect(parseArchiveImportArgs([])).toBe("dry-run");
  });

  it("accepts explicit dry-run", () => {
    expect(parseArchiveImportArgs(["--dry-run"])).toBe("dry-run");
  });

  it("accepts live mode", () => {
    expect(parseArchiveImportArgs(["--live"])).toBe("live");
  });

  it("rejects live and dry-run together", () => {
    expect(() => parseArchiveImportArgs(["--live", "--dry-run"])).toThrow(
      /Cannot use --live and --dry-run together/,
    );
  });
});
