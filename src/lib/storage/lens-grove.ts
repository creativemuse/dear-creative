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

export function resolveGroveOrIpfsUrl(
  urlOrUri: string | null | undefined,
): string {
  if (!urlOrUri) return "";
  const trimmed = urlOrUri.trim();
  if (trimmed.startsWith("lens://")) {
    const key = trimmed.slice("lens://".length);
    return `https://api.grove.storage/${key}`;
  }
  if (trimmed.startsWith("ipfs://")) {
    const cid = trimmed.slice("ipfs://".length).replace(/^ipfs\//, "");
    return `https://api.grove.storage/${cid}`;
  }
  return trimmed;
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

  try {
    const response = await client.uploadFile(fileObj);
    const gatewayUrl = response.gatewayUrl || client.resolve(response.uri);

    return {
      uri: response.uri,
      gatewayUrl,
      storageKey: response.storageKey,
    };
  } catch (err: unknown) {
    // If the storage propagation timed out, the file was already uploaded and has a key
    const msg = err instanceof Error ? err.message : String(err);
    const timeoutMatch =
      /resource\s+([a-zA-Z0-9_\-:]+)\s+to reach status/i.exec(msg);
    if (timeoutMatch && timeoutMatch[1]) {
      const storageKey = timeoutMatch[1].replace(/^lens:\/\//, "");
      const gatewayUrl = `https://api.grove.storage/${storageKey}`;
      return {
        uri: `lens://${storageKey}`,
        gatewayUrl,
        storageKey,
      };
    }

    // Direct upload fallback
    try {
      const directRes = await fetch("https://api.grove.storage?chain_id=232", {
        method: "POST",
        headers: {
          "Content-Type": fileObj.type || "image/png",
          "Content-Length": fileObj.size.toString(),
        },
        body: fileObj,
      });
      if (directRes.ok) {
        const list = (await directRes.json()) as Array<{
          storage_key?: string;
          uri?: string;
        }>;
        if (list && list[0]?.storage_key) {
          const storageKey = list[0].storage_key;
          return {
            uri: list[0].uri || `lens://${storageKey}`,
            gatewayUrl: `https://api.grove.storage/${storageKey}`,
            storageKey,
          };
        }
      }
    } catch {
      // Fall through to re-throwing original error
    }

    throw err;
  }
}

