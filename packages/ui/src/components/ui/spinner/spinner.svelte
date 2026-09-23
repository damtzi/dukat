<script lang="ts">
	import { cn } from '#lib/utils.js';
	import type { SVGAttributes } from 'svelte/elements';

	let {
		class: className,
		role = 'status',
		// we add name, color, and stroke for compatibility with different icon libraries props
		name,
		color,
		stroke,
		'aria-label': ariaLabel = 'Loading',
		...restProps
	}: SVGAttributes<SVGSVGElement> = $props();
</script>

<svg
	{role}
	name={name === null ? undefined : name}
	color={color === null ? undefined : color}
	stroke={stroke === null ? undefined : (stroke ?? 'currentColor')}
	aria-label={ariaLabel}
	class={cn('size-4 motion-safe:animate-spin', className)}
	viewBox="0 0 24 24"
	fill="none"
	{...restProps}
>
	<circle cx="12" cy="12" r="9" stroke-width="2" opacity="0.2" />
	<path d="M12 3a9 9 0 0 1 9 9" stroke-width="2" stroke-linecap="round" />
</svg>
