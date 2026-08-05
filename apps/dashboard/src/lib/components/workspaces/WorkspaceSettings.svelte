<script lang="ts">
  /* eslint-disable svelte/require-each-key */
  import { Alert, Button, Card, Input, Label } from '@dukat/ui'

  type Workspace = {
    id: string
    name: string
    reportingCurrency: string | null
    version: number
    role: 'owner' | 'member' | null
  }
  type Member = {
    userId: string
    name: string
    email: string
    role: 'owner' | 'member'
  }
  type Invitation = { id: string; email: string; expiresAt: string }
  let {
    workspace,
    onchanged,
  }: { workspace: Workspace; onchanged: () => Promise<void> } = $props()
  let members: Member[] = $state([])
  let invitations: Invitation[] = $state([])
  let confirmation = $state('')
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
    error = ''
    try {
      members = await request(`/workspaces/${workspace.id}/members`)
      invitations =
        workspace.role === 'owner'
          ? await request(`/workspaces/${workspace.id}/invitations`)
          : []
    } catch (cause) {
      error = (cause as Error).message
    }
  }
  async function act(
    path: string,
    body: object = { version: workspace.version },
  ) {
    if (pending) return
    pending = true
    error = ''
    try {
      await request(path, { method: 'POST', body: JSON.stringify(body) })
      await onchanged()
      await load()
      return true
    } catch (cause) {
      error = (cause as Error).message
      return false
    } finally {
      pending = false
    }
  }
  async function save(event: SubmitEvent) {
    event.preventDefault()
    const data = new FormData(event.currentTarget as HTMLFormElement)
    pending = true
    error = ''
    try {
      await request(`/workspaces/${workspace.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          version: workspace.version,
          name: String(data.get('name') ?? '').trim(),
          reportingCurrency: String(
            data.get('reportingCurrency') ?? '',
          ).toUpperCase(),
        }),
      })
      await onchanged()
    } catch (cause) {
      error = (cause as Error).message
    } finally {
      pending = false
    }
  }
  async function invite(event: SubmitEvent) {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    const data = new FormData(form)
    if (
      await act(`/workspaces/${workspace.id}/invitations`, {
        version: workspace.version,
        email: String(data.get('email') ?? '').trim(),
      })
    )
      form.reset()
  }
  $effect(() => {
    const id = workspace.id
    if (id) void load()
  })
</script>

<Card.Root class="mb-6">
  <Card.Header
    ><Card.Title>Household settings</Card.Title><Card.Description
      >Manage this household and its members.</Card.Description
    ></Card.Header
  >
  <Card.Content class="space-y-5">
    {#if error}<Alert.Root variant="destructive"
        ><Alert.Title>Household action failed</Alert.Title><Alert.Description
          >{error}</Alert.Description
        ></Alert.Root
      >{/if}
    <section aria-labelledby="members-title">
      <h3 id="members-title" class="font-semibold">Members</h3>
      {#if members.length === 0}<p class="text-sm text-muted-foreground">
          Loading members…
        </p>{/if}
      {#each members as member}<div
          class="flex flex-wrap items-center justify-between gap-2 border-b py-2"
        >
          <span>{member.name} ({member.email}) — {member.role}</span>
          {#if workspace.role === 'owner'}<span class="flex gap-2"
              ><Button
                size="sm"
                variant="outline"
                disabled={pending}
                onclick={() =>
                  act(
                    `/workspaces/${workspace.id}/members/${member.userId}/${member.role === 'owner' ? 'demote' : 'promote'}`,
                  )}>{member.role === 'owner' ? 'Demote' : 'Promote'}</Button
              ><Button
                size="sm"
                variant="outline"
                disabled={pending}
                onclick={() =>
                  act(
                    `/workspaces/${workspace.id}/members/${member.userId}/remove`,
                  )}>Remove</Button
              ></span
            >{/if}
        </div>
      {/each}
      <Button
        class="mt-3"
        variant="outline"
        disabled={pending}
        onclick={() => act(`/workspaces/${workspace.id}/leave`)}
        >Leave household</Button
      >
    </section>
    {#if workspace.role === 'owner'}
      <form class="space-y-2" onsubmit={save}>
        <h3 class="font-semibold">Details</h3>
        <Label for="household-name">Household name</Label><Input
          id="household-name"
          name="name"
          value={workspace.name}
          required
        /><Label for="household-currency">Reporting currency</Label><Input
          id="household-currency"
          name="reportingCurrency"
          value={workspace.reportingCurrency ?? ''}
          minlength={3}
          maxlength={3}
          pattern={'[A-Za-z]{3}'}
          required
        /><Button type="submit" disabled={pending}>Save household</Button>
      </form>
      <form class="space-y-2" onsubmit={invite}>
        <h3 class="font-semibold">Invite member</h3>
        <Label for="invite-email">Email</Label><Input
          id="invite-email"
          name="email"
          type="email"
          required
        /><Button type="submit" disabled={pending}>Send invitation</Button>
      </form>
      <section>
        <h3 class="font-semibold">Pending invitations</h3>
        {#if invitations.length === 0}<p class="text-sm text-muted-foreground">
            No pending invitations.
          </p>{/if}{#each invitations as invitation}<div
            class="flex flex-wrap items-center justify-between gap-2 border-b py-2"
          >
            <span
              >{invitation.email} — expires {new Date(
                invitation.expiresAt,
              ).toLocaleDateString()}</span
            ><span class="flex gap-2"
              ><Button
                size="sm"
                variant="outline"
                onclick={() =>
                  act(
                    `/workspaces/${workspace.id}/invitations/${invitation.id}/resend`,
                  )}>Resend</Button
              ><Button
                size="sm"
                variant="outline"
                onclick={() =>
                  act(
                    `/workspaces/${workspace.id}/invitations/${invitation.id}/revoke`,
                  )}>Revoke</Button
              ></span
            >
          </div>{/each}
      </section>
      <form
        class="space-y-2 rounded-md border border-destructive p-3"
        onsubmit={(event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget as HTMLFormElement)
          void act(`/workspaces/${workspace.id}/delete`, {
            version: workspace.version,
            password: String(data.get('password') ?? ''),
            confirmation,
            idempotencyKey: crypto.randomUUID(),
          })
        }}
      >
        <h3 class="font-semibold">Delete household</h3>
        <p class="text-sm">
          This removes the household. It can be restored for a limited time.
        </p>
        <Label for="delete-confirmation">Type “{workspace.name}”</Label><Input
          id="delete-confirmation"
          bind:value={confirmation}
          required
        /><Label for="delete-password">Current password</Label><Input
          id="delete-password"
          name="password"
          type="password"
          autocomplete="current-password"
          required
        /><Button
          type="submit"
          variant="destructive"
          disabled={pending || confirmation !== workspace.name}
          >Delete household</Button
        >
      </form>
    {/if}
  </Card.Content>
</Card.Root>
