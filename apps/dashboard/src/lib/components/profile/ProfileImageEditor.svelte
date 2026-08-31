<script lang="ts">
  import { Alert, Button, Label, Spinner } from '@dukat/ui'
  import UserIcon from 'phosphor-svelte/lib/UserCircle'
  import { onDestroy } from 'svelte'
  import { profileInitials } from '$lib/session'

  let {
    image,
    name,
    onchanged,
  }: {
    image: string | null | undefined
    name: string
    onchanged: (image: string | null) => void | Promise<void>
  } = $props()

  let selectedFile = $state<File | null>(null)
  let previewUrl = $state('')
  let x = $state(0.5)
  let y = $state(0.5)
  let zoom = $state(1)
  let pending = $state(false)
  let error = $state('')
  let notice = $state('')
  let fileInput: HTMLInputElement
  let previewWidth = $state(0)
  let previewHeight = $state(0)
  const initials = $derived(profileInitials(name))
  const previewGeometry = $derived.by(() => {
    const shortestSide = Math.min(previewWidth, previewHeight)
    if (!shortestSide) return { width: 100, height: 100, left: 0, top: 0 }
    const width = (previewWidth * zoom * 100) / shortestSide
    const height = (previewHeight * zoom * 100) / shortestSide
    return {
      width,
      height,
      left: -(width - 100) * x,
      top: -(height - 100) * y,
    }
  })

  onDestroy(revokePreview)

  function revokePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    previewUrl = ''
  }

  function selectFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0] ?? null
    error = ''
    notice = ''
    revokePreview()
    selectedFile = null
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      error = 'Profile images must be 5 MB or smaller.'
      input.value = ''
      return
    }
    selectedFile = file
    previewUrl = URL.createObjectURL(file)
    x = 0.5
    y = 0.5
    zoom = 1
    previewWidth = 0
    previewHeight = 0
  }

  function readPreviewDimensions(event: Event) {
    const image = event.currentTarget as HTMLImageElement
    previewWidth = image.naturalWidth
    previewHeight = image.naturalHeight
  }

  function clearSelection() {
    revokePreview()
    selectedFile = null
    error = ''
    if (fileInput) fileInput.value = ''
  }

  async function saveImage() {
    if (!selectedFile || pending) return
    const replacing = Boolean(image)
    pending = true
    error = ''
    notice = ''
    const body = new FormData()
    body.set('image', selectedFile)
    body.set('x', String(x))
    body.set('y', String(y))
    body.set('zoom', String(zoom))
    try {
      const response = await fetch('/api/profile/image', {
        method: 'POST',
        body,
      })
      const result = (await response.json().catch(() => ({}))) as {
        image?: string
        message?: string
      }
      if (!response.ok || !result.image) {
        throw new Error(
          result.message || `Profile image upload failed (${response.status}).`,
        )
      }
      await onchanged(result.image)
      clearSelection()
      notice = replacing
        ? 'Your profile image was replaced.'
        : 'Your profile image was saved.'
    } catch (cause) {
      error = (cause as Error).message
    } finally {
      pending = false
    }
  }

  async function removeImage() {
    if (!image || pending) return
    pending = true
    error = ''
    notice = ''
    try {
      const response = await fetch('/api/profile/image', { method: 'DELETE' })
      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as {
          message?: string
        }
        throw new Error(
          result.message ||
            `Profile image removal failed (${response.status}).`,
        )
      }
      await onchanged(null)
      notice = 'Your profile image was removed.'
    } catch (cause) {
      error = (cause as Error).message
    } finally {
      pending = false
    }
  }
</script>

<div class="flex flex-col gap-4">
  <div class="flex flex-col items-center gap-2">
    {#if image}
      <img
        src={image}
        alt={`${name}'s profile`}
        class="size-24 rounded-full border object-cover"
      />
    {:else}
      <div
        class="flex size-24 items-center justify-center rounded-full border bg-muted text-2xl font-semibold"
        role="img"
        aria-label={initials
          ? `Profile initials: ${initials}`
          : 'Generic profile image'}
      >
        {#if initials}
          {initials}
        {:else}
          <UserIcon class="size-10" aria-hidden="true" />
        {/if}
      </div>
    {/if}
    <span class="text-center text-xs text-muted-foreground"
      >Current profile image</span
    >
  </div>

  {#if error}
    <Alert.Root variant="destructive" role="alert">
      <Alert.Title>Could not change profile image</Alert.Title>
      <Alert.Description>{error}</Alert.Description>
    </Alert.Root>
  {/if}
  {#if notice}
    <p class="text-sm" role="status" aria-live="polite">{notice}</p>
  {/if}
  {#if pending}
    <p class="text-sm" role="status" aria-live="polite">
      {selectedFile ? 'Uploading profile image…' : 'Removing profile image…'}
    </p>
  {/if}

  <div class="grid gap-2">
    <Label for="profile-image-file">
      {image ? 'Choose replacement' : 'Choose profile image'}
    </Label>
    <input
      id="profile-image-file"
      bind:this={fileInput}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      class="block w-full text-xs file:mr-2 file:border file:border-input file:bg-background file:px-2 file:py-1 file:text-xs file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onchange={selectFile}
      disabled={pending}
    />
    <p class="text-xs text-muted-foreground">
      JPEG, PNG, or WebP. Maximum 5 MB.
    </p>
  </div>

  {#if selectedFile && previewUrl}
    <fieldset class="grid gap-3">
      <legend class="mb-2 text-sm font-medium">Crop profile image</legend>
      <div
        class="relative mx-auto aspect-square w-full max-w-64 overflow-hidden border bg-muted"
      >
        <img
          src={previewUrl}
          alt="Crop preview"
          class="absolute max-w-none"
          style:width={`${previewGeometry.width}%`}
          style:height={`${previewGeometry.height}%`}
          style:left={`${previewGeometry.left}%`}
          style:top={`${previewGeometry.top}%`}
          onload={readPreviewDimensions}
        />
      </div>
      <div class="grid gap-1">
        <Label for="profile-image-zoom">Zoom</Label>
        <input
          id="profile-image-zoom"
          type="range"
          min="1"
          max="3"
          step="0.05"
          bind:value={zoom}
          class="w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div class="grid gap-1">
        <Label for="profile-image-horizontal">Horizontal position</Label>
        <input
          id="profile-image-horizontal"
          type="range"
          min="0"
          max="1"
          step="0.01"
          bind:value={x}
          class="w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div class="grid gap-1">
        <Label for="profile-image-vertical">Vertical position</Label>
        <input
          id="profile-image-vertical"
          type="range"
          min="0"
          max="1"
          step="0.01"
          bind:value={y}
          class="w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div class="flex flex-wrap gap-2">
        <Button onclick={saveImage} disabled={pending}>
          {#if pending}<Spinner aria-hidden="true" />{/if}
          {pending ? 'Uploading…' : 'Save profile image'}
        </Button>
        <Button variant="outline" onclick={clearSelection} disabled={pending}
          >Cancel</Button
        >
      </div>
    </fieldset>
  {/if}

  {#if image && !selectedFile}
    <Button variant="destructive" onclick={removeImage} disabled={pending}>
      {#if pending}<Spinner aria-hidden="true" />{/if}
      {pending ? 'Removing…' : 'Remove profile image'}
    </Button>
  {/if}
</div>
