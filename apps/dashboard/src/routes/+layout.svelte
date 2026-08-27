<script lang="ts">
  import '../app.css'
  import { Toaster } from '@dukat/ui'

  let { children } = $props()
</script>

<Toaster />
{@render children()}
