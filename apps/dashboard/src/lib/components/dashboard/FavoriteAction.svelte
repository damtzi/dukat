<script lang="ts">
  import { Sidebar } from '@dukat/ui'
  import StarIcon from 'phosphor-svelte/lib/Star'

  let {
    active,
    pending,
    path,
    label,
    submenu = false,
    showOnHover,
    ontoggle,
  }: {
    active: boolean
    pending: boolean
    path: string
    label: string
    submenu?: boolean
    showOnHover?: boolean
    ontoggle: (path: string, label: string) => void
  } = $props()

  let actionLabel = $derived(
    active ? `Remove ${label} from favorites` : `Add ${label} to favorites`,
  )
  let revealOnHover = $derived(showOnHover ?? !active)
</script>

<Sidebar.MenuAction
  type="button"
  showOnHover={revealOnHover}
  class={[
    'peer-data-[active=true]/menu-button:opacity-100',
    submenu &&
      'top-1 group-focus-within/menu-sub-item:opacity-100 group-hover/menu-sub-item:opacity-100',
  ]}
  disabled={pending}
  aria-label={actionLabel}
  aria-pressed={active}
  title={actionLabel}
  onclick={() => ontoggle(path, label)}
>
  <StarIcon weight={active ? 'fill' : 'regular'} aria-hidden="true" />
</Sidebar.MenuAction>
