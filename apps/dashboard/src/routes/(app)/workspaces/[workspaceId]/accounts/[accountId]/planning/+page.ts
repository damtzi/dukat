import { redirect } from '@sveltejs/kit'
import type { PageLoad } from './$types'

export const load: PageLoad = ({ params, url }) => {
  const query =
    url.searchParams.get('includeTentative') === 'true'
      ? '?includeTentative=true'
      : ''
  redirect(
    307,
    `/workspaces/${params.workspaceId}/accounts/${params.accountId}/activity${query}#recurring`,
  )
}
