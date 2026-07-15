// c2pa.ts: thin wrapper around the @contentauth/c2pa-web (WASM) SDK.
//
// Reads and verifies C2PA client-side. Nothing is uploaded. Trust resources are
// bundled under public/trust and served same-origin, so the SDK fetches them
// without a cross-origin request and avoids upstream CORS issues.

import { createC2pa } from '@contentauth/c2pa-web';
import wasmSrc from '@contentauth/c2pa-web/resources/c2pa.wasm?url';

type C2paInstance = Awaited<ReturnType<typeof createC2pa>>;

let instance: Promise<C2paInstance> | null = null;
function getC2pa(): Promise<C2paInstance> {
  // The SDK spins up a Web Worker + WASM module; create it once and reuse.
  instance ??= createC2pa({ wasmSrc });
  return instance;
}

function trustBase(assetBase: string): string {
  return new URL('trust/', new URL(assetBase, location.origin))
    .toString()
    .replace(/\/$/, '');
}

// Mirror the old CLI's trust setup: official C2PA list and interim list as anchors,
// plus the interim allowed-cert-hash list and the EKU config. Dropping the
// allowed-list/config would leave interim-list signers unverified.
function trustSettings(trustEnabled: boolean, assetBase: string) {
  if (!trustEnabled) {
    return { verify: { verifyTrust: false } };
  }
  const base = trustBase(assetBase);
  return {
    verify: { verifyTrust: true },
    trust: {
      trustAnchors: [
        `${base}/c2pa-official-anchors.pem`,
        `${base}/itl-anchors.pem`,
      ],
      allowedList: `${base}/itl-allowed.sha256.txt`,
      trustConfig: `${base}/itl-store.cfg`,
    },
  };
}

/**
 * Read the manifest store for a blob. Returns null when the asset carries no
 * C2PA manifest (the SDK returns null rather than throwing for that case);
 * throws UnsupportedFormatError / AssetTooLargeError for bad input.
 */
export async function readManifestStore(
  blob: Blob,
  trustEnabled: boolean,
  assetBase: string,
): Promise<unknown> {
  const c2pa = await getC2pa();
  const reader = await c2pa.reader.fromBlob(
    blob.type,
    blob,
    trustSettings(trustEnabled, assetBase),
  );
  if (!reader) return null;
  try {
    return await reader.manifestStore();
  } finally {
    await reader.free();
  }
}
