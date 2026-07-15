# What is this image?

A static browser app that reads an image's embedded provenance, signature, and metadata. **Nothing is uploaded**; the image never leaves your device.

It inspects authenticity signals, not truth. It reports what the image claims about its origin and whether the signature checks out cryptographically.

## Tools

| Check | What it answers | Status |
|---|---|---|
| **Content Credentials** (C2PA) | Who signed it? Is the signature valid? Is the signer trusted? What edits are listed? | **Built** |
| **EXIF / metadata** | Camera make/model, software, timestamps | **Built** (fallback) |
| **Watermark** (SynthID and others) | Is an invisible AI watermark present? | **Planned** |
| **Reverse image / source history** | Where else has this appeared? | Idea |

New checks can plug in as analyzers and add result cards for the same dropped image. See [Architecture](#architecture).

> Built with Svelte, Vite, and the WASM `@contentauth/c2pa-web` SDK. It started as a Node CLI using the native `@contentauth/c2pa-node` binding, then moved to the browser.

## Why provenance is not enough

C2PA Content Credentials are useful, but easy to lose:

- A valid manifest can show the tool, edit history, and signed chain.
- Screenshots, re-saves, and social platforms often strip credentials.
- **"No credentials" does not prove an image is real.** It only means the signal did not survive or was never added.

This project can combine provenance with watermark and metadata checks. No single signal decides the verdict.

## Run it

Requires **Node 22.22+** (the C2PA web SDK's minimum).

```bash
pnpm install
pnpm dev        # http://localhost:5173
```

Other scripts: `pnpm build` (static output to `dist/`), `pnpm preview`,
`pnpm check` (svelte-check + tsc).

## Signature vs. trust (and the trust lists)

A C2PA signature answers **two** separate questions:

1. **Integrity:** is the signature cryptographically valid and the content
   unaltered? (`broken` vs valid)
2. **Trust:** does the signer's certificate chain to an anchor we recognise?
   (`untrusted` vs `trusted`)

A valid-but-untrusted result usually means *no trust list is loaded*. This app verifies against **both** C2PA trust lists, bundled under [`public/trust/`](public/trust) and served same-origin so the SDK fetches them without a cross-origin request:

- **Official C2PA Trust List**, production, launched mid-2025 (`c2pa-org/conformance-public`).
- **Legacy Interim Trust List**, now frozen and still used by some verifiers (`contentcredentials.org/trust/*`), plus its allowed-cert-hash list and EKU config.

OpenAI images sign via Google's C2PA infrastructure through the SynthID partnership, so they chain to a `Google C2PA Media Services` anchor on the *official* list. Toggle **"Verify signer against the C2PA trust lists"** off and on to see the same image flip between `valid, unchecked` and `valid and trusted`.

## Architecture

```
src/
  lib/c2pa.ts      # SDK init (WASM + worker), trust settings, reader.fromBlob
  lib/analyze.ts   # Blob -> structured verdict (the 4-state signature logic + EXIF)
  components/      # Dropzone, ResultCard
  App.svelte       # state + wiring
public/trust/      # the four bundled C2PA trust resources
```

To add a check, such as watermark detection, write another analyzer that returns a `{ state, detail, ... }` result and render it as a second `ResultCard` for the same dropped image. The dropzone, preview, and privacy guarantees are shared.

The trust verdict comes from `validation_results.activeManifest.success` (`signingCredential.trusted`), **not** the flat `validation_status` array. That array can carry an `untrusted` code from a CAWG sub-credential even when the primary signature is trusted.

## Try it

1. Generate an image in ChatGPT or Adobe Firefly, then drop it in: signed and trusted.
2. Screenshot that image, or upload and re-download it, then drop it in: the credentials are gone ("no provenance signal").
3. Drop in a phone photo: no C2PA, but EXIF such as camera make/model may show up.

`examples/toucan.png` is a ChatGPT-generated sample to start with. More
credentialed test images: https://contentcredentials.org/verify

## Deploy

Target: **Vercel**. It auto-detects Vite, serves the app as static files, needs no server functions, and needs no `base` path for a root deploy. Not wired up yet.
