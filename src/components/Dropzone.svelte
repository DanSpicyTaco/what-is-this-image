<script lang="ts">
  let { onfile }: { onfile: (file: File) => void } = $props();
  let dragging = $state(false);

  function take(files: FileList | null | undefined) {
    const file = files?.[0];
    if (file) onfile(file);
  }
</script>

<label
  class="dropzone"
  class:dragging
  ondragover={(e) => {
    e.preventDefault();
    dragging = true;
  }}
  ondragleave={() => (dragging = false)}
  ondrop={(e) => {
    e.preventDefault();
    dragging = false;
    take(e.dataTransfer?.files);
  }}
>
  <span class="field-label">Image</span>
  <span class="dz-head">Drop an image</span>
  <span class="dz-sub">or click to choose; nothing is uploaded</span>
  <input
    class="visually-hidden"
    type="file"
    accept="image/png,image/jpeg,image/webp,image/gif,image/tiff,image/avif"
    aria-label="Choose an image to inspect"
    onchange={(e) => take((e.currentTarget as HTMLInputElement).files)}
  />
</label>
