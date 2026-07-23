<script lang="ts">
  import { onMount } from 'svelte'
  import { messages } from '$lib/messages'

  type FormSubmitEvent = { preventDefault(): void }

  let token = ''
  let password = ''
  let submitting = false
  let message = ''
  let error = ''

  onMount(() => {
    token =
      new globalThis.URLSearchParams(globalThis.location.search).get('token') ??
      ''
    if (!token) error = messages.recovery.invalidLink
  })

  async function reset(event: FormSubmitEvent) {
    event.preventDefault()
    submitting = true
    error = ''
    const response = await globalThis.fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, newPassword: password }),
    })
    if (response.ok) message = messages.recovery.success
    else error = messages.recovery.invalidLink
    submitting = false
  }
</script>

<svelte:head
  ><title>{messages.resetPassword} — {messages.brand}</title></svelte:head
>

<main>
  <a href="/" class="wordmark">{messages.brand}<span>.</span></a>
  <section>
    <p>{messages.recovery.eyebrow}</p>
    <h1>{messages.resetPassword}</h1>
    <form onsubmit={reset}>
      <label
        >{messages.recovery.newPassword}<input
          bind:value={password}
          type="password"
          autocomplete="new-password"
          minlength="8"
          required
        /></label
      >
      {#if error}<div class="error" role="alert">{error}</div>{/if}
      {#if message}<div role="status">
          {message} <a href="/">{messages.recovery.returnToSignIn}</a>
        </div>{/if}
      <button disabled={submitting || !token}
        >{submitting
          ? messages.auth.pleaseWait
          : messages.recovery.setPassword}</button
      >
    </form>
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #f0eadc;
    color: #14241d;
    font-family: 'Avenir Next', 'Trebuchet MS', sans-serif;
  }
  main {
    min-height: 100vh;
    padding: 2rem clamp(1.25rem, 6vw, 6rem);
  }
  .wordmark {
    color: inherit;
    text-decoration: none;
    font:
      700 1.6rem 'Iowan Old Style',
      serif;
  }
  .wordmark span,
  section > p {
    color: #b43a2c;
  }
  section {
    max-width: 36rem;
    margin: 16vh auto 0;
  }
  section > p {
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-size: 0.65rem;
  }
  h1 {
    font:
      400 clamp(3.5rem, 8vw, 6rem)/1 'Iowan Old Style',
      serif;
    letter-spacing: -0.04em;
  }
  form,
  label {
    display: grid;
    gap: 1rem;
  }
  label {
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: 0.65rem;
    font-weight: 700;
  }
  input {
    border: 0;
    border-bottom: 1px solid #14241d;
    background: transparent;
    padding: 0.8rem 0;
    font: 1rem inherit;
    outline: none;
  }
  button {
    margin-top: 1rem;
    padding: 1rem;
    border: 0;
    background: #14241d;
    color: #f0eadc;
    cursor: pointer;
  }
  .error {
    color: #8d251c;
    border-left: 2px solid #b43a2c;
    padding-left: 1rem;
  }
  a {
    color: #b43a2c;
  }
</style>
