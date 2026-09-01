<script lang="ts">
  import UserIcon from 'phosphor-svelte/lib/UserCircle'
  import { profileInitials } from '$lib/session'

  let {
    image,
    name,
    size = 'small',
  }: {
    image: string | null | undefined
    name: string
    size?: 'small' | 'large'
  } = $props()

  const initials = $derived(profileInitials(name))
  const frameClass = $derived(
    size === 'large' ? 'size-24 text-2xl' : 'size-10 text-sm',
  )
  const iconClass = $derived(size === 'large' ? 'size-10' : 'size-5')
</script>

{#if image}
  <img
    src={image}
    alt={`${name}'s profile`}
    class={[frameClass, 'shrink-0 rounded-full border object-cover']}
  />
{:else}
  <div
    class={[
      frameClass,
      'flex shrink-0 items-center justify-center rounded-full border bg-muted font-semibold',
    ]}
    role="img"
    aria-label={initials
      ? `Profile initials: ${initials}`
      : 'Generic profile image'}
  >
    {#if initials}
      {initials}
    {:else}
      <UserIcon class={iconClass} aria-hidden="true" />
    {/if}
  </div>
{/if}
