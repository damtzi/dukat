<script lang="ts">
  import {
    DUKAT_CSV_HEADER,
    type Category,
    type CsvPreviewRow,
    type ImportBatch,
    type ImportDetail,
  } from '@dukat/core/csv-import'
  import type { Account } from '@dukat/core/ledger'
  import { Alert, Badge, Button, Card, Checkbox, Input, Label } from '@dukat/ui'
  let {
    accounts,
    categories,
    api,
    onchanged,
  }: {
    accounts: Account[]
    categories: Category[]
    api: <Response>(path: string, options?: RequestInit) => Promise<Response>
    onchanged: () => Promise<void>
  } = $props()
  type Choice = {
    include: boolean
    mode: 'existing' | 'create' | 'blank'
    categoryId: string
    createCategory: string
  }
  let accountId = $state(''),
    filename = $state(''),
    csv = $state(''),
    rows: CsvPreviewRow[] = $state([]),
    choices: Record<number, Choice> = $state({})
  let imports: ImportBatch[] = $state([]),
    detail: ImportDetail | null = $state(null),
    message = $state(''),
    pending = $state(false),
    inputKey = $state(0)
  let confirmIntentKey = $state('')
  let trashIntentKeys: Record<string, string> = $state({})
  let historyGeneration = 0
  let fileGeneration = 0
  let previewGeneration = 0
  let reviewedRequest: {
    filename: string
    accountId: string
    csv: string
  } | null = $state(null)
  const activeAccounts = $derived(accounts.filter((item) => !item.archivedAt))
  async function loadHistory() {
    const generation = ++historyGeneration
    const result = await api<ImportBatch[]>('')
    if (generation === historyGeneration) imports = result
  }
  $effect(() => {
    const accountCount = accounts.length
    void accountCount
    void loadHistory()
    if (!activeAccounts.some((a) => a.id === accountId))
      accountId = activeAccounts[0]?.id ?? ''
  })
  function download() {
    const url = URL.createObjectURL(
      new Blob([`${DUKAT_CSV_HEADER}\n`], { type: 'text/csv' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = 'dukat-import-template.csv'
    link.click()
    URL.revokeObjectURL(url)
  }
  function invalidatePreview() {
    previewGeneration++
    rows = []
    choices = {}
    reviewedRequest = null
    confirmIntentKey = ''
  }
  async function selectFile(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0]
    if (!file) return
    const generation = ++fileGeneration
    invalidatePreview()
    filename = ''
    csv = ''
    const contents = await file.text()
    if (generation !== fileGeneration) return
    filename = file.name
    csv = contents
  }
  async function preview() {
    const request = { filename, accountId, csv }
    const generation = ++previewGeneration
    await run(async () => {
      const result = await api<{ rows: CsvPreviewRow[] }>('/preview', {
        method: 'POST',
        body: JSON.stringify(request),
      })
      if (generation !== previewGeneration) return
      rows = result.rows
      reviewedRequest = request
      confirmIntentKey = crypto.randomUUID()
      choices = Object.fromEntries(
        rows.map((row) => [
          row.sourceRow,
          {
            include: row.selected && !row.errors.length,
            mode: row.categoryStatus === 'existing' ? 'existing' : 'blank',
            categoryId: row.categoryId ?? '',
            createCategory: row.category,
          },
        ]),
      )
    })
  }
  function payloadRows() {
    return rows.map((row) => {
      const choice = choices[row.sourceRow]!
      return {
        sourceRow: row.sourceRow,
        include: choice.include,
        duplicateAcknowledged: Boolean(row.duplicateReason && choice.include),
        ...(choice.mode === 'existing' && choice.categoryId
          ? { categoryId: choice.categoryId }
          : {}),
        ...(choice.mode === 'create'
          ? { createCategory: choice.createCategory.trim() }
          : {}),
      }
    })
  }
  async function confirmImport() {
    if (!reviewedRequest) return
    await run(async () => {
      const result = await api<ImportBatch & { count: number }>('/confirm', {
        method: 'POST',
        body: JSON.stringify({
          ...reviewedRequest,
          rows: payloadRows(),
          idempotencyKey: confirmIntentKey,
        }),
      })
      message = `Imported ${result.count} transactions from ${result.filename}.`
      reset(false)
      await Promise.all([loadHistory(), onchanged()])
    })
  }
  function reset(clearMessage = true) {
    rows = []
    choices = {}
    filename = ''
    csv = ''
    reviewedRequest = null
    confirmIntentKey = ''
    fileGeneration++
    previewGeneration++
    inputKey++
    if (clearMessage) message = ''
  }
  async function open(item: ImportBatch) {
    await run(async () => {
      detail = await api<ImportDetail>(`/${item.id}`)
    })
  }
  async function trash(item: ImportBatch) {
    if (!confirm(`Trash all active transactions from ${item.filename}?`)) return
    trashIntentKeys[item.id] ||= crypto.randomUUID()
    await run(async () => {
      const result = await api<{ trashed: number }>(`/${item.id}/trash`, {
        method: 'POST',
        body: JSON.stringify({ idempotencyKey: trashIntentKeys[item.id] }),
      })
      message = `Trashed ${result.trashed} imported transactions.`
      delete trashIntentKeys[item.id]
      detail = null
      await Promise.all([loadHistory(), onchanged()])
    })
  }
  async function run(operation: () => Promise<void>) {
    if (pending) return
    pending = true
    message = ''
    try {
      await operation()
    } catch (error) {
      message = (error as Error).message
    } finally {
      pending = false
    }
  }
</script>

<Card.Root class="mb-6"
  ><Card.Header
    ><Card.Title>CSV import</Card.Title><Card.Description
      >Columns: <code>{DUKAT_CSV_HEADER}</code>. Date is YYYY-MM-DD; kind is
      income or expense; amount is a positive decimal. UTF-8 CSV quoting is
      supported.</Card.Description
    ></Card.Header
  ><Card.Content class="flex flex-col gap-4">
    {#if message}<Alert.Root role="status" aria-live="polite"
        ><Alert.Description>{message}</Alert.Description></Alert.Root
      >{/if}
    <div class="flex flex-wrap items-end gap-2">
      <div>
        <Label for="import-account">Active account</Label><select
          id="import-account"
          class="block h-9 rounded-md border bg-transparent px-3"
          bind:value={accountId}
          onchange={invalidatePreview}
          ><option value="" disabled>Select account</option
          >{#each activeAccounts as account (account.id)}<option
              value={account.id}>{account.name} ({account.currency})</option
            >{/each}</select
        >
      </div>
      <div>
        <Label for="csv-file">CSV file</Label>{#key inputKey}<Input
            id="csv-file"
            type="file"
            accept=".csv,text/csv"
            onchange={selectFile}
          />{/key}
      </div>
      <Button variant="outline" onclick={download}>Download template</Button
      ><Button disabled={!accountId || !csv || pending} onclick={preview}
        >Preview</Button
      >{#if rows.length}<Button
          variant="outline"
          disabled={pending}
          onclick={() => reset()}>Reset</Button
        >{/if}
    </div>
    {#if rows.length}<div class="overflow-x-auto">
        <table class="w-full min-w-[900px] text-sm">
          <thead
            ><tr class="border-b text-left"
              ><th>Use</th><th>Row / status</th><th>Date</th><th>Kind</th><th
                >Amount</th
              ><th>Description</th><th>Category resolution</th></tr
            ></thead
          ><tbody
            >{#each rows as row (row.sourceRow)}<tr class="border-b align-top"
                ><td class="py-2"
                  ><Checkbox
                    aria-label={`Select row ${row.sourceRow}`}
                    bind:checked={choices[row.sourceRow].include}
                    disabled={row.errors.length > 0}
                  /></td
                ><td
                  >#{row.sourceRow}<br />{#if row.errors.length}<span
                      class="text-destructive"
                      >Invalid: {row.errors.join('; ')}</span
                    >{:else}<Badge variant="secondary">Valid</Badge
                    >{/if}{#if row.duplicateReason}<br /><span
                      class="text-muted-foreground"
                      >Duplicate warning: {row.duplicateReason}</span
                    >{/if}</td
                ><td>{row.date}</td><td>{row.kind}</td><td>{row.amount}</td><td
                  >{row.description}</td
                ><td
                  >{#if row.categoryStatus === 'existing'}<select
                      aria-label={`Category resolution row ${row.sourceRow}`}
                      bind:value={choices[row.sourceRow].categoryId}
                      >{#each categories.filter((item) => !item.archivedAt) as category (category.id)}<option
                          value={category.id}>Match {category.name}</option
                        >{/each}<option value="">Leave blank</option></select
                    >{:else}<select
                      aria-label={`Category resolution row ${row.sourceRow}`}
                      bind:value={choices[row.sourceRow].mode}
                      ><option value="blank">Leave blank</option><option
                        value="existing">Match active category</option
                      >{#if row.category}<option value="create"
                          >Create category</option
                        >{/if}</select
                    >{#if choices[row.sourceRow].mode === 'existing'}<select
                        bind:value={choices[row.sourceRow].categoryId}
                        ><option value="">Choose…</option
                        >{#each categories.filter((item) => !item.archivedAt) as category (category.id)}<option
                            value={category.id}>{category.name}</option
                          >{/each}</select
                      >{:else if choices[row.sourceRow].mode === 'create'}<Input
                        aria-label={`New category row ${row.sourceRow}`}
                        bind:value={choices[row.sourceRow].createCategory}
                        maxlength={120}
                      />{/if}{/if}</td
                ></tr
              >{/each}</tbody
          >
        </table>
      </div>
      <Button
        disabled={pending ||
          !reviewedRequest ||
          !rows.some((row) => choices[row.sourceRow].include)}
        onclick={confirmImport}>Confirm selected rows</Button
      >{/if}
    <div>
      <h3 class="mb-2 font-semibold">Import history</h3>
      {#if imports.length === 0}<p class="text-sm text-muted-foreground">
          No imports yet.
        </p>{/if}{#each imports as item (item.id)}<div
          class="flex flex-wrap items-center justify-between gap-2 border-b py-2"
        >
          <span
            ><b>{item.filename}</b> · {new Date(
              item.createdAt,
            ).toLocaleString()} · actor {item.actorUserId ?? 'unavailable'}
            {item.trashedAt ? '· trashed' : ''}</span
          >
          <div>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onclick={() => open(item)}>Details</Button
            >
            {#if !item.trashedAt}<Button
                size="sm"
                variant="destructive"
                disabled={pending}
                onclick={() => trash(item)}>Trash batch</Button
              >{/if}
          </div>
        </div>{/each}
    </div>
    {#if detail}<div class="rounded border p-3">
        <div class="flex justify-between">
          <h3 class="font-semibold">{detail.filename} details</h3>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onclick={() => (detail = null)}>Close</Button
          >
        </div>
        <p class="text-sm">Source rows and resulting transactions</p>
        {#each detail.transactions ?? [] as transaction (transaction.id)}<div
            class="border-t py-2 text-sm"
          >
            Row {transaction.importSourceRow ?? '—'} · {transaction.date} · {transaction.kind}
            · {transaction.amountMinor} · {transaction.description ||
              'No description'}
            {transaction.trashedAt ? '· trashed' : ''}
          </div>{/each}
      </div>{/if}
  </Card.Content></Card.Root
>
