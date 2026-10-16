function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "";
  }
  const parts = [error.message];
  let current: unknown = error;
  for (let depth = 0; depth < 5; depth += 1) {
    const cause = (current as { cause?: unknown }).cause;
    if (!(cause instanceof Error)) {
      break;
    }
    parts.push(cause.message);
    current = cause;
  }
  return parts.join(" ").toLowerCase();
}

export function isSqliteUniqueConstraintError(error: unknown): boolean {
  const message = errorMessage(error);
  if (!message) {
    return false;
  }
  return (
    message.includes("unique constraint failed") ||
    message.includes("sqlite_constraint_unique")
  );
}
