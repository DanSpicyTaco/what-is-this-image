<script lang="ts">
  import type { VerifyResult, SignatureState } from '../lib/analyze';

  let { result }: { result: VerifyResult } = $props();

  const BADGES: Record<SignatureState | 'none', { label: string; cls: string }> = {
    'valid-trusted': { label: 'Valid and trusted', cls: 'green' },
    'valid-untrusted': { label: 'Valid, untrusted', cls: 'amber' },
    'valid-unchecked': { label: 'Valid, unchecked', cls: 'amber' },
    broken: { label: 'Signature broken', cls: 'red' },
    none: { label: 'No credentials', cls: 'grey' },
  };

  const badge = $derived(
    result.hasCredentials && result.signature
      ? BADGES[result.signature.state]
      : BADGES.none,
  );
</script>

<section class="card reveal" aria-label="Verification result">
  <span class="stamp {badge.cls}"><span class="dot" aria-hidden="true"></span>{badge.label}</span>

  {#if result.hasCredentials}
    <dl>
      <dt>Signed by</dt>
      <dd>{result.generator}</dd>
      <dt>Signature</dt>
      <dd>{result.signature?.detail}</dd>
      {#if result.edits?.length}
        <dt>Edits</dt>
        <dd>{result.edits.join(', ')}</dd>
      {/if}
    </dl>
  {:else if result.exif}
    <dl>
      {#each Object.entries(result.exif) as [key, value]}
        <dt>{key}</dt>
        <dd>{value}</dd>
      {/each}
    </dl>
  {:else}
    <p class="muted small">No C2PA credentials or useful EXIF metadata.</p>
  {/if}

  <p class="verdict">{result.verdict}</p>
</section>
