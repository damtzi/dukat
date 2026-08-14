<script lang="ts">
  import { Alert, Button, Card, Input, Label } from '@dukat/ui'

  type ManualRate = {
    id: string
    currency: string
    rateToPln: string
    effectiveDate: string
    reason: string
    actorDisplay: string
    removedAt: string | null
  }
  let {
    workspaceId,
    onchanged,
  }: { workspaceId: string; onchanged: () => Promise<void> } = $props()
  let rates: ManualRate[] = $state([])
  let error = $state('')
  let pending = $state(false)

  async function request(path: string, options?: RequestInit) {
    const response = await fetch(`/api${path}`, {
      ...options,
      headers: { 'content-type': 'application/json' },
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok)
      throw new Error(body.message || `Request failed (${response.status}).`)
    return body
  }
  async function load() {
    try {
      rates = await request(`/workspaces/${workspaceId}/rates`)
      error = ''
    } catch (cause) {
      error = (cause as Error).message
    }
  }
  async function add(event: SubmitEvent) {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    const data = new FormData(form)
    pending = true
    try {
      await request(`/workspaces/${workspaceId}/rates/manual`, {
        method: 'POST',
        body: JSON.stringify({
          currency: String(data.get('currency') ?? '').toUpperCase(),
          rateToPln: String(data.get('rateToPln') ?? ''),
          effectiveDate: String(data.get('effectiveDate') ?? ''),
          reason: String(data.get('reason') ?? '').trim(),
        }),
      })
      form.reset()
      await load()
      await onchanged()
    } catch (cause) {
      error = (cause as Error).message
    } finally {
      pending = false
    }
  }
  async function remove(id: string) {
    pending = true
    try {
      await request(`/workspaces/${workspaceId}/rates/manual/${id}`, {
        method: 'DELETE',
      })
      await load()
      await onchanged()
    } catch (cause) {
      error = (cause as Error).message
    } finally {
      pending = false
    }
  }
  $effect(() => {
    if (workspaceId) void load()
  })
</script>

<Card.Root class="mb-6">
  <Card.Header
    ><Card.Title>Manual exchange rates</Card.Title><Card.Description
      >A manual rate replaces NBP data from its effective date until a newer
      rate applies. One foreign currency unit equals this PLN value.</Card.Description
    ></Card.Header
  >
  <Card.Content class="flex flex-col gap-2">
    {#if error}<Alert.Root variant="destructive"
        ><Alert.Title>Exchange-rate action failed</Alert.Title
        ><Alert.Description>{error}</Alert.Description></Alert.Root
      >{/if}
    <form class="grid gap-2 md:grid-cols-2" onsubmit={add}>
      <div>
        <Label for="rate-currency">Currency</Label><Input
          id="rate-currency"
          name="currency"
          minlength={3}
          maxlength={3}
          pattern={'[A-Za-z]{3}'}
          required
        />
      </div>
      <div>
        <Label for="rate-value">Rate to PLN</Label><Input
          id="rate-value"
          name="rateToPln"
          inputmode="decimal"
          placeholder="4.1234"
          required
        />
      </div>
      <div>
        <Label for="rate-date">Effective date</Label><Input
          id="rate-date"
          name="effectiveDate"
          type="date"
          required
        />
      </div>
      <div>
        <Label for="rate-reason">Reason</Label><Input
          id="rate-reason"
          name="reason"
          minlength={3}
          maxlength={500}
          required
        />
      </div>
      <Button type="submit" disabled={pending}>Add manual rate</Button>
    </form>
    {#if rates.length === 0}<p class="text-sm text-muted-foreground">
        No manual rates.
      </p>{/if}
    {#each rates as rate (rate.id)}<div
        class="flex flex-wrap justify-between gap-2 border-t py-2 text-sm"
      >
        <span
          ><b>{rate.currency} {rate.rateToPln} PLN</b> from {rate.effectiveDate}
          — {rate.reason} · {rate.actorDisplay}{rate.removedAt
            ? ' · removed'
            : ''}</span
        >{#if !rate.removedAt}<Button
            size="sm"
            variant="outline"
            disabled={pending}
            onclick={() => remove(rate.id)}>Remove</Button
          >{/if}
      </div>{/each}
  </Card.Content>
</Card.Root>
