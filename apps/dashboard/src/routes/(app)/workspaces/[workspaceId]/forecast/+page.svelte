<script lang="ts">
  import { resolve } from '$app/paths'
  import { Alert, Button, Card, Empty } from '@dukat/ui'
  import PageHeader from '$lib/components/dashboard/PageHeader.svelte'
  import WorkspaceForecastChart from '$lib/components/forecast/WorkspaceForecastChart.svelte'
  import { getWorkspaceDashboardContext } from '$lib/components/dashboard/WorkspaceDashboardContext'
  import { lowestProjectedBalance } from '$lib/forecast'
  import { formatMoney } from '$lib/money'
  import type { PageProps } from './$types'

  let { data }: PageProps = $props()
  const { workspace } = getWorkspaceDashboardContext()
  let currency = $derived(data.expected?.reportingCurrency ?? '')
  let lowestExpected = $derived(
    data.expected ? lowestProjectedBalance(data.expected) : null,
  )
  let planningAccount = $derived(
    workspace.accounts.find(({ archivedAt }) => !archivedAt) ??
      workspace.accounts[0] ??
      null,
  )
  let managePlansPath = $derived(
    planningAccount
      ? resolve(
          '/(app)/workspaces/[workspaceId]/accounts/[accountId]/planning',
          {
            workspaceId: workspace.workspaceId,
            accountId: planningAccount.id,
          },
        )
      : resolve('/(app)/workspaces/[workspaceId]/accounts', {
          workspaceId: workspace.workspaceId,
        }),
  )
</script>

<svelte:head><title>Forecast · Dukat</title></svelte:head>

<section class="flex flex-col gap-6" aria-labelledby="forecast-title">
  <PageHeader
    id="forecast-title"
    title="Forecast"
    description="Projections use current balances and unmatched plans over the next 12 months. They are estimates, not guaranteed future amounts."
  />

  {#if data.forecastError}
    <Alert.Root>
      <Alert.Title>Forecast unavailable</Alert.Title>
      <Alert.Description>{data.forecastError}</Alert.Description>
    </Alert.Root>
  {:else if data.expected?.missingRate || data.tentative?.missingRate}
    <div class="flex flex-col gap-6">
      <Empty.Root>
        <Empty.Header>
          <Empty.Title>Combined forecast unavailable</Empty.Title>
          <Empty.Description>
            An exchange rate is missing, so Dukat will not estimate a combined
            forecast. Account balances and plans remain available in their
            original currencies.
          </Empty.Description>
        </Empty.Header>
        <Empty.Content>
          <Button
            href={resolve('/(app)/workspaces/[workspaceId]/rates', {
              workspaceId: workspace.workspaceId,
            })}>Review exchange rates</Button
          >
        </Empty.Content>
      </Empty.Root>
      {#if data.tentative?.accounts.length}
        <Card.Root>
          <Card.Header>
            <Card.Title>Original-currency account forecasts</Card.Title>
            <Card.Description>
              Known account values remain available without combining
              currencies. Projected balances include Expected and Tentative
              plans.
            </Card.Description>
          </Card.Header>
          <Card.Content class="grid gap-3 sm:grid-cols-2">
            {#each data.tentative.accounts as forecast (forecast.id)}
              {@const account = workspace.accounts.find(
                ({ id }) => id === forecast.id,
              )}
              <div class="inset-panel flex flex-col gap-3">
                <div>
                  <strong>{account?.name ?? 'Unavailable account'}</strong>
                  <p class="text-sm text-muted-foreground">
                    Current balance
                    {formatMoney(
                      forecast.currentBalanceMinor,
                      forecast.currency,
                    )}
                  </p>
                  <p class="text-sm text-muted-foreground">
                    Projected balance
                    {formatMoney(
                      forecast.endingBalanceMinor,
                      forecast.currency,
                    )}
                  </p>
                </div>
                <Button
                  variant="outline"
                  href={resolve(
                    '/(app)/workspaces/[workspaceId]/accounts/[accountId]/planning',
                    {
                      workspaceId: workspace.workspaceId,
                      accountId: forecast.id,
                    },
                  )}>Manage plans</Button
                >
              </div>
            {/each}
          </Card.Content>
        </Card.Root>
      {/if}
    </div>
  {:else if data.expected && data.tentative && data.tentative.occurrences.length === 0}
    <Empty.Root>
      <Empty.Header>
        <Empty.Title>No planned transactions</Empty.Title>
        <Empty.Description>
          Create or manage a planned transaction in account planning to build a
          12-month forecast.
        </Empty.Description>
      </Empty.Header>
      <Empty.Content>
        <Button href={managePlansPath}>Manage planned transactions</Button>
      </Empty.Content>
    </Empty.Root>
  {:else if data.expected && data.tentative && currency && lowestExpected !== null}
    <div class="grid gap-4 sm:grid-cols-3">
      <Card.Root>
        <Card.Header>
          <Card.Description>Current balance</Card.Description>
          <Card.Title>
            {formatMoney(data.expected.startingBalanceMinor!, currency)}
          </Card.Title>
        </Card.Header>
        <Card.Content>
          <p class="text-sm text-muted-foreground">Across this workspace</p>
        </Card.Content>
      </Card.Root>
      <Card.Root>
        <Card.Header>
          <Card.Description>Projected balance</Card.Description>
          <Card.Title>
            {formatMoney(data.expected.endingBalanceMinor!, currency)}
          </Card.Title>
        </Card.Header>
        <Card.Content>
          <p class="text-sm text-muted-foreground">
            Expected scenario after 12 months
          </p>
        </Card.Content>
      </Card.Root>
      <Card.Root>
        <Card.Header>
          <Card.Description>Lowest projected balance</Card.Description>
          <Card.Title>{formatMoney(lowestExpected, currency)}</Card.Title>
        </Card.Header>
        <Card.Content>
          <p class="text-sm text-muted-foreground">
            Lowest Expected point during the period
          </p>
        </Card.Content>
      </Card.Root>
    </div>

    <WorkspaceForecastChart
      expected={data.expected}
      tentative={data.tentative}
      plans={data.plans}
      accounts={workspace.accounts}
      workspaceId={workspace.workspaceId}
    />
  {/if}
</section>
