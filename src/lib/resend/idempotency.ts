export function resendIdempotencyKeyForChunk(
  receiptId: string,
  chunkIndex: number,
  recipientSetHash: string,
): string {
  return `dear-creative/receipt/${receiptId}/chunk/${chunkIndex}/${recipientSetHash}`;
}
