<script lang="ts">
  import type { Account } from '@dukat/core/ledger'
  import { Badge, Button } from '@dukat/ui'
  import { formatMoney } from '$lib/money'

  let {
    accounts,
    selectedId,
    onselect,
  }: {
    accounts: Account[]
    selectedId: string
    onselect: (id: string) => void
  } = $props()
</script>

<aside>
  <h2 class="mb-2 font-semibold">Accounts</h2>
  <div class="flex flex-col gap-2">
    {#each accounts as account (account.id)}
      <Button
        variant={account.id === selectedId ? 'default' : 'outline'}
        class="h-auto w-full justify-between py-3"
        onclick={() => onselect(account.id)}
      >
        <span class="text-left"
          >{account.name}<small class="block capitalize opacity-75"
            >{account.type}</small
          ></span
        >
        <span
          >{formatMoney(
            account.balanceMinor,
            account.currency,
          )}{#if account.archivedAt}<Badge variant="secondary" class="ml-1"
              >Archived</Badge
            >{/if}</span
        >
      </Button>
    {/each}
  </div>
</aside>
