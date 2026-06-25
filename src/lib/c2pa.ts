// c2pa.ts — thin wrapper around the @contentauth/c2pa-web (WASM) SDK.
//
// Reads + verifies C2PA entirely client-side (no upload). Trust resources are
// bundled under public/trust and served same-origin, so the SDK fetches them
// with no cross-origin request — sidestepping CORS on the upstream hosts.

import { createC2pa } from '@contentauth/c2pa-web';
import wasmSrc from '@contentauth/c2pa-web/resources/c2pa.wasm?url';

type C2paInstance = Awaited<ReturnType<typeof createC2pa>>;

let instance: Promise<C2paInstance> | null = null;
function getC2pa(): Promise<C2paInstance> {
  // The SDK spins up a Web Worker + WASM module; create it once and reuse.
  instance ??= createC2pa({ wasmSrc });
  return instance;
}

// import.meta.env.BASE_URL ends in '/', so this resolves to `${origin}/trust`.
const TRUST_BASE = `${location.origin}${import.meta.env.BASE_URL}trust`;

// Mirror the old CLI's trust setup: official C2PA list + interim list as anchors,
// plus the interim allowed-cert-hash list and the EKU config. Dropping the
// allowed-list/config would leave interim-list signers unverified.
function trustSettings(trustEnabled: boolean) {
  if (!trustEnabled) {
    return { verify: { verifyTrust: false } };
  }
  return {
    verify: { verifyTrust: true },
    trust: {
      trustAnchors: [
        `${TRUST_BASE}/c2pa-official-anchors.pem`,
        `${TRUST_BASE}/itl-anchors.pem`,
      ],
      allowedList: `${TRUST_BASE}/itl-allowed.sha256.txt`,
      trustConfig: `${TRUST_BASE}/itl-store.cfg`,
    },
  };
}

/**
 * Read the manifest store for a blob. Returns null when the asset carries no
 * C2PA manifest (the SDK returns null rather than throwing for that case);
 * throws UnsupportedFormatError / AssetTooLargeError for bad input.
 */
export async function readManifestStore(blob: Blob, trustEnabled: boolean): Promise<unknown> {
  const c2pa = await getC2pa();
  const reader = await c2pa.reader.fromBlob(blob.type, blob, trustSettings(trustEnabled));
  if (!reader) return null;
  try {
    return await reader.manifestStore();
  } finally {
    await reader.free();
  }
}
