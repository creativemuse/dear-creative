export function resendIdempotencyKeyForChunk(
  receiptId: string,
  chunkIndex: number,
): string {
  return `dear-creative/receipt/${receiptId}/chunk/${chunkIndex}`;
}
