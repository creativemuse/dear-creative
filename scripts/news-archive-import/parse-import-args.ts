export type ArchiveImportMode = "dry-run" | "live";

export function parseArchiveImportArgs(argv: string[]): ArchiveImportMode {
  let dryRun = false;
  let live = false;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--live") {
      live = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      return "dry-run";
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (dryRun && live) {
    throw new Error("Cannot use --live and --dry-run together");
  }
  if (live) {
    return "live";
  }
  return "dry-run";
}
