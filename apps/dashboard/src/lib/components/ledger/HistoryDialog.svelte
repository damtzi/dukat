<script lang="ts">
  /* eslint-disable svelte/require-each-key */
  import type { HistoryEntry } from '@dukat/core/ledger'
  import { Dialog, Table } from '@dukat/ui'

  let {
    open = $bindable(),
    title,
    history,
    changed,
  }: {
    open: boolean
    title: string
    history: HistoryEntry[]
    changed: (entry: HistoryEntry) => string
  } = $props()
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-w-3xl"
    ><Dialog.Header
      ><Dialog.Title>{title}</Dialog.Title><Dialog.Description
        >Changes recorded for this item.</Dialog.Description
      ></Dialog.Header
    >{#if history.length === 0}<p
        class="py-6 text-center text-muted-foreground"
      >
        No history yet.
      </p>{:else}<div class="max-h-[60vh] overflow-auto">
        <Table.Root
          ><Table.Header
            ><Table.Row
              ><Table.Head>Action</Table.Head><Table.Head>Actor</Table.Head
              ><Table.Head>Created</Table.Head><Table.Head
                >What changed</Table.Head
              ></Table.Row
            ></Table.Header
          ><Table.Body
            >{#each history as entry}<Table.Row
                ><Table.Cell class="capitalize">{entry.action}</Table.Cell
                ><Table.Cell>{entry.actorUserId}</Table.Cell><Table.Cell
                  >{entry.createdAt}</Table.Cell
                ><Table.Cell class="max-w-sm whitespace-normal"
                  >{changed(entry)}</Table.Cell
                ></Table.Row
              >{/each}</Table.Body
          ></Table.Root
        >
      </div>{/if}</Dialog.Content
  >
</Dialog.Root>
