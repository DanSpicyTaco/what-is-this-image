# What is this image?

A static web app that inspects an image and reports **everything the file says
about its own origin** — entirely in your browser. Drop in an image and it reads
the embedded provenance, signature, and metadata. **Nothing is uploaded** — the
image never leaves your device.

It's an *authenticity inspector*, not a real/fake oracle. It tells you what an
image *claims* and whether those claims check out cryptographically — never that
the picture is "true" or "fake."

## Tools

| Check | What it answers | Status |
|---|---|---|
| **Content Credentials** (C2PA) | Who signed it? Valid? Trusted signer? What edits? | **Built** |
| **EXIF / metadata** | Camera make/model, software, timestamps | **Built** (fallback) |
| **Watermark** (SynthID & others) | Is an invisible AI watermark present? | **Planned** |
| **Reverse-image / source history** | Where else has this appeared? | Idea |

New checks plug in as additional analyzers that each contribute a result card to
the same dropped image — see [Architecture](#architecture).

> Built with Svelte + Vite and the WASM `@contentauth/c2pa-web` SDK. (Began life
> as a Node CLI using the native `@contentauth/c2pa-node` binding, since retired
> in favour of this browser app.)

## Why provenance is only half the story

C2PA Content Credentials are powerful but **fragile and one-sided**:

- A valid manifest tells you a lot (tool, edit history, signed chain).
- But credentials are stripped the moment an image is screenshotted, re-saved,
  or passed through most social platforms.
- So **"no credentials" is not evidence an image is real** — only that the signal
  didn't survive (or was never added).

That's exactly why this project will grow beyond provenance into watermark and
metadata signals: no single check is a verdict on its own.

## Run it

Requires **Node 22.22+** (the C2PA web SDK's minimum).

```bash
pnpm install
pnpm dev        # http://localhost:5173
```

Other scripts: `pnpm build` (static output to `dist/`), `pnpm preview`,
`pnpm check` (svelte-check + tsc).

## Signature vs. trust (and the trust lists)

A C2PA signature answers **two** independent questions:

1. **Integrity** — is the signature cryptographically valid and the content
   unaltered? (`broken` vs valid)
2. **Trust** — does the signer's certificate chain to an anchor we recognise?
   (`untrusted` vs `trusted`)

A valid-but-untrusted result usually just means *no trust list is loaded*. This
app verifies against **both** C2PA trust lists, bundled under
[`public/trust/`](public/trust) and served same-origin (so the SDK fetches them
with no cross-origin request):

- **Official C2PA Trust List** — production, launched mid-2025
  (`c2pa-org/conformance-public`).
- **Legacy Interim Trust List** — now frozen, still used by some verifiers
  (`contentcredentials.org/trust/*`), plus its allowed-cert-hash list and EKU
  config.

Fun thing to notice: OpenAI's images sign via Google's C2PA infrastructure (the
SynthID partnership), so they chain to a `Google C2PA Media Services` anchor on
the *official* list. Toggle **"Verify signer against the C2PA trust lists"** off
and on to watch the same image flip between `valid · unchecked` and
`valid & trusted`.

## Architecture

```
src/
  lib/c2pa.ts      # SDK init (WASM + worker), trust settings, reader.fromBlob
  lib/analyze.ts   # Blob -> structured verdict (the 4-state signature logic + EXIF)
  components/      # Dropzone, ResultCard
  App.svelte       # state + wiring
public/trust/      # the four bundled C2PA trust resources
```

Adding a new check (e.g. watermark detection) means writing another analyzer
that returns a `{ state, detail, … }` result and rendering it as a second
`ResultCard` for the same dropped image — the dropzone, preview, and privacy
guarantees are shared.

The trust verdict is read from `validation_results.activeManifest.success`
(`signingCredential.trusted`), **not** the flat `validation_status` array — that
array can carry an `untrusted` code from a CAWG sub-credential even when the
primary signature is trusted.

## Try it

1. Generate an image in ChatGPT / Adobe Firefly → drop it in → signed & trusted.
2. Screenshot that image (or upload + re-download it) → drop it in → the
   credentials are gone ("no provenance signal").
3. A real photo straight off your phone → no C2PA, but EXIF (camera make/model)
   may show up.

`examples/toucan.png` is a ChatGPT-generated sample to start with. More
credentialed test images: https://contentcredentials.org/verify

## Deploy

Targeting **Vercel** (auto-detects Vite; fully static, no server functions; no
`base`-path config for a root deploy). Not wired up yet.
