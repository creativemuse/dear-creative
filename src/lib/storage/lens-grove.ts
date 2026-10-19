import { StorageClient } from "@lens-chain/storage-client";

export type LensGroveUploadResult = {
  uri: string;
  gatewayUrl: string;
  storageKey: string;
};

let cachedClient: StorageClient | null = null;

export function getLensGroveStorageClient(): StorageClient {
  if (!cachedClient) {
    cachedClient = StorageClient.create();
  }
  return cachedClient;
}

/**
 * Uploads a file (File or Blob) to Lens Grove on-chain controlled storage.
 * Returns the decentralized URI and the public gateway URL (https://api.grove.storage/...).
 */
export async function uploadToLensGrove(
  file: File | Blob,
  fileName = "banner.png",
): Promise<LensGroveUploadResult> {
  const client = getLensGroveStorageClient();
  const fileObj =
    file instanceof File
      ? file
      : new File([file], fileName, {
          type: file.type || "image/png",
        });

  const response = await client.uploadFile(fileObj);

  const gatewayUrl = response.gatewayUrl || client.resolve(response.uri);

  return {
    uri: response.uri,
    gatewayUrl,
    storageKey: response.storageKey,
  };
}
