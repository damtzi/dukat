<script lang="ts">
	import { Button } from '@dukat/ui';
	import { messages } from '$lib/i18n';
</script>

<svelte:head>
	<title>Dukat</title>
</svelte:head>

<main class="min-h-screen bg-background text-foreground">
	<section class="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-20">
		<p class="text-sm font-semibold tracking-[0.3em] text-muted-foreground uppercase">Dukat</p>
		<h1 class="mt-6 text-5xl font-bold tracking-tight">{messages.en.dashboard.title}</h1>
		<p class="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">
			{messages.en.dashboard.description}
		</p>
		<div class="mt-8">
			<Button variant="outline">Sign in</Button>
		</div>
	</section>
</main>
