// analyze.ts — turn an image File into a structured provenance verdict.
//
// The trust logic is written against the c2pa-web manifest shape, NOT ported
// from the CLI's flat `validation_status` parsing: the real trust signal lives
// in `validation_results.activeManifest.{success,failure}`. The top-level
// `validation_status` array can contain a `signingCredential.untrusted` code
// from a CAWG sub-credential even when the primary signature is trusted, so
// keying off it would mislabel trusted images.

import exifr from 'exifr';
import { readManifestStore } from './c2pa';

export type SignatureState =
  | 'broken'
  | 'valid-untrusted'
  | 'valid-trusted'
  | 'valid-unchecked';

export interface VerifyResult {
  hasCredentials: boolean;
  generator?: string;
  signature?: { state: SignatureState; detail: string };
  edits?: string[];
  exif?: ExifHints | null;
  verdict: string;
}

export type ExifHints = Record<string, string>;

interface StatusEntry {
  code: string;
  explanation?: string;
  url?: string;
}
interface ManifestStoreLike {
  active_manifest?: string;
  manifests?: Record<string, ManifestLike>;
  validation_state?: string;
  validation_results?: {
    activeManifest?: { success?: StatusEntry[]; failure?: StatusEntry[] };
  };
}
interface ManifestLike {
  claim_generator?: string;
  claim_generator_info?: { name?: string; version?: string }[];
  assertions?: { label?: string; data?: { actions?: { action?: string }[] } }[];
}

const ACCEPTED = /^image\/(png|jpeg|webp|gif|tiff|avif)$/;
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB — our own guard (the SDK only blocks at 1 GB)

const VERDICTS: Record<SignatureState, string> = {
  broken:
    'Provenance is present but the signature FAILED — treat the manifest as unreliable.',
  'valid-untrusted':
    'Provenance present and the signature is intact, but the signer is not in a loaded trust list.',
  'valid-trusted':
    'Provenance present, signature valid, and the signer chains to a known trust anchor.',
  'valid-unchecked':
    'Signature is structurally valid, but trust was not verified — toggle trust on to check the signer.',
};
const NO_CREDENTIALS_VERDICT =
  'No provenance signal. This is NOT evidence the image is real or human-made — credentials are routinely stripped by screenshots, re-saves and social uploads.';

/** Throw a friendly error for file types/sizes we won't even hand to the SDK. */
export function assertAcceptable(file: File): void {
  const type = file.type || guessType(file.name);
  if (!ACCEPTED.test(type)) {
    const seen = file.type ? ` (${file.type})` : '';
    throw new Error(
      `Unsupported file type${seen}. Use a PNG, JPEG, WebP, GIF, TIFF or AVIF image.`,
    );
  }
  if (file.size > MAX_BYTES) {
    throw new Error(
      `Image is too large (${(file.size / 1e6).toFixed(1)} MB). Max ${MAX_BYTES / 1e6} MB.`,
    );
  }
}

export async function analyze(file: File, trustEnabled: boolean): Promise<VerifyResult> {
  assertAcceptable(file);
  const store = (await readManifestStore(withType(file), trustEnabled)) as
    | ManifestStoreLike
    | null;

  if (!store) {
    return {
      hasCredentials: false,
      exif: await exifFallback(file),
      verdict: NO_CREDENTIALS_VERDICT,
    };
  }

  const manifest = store.active_manifest
    ? store.manifests?.[store.active_manifest]
    : undefined;
  const signature = classifySignature(store, trustEnabled);
  return {
    hasCredentials: true,
    generator: generatorName(manifest),
    signature,
    edits: editActions(manifest),
    verdict: VERDICTS[signature.state],
  };
}

function classifySignature(
  store: ManifestStoreLike,
  trustEnabled: boolean,
): { state: SignatureState; detail: string } {
  const am = store.validation_results?.activeManifest;
  const success = am?.success ?? [];
  const failure = am?.failure ?? [];

  // "Broken" = an integrity/validity failure (bad signature, altered content,
  // hash mismatch). Trust-only codes (…untrusted) are NOT integrity failures —
  // exclude them so a valid-but-untrusted signature isn't mislabeled broken.
  const integrityFailures = failure.filter((c) => !/untrusted/i.test(c.code));
  if (/invalid/i.test(store.validation_state ?? '') || integrityFailures.length) {
    return {
      state: 'broken',
      detail: integrityFailures[0]?.code ?? store.validation_state ?? 'validation failed',
    };
  }

  if (!trustEnabled) {
    return { state: 'valid-unchecked', detail: 'trust not checked' };
  }

  // Trusted iff the primary signature succeeded against a trust anchor.
  if (success.some((c) => c.code === 'signingCredential.trusted')) {
    return { state: 'valid-trusted', detail: 'signer chains to a known trust anchor' };
  }
  return { state: 'valid-untrusted', detail: 'signer not in a loaded trust list' };
}

function generatorName(manifest?: ManifestLike): string {
  const info = manifest?.claim_generator_info;
  if (Array.isArray(info) && info.length) {
    const names = info
      .map((g) => [g.name, g.version].filter(Boolean).join(' '))
      .filter(Boolean);
    if (names.length) return names.join(', ');
  }
  return manifest?.claim_generator ?? 'unknown';
}

function editActions(manifest?: ManifestLike): string[] {
  const actions = (manifest?.assertions ?? []).find(
    (a) => a.label === 'c2pa.actions' || a.label === 'c2pa.actions.v2',
  );
  return (actions?.data?.actions ?? [])
    .map((a) => a.action)
    .filter((a): a is string => Boolean(a));
}

const EXIF_KEYS = ['Make', 'Model', 'Software', 'DateTimeOriginal', 'CreateDate'] as const;
async function exifFallback(file: File): Promise<ExifHints | null> {
  try {
    const exif = await exifr.parse(file, [...EXIF_KEYS]);
    if (!exif) return null;
    const hints: ExifHints = {};
    for (const k of EXIF_KEYS) if (exif[k] != null) hints[k] = String(exif[k]);
    return Object.keys(hints).length ? hints : null;
  } catch {
    return null;
  }
}

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  avif: 'image/avif',
};
function guessType(name: string): string {
  return EXT_TO_MIME[name.toLowerCase().split('.').pop() ?? ''] ?? '';
}

// fromBlob keys the format off blob.type; if a dropped file has no type, give it
// one inferred from the extension (assertAcceptable already validated it).
function withType(file: File): Blob {
  if (file.type) return file;
  const type = guessType(file.name);
  return type ? new Blob([file], { type }) : file;
}
