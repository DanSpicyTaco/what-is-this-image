<script lang="ts">
  import Dropzone from './components/Dropzone.svelte';
  import ResultCard from './components/ResultCard.svelte';
  import { analyze, type VerifyResult } from './lib/analyze';

  let { assetBase = import.meta.env.BASE_URL }: { assetBase?: string } = $props();

  let file = $state<File | null>(null);
  let previewUrl = $state<string | null>(null);
  let result = $state<VerifyResult | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(false);
  let trustEnabled = $state(true);

  async function run() {
    if (!file) return;
    loading = true;
    error = null;
    result = null;
    try {
      result = await analyze(file, trustEnabled, assetBase);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  function onFile(f: File) {
    file = f;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(f);
    run();
  }
</script>

<section class="witi-app" aria-labelledby="witi-title">
  <header>
    <p class="kicker">Image Authenticity</p>
    <h1 id="witi-title">What is <em>this image?</em></h1>
    <div class="rule"></div>
    <p class="tagline">
      Read provenance and metadata signals in your browser. Content Credentials
      work today; watermark checks come next. Nothing is uploaded.
    </p>
  </header>

  <Dropzone onfile={onFile} />

  <label class="trust-toggle">
    <input type="checkbox" bind:checked={trustEnabled} onchange={run} />
    Verify signer against the C2PA trust lists
  </label>

  {#if previewUrl}
    <figure class="specimen">
      <img class="preview" src={previewUrl} alt="Selected file preview" decoding="async" />
      <figcaption class="field-label">Selected image</figcaption>
    </figure>
  {/if}

  <div aria-live="polite">
    {#if loading}
      <p class="status">Checking credentials…</p>
    {:else if error}
      <section class="card reveal" aria-label="Error">
        <span class="stamp red"><span class="dot" aria-hidden="true"></span>Error</span>
        <p>{error}</p>
      </section>
    {:else if result}
      <ResultCard {result} />
    {/if}
  </div>

  <footer>
    <p>
      A valid signature proves integrity and signer identity, not truth. “No credentials”
      does not mean “not AI”; screenshots and re-uploads often strip provenance.
    </p>
  </footer>
</section>
