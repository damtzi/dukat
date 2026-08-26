import { redirect } from '@sveltejs/kit'
import type { PageLoad } from './$types'

export const load: PageLoad = ({ params }) => {
  redirect(
    307,
    `/workspaces/${params.workspaceId}/accounts/${params.accountId}/activity`,
  )
}
