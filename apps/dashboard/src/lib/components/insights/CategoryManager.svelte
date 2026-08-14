<script lang="ts">
  import { SvelteMap } from 'svelte/reactivity'
  import type { Category } from '@dukat/core/csv-import'
  import { Alert, Button, Card, Input, Label } from '@dukat/ui'
  let {
    categories,
    api,
    onchanged,
  }: {
    categories: Category[]
    api: (path: string, options?: RequestInit) => Promise<unknown>
    onchanged: () => Promise<void>
  } = $props()
  let message = $state('')
  let pending = $state(false)
  type Intent = { signature: string; key: string }
  let createIntent: Intent | null = null
  const renameIntents = new SvelteMap<string, Intent>()
  const actionIntents = new SvelteMap<string, Intent>()
  const retainedIntent = (
    current: Intent | undefined | null,
    signature: string,
  ) =>
    current?.signature === signature
      ? current
      : { signature, key: crypto.randomUUID() }
  const groups = $derived([
    {
      title: 'Active categories',
      items: categories.filter((item) => !item.archivedAt),
    },
    {
      title: 'Archived categories',
      items: categories.filter((item) => item.archivedAt),
    },
  ])
  async function create(event: SubmitEvent) {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    const name = String(new FormData(form).get('name') ?? '').trim()
    createIntent = retainedIntent(createIntent, name)
    if (
      await act(() =>
        api('', {
          method: 'POST',
          body: JSON.stringify({ name, idempotencyKey: createIntent!.key }),
        }),
      )
    ) {
      createIntent = null
      form.reset()
    }
  }
  async function rename(category: Category) {
    const next = prompt('Category name', category.name)
    const name = next?.trim()
    if (name && name !== category.name) {
      const signature = `${category.version}:${name}`
      const intent = retainedIntent(renameIntents.get(category.id), signature)
      renameIntents.set(category.id, intent)
      if (
        await act(() =>
          api(`/${category.id}`, {
            method: 'PUT',
            body: JSON.stringify({
              name,
              version: category.version,
              idempotencyKey: intent.key,
            }),
          }),
        )
      )
        renameIntents.delete(category.id)
    }
  }
  async function action(
    category: Category,
    value: 'delete' | 'archive' | 'restore',
  ) {
    if (
      value === 'delete' &&
      !confirm(`Delete ${category.name}? Used categories cannot be deleted.`)
    )
      return
    const intentId = `${category.id}:${value}`
    const signature = `${category.version}:${value}`
    const intent = retainedIntent(actionIntents.get(intentId), signature)
    actionIntents.set(intentId, intent)
    if (
      await act(() =>
        api(`/${category.id}/${value}`, {
          method: 'POST',
          body: JSON.stringify({
            version: category.version,
            idempotencyKey: intent.key,
          }),
        }),
      )
    )
      actionIntents.delete(intentId)
  }
  async function act(operation: () => Promise<unknown>) {
    pending = true
    message = ''
    try {
      await operation()
      await onchanged()
      return true
    } catch (error) {
      message = (error as Error).message
      return false
    } finally {
      pending = false
    }
  }
</script>

<Card.Root class="mb-6"
  ><Card.Header
    ><Card.Title>Categories</Card.Title><Card.Description
      >Organize transactions. Archive categories that are already in use.</Card.Description
    ></Card.Header
  ><Card.Content class="flex flex-col gap-4">
    {#if message}<Alert.Root variant="destructive"
        ><Alert.Description>{message}</Alert.Description></Alert.Root
      >{/if}
    <form class="flex items-end gap-2" onsubmit={create}>
      <div class="grow">
        <Label for="category-name">New category</Label><Input
          id="category-name"
          name="name"
          oninput={() => (createIntent = null)}
          maxlength={120}
          required
        />
      </div>
      <Button type="submit" disabled={pending}>Create</Button>
    </form>
    <div class="grid gap-4 md:grid-cols-2">
      {#each groups as group (group.title)}
        <div>
          <h3 class="mb-2 font-semibold">{group.title}</h3>
          {#if group.items.length === 0}<p
              class="text-sm text-muted-foreground"
            >
              None
            </p>{/if}
          {#each group.items as category (category.id)}<div
              class="flex flex-wrap items-center justify-between gap-2 border-b py-2"
            >
              <span>{category.name}</span>
              <div class="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onclick={() => rename(category)}>Rename</Button
                >{#if category.archivedAt}<Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onclick={() => action(category, 'restore')}>Restore</Button
                  >{:else}<Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onclick={() => action(category, 'archive')}>Archive</Button
                  ><Button
                    size="sm"
                    variant="destructive"
                    disabled={pending}
                    onclick={() => action(category, 'delete')}>Delete</Button
                  >{/if}
              </div>
            </div>{/each}
        </div>
      {/each}
    </div>
  </Card.Content></Card.Root
>
