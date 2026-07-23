<script lang="ts">
  import { onMount } from 'svelte'
  import { messages } from '$lib/messages'

  type Mode = 'sign-in' | 'sign-up' | 'forgot'
  type FormSubmitEvent = { preventDefault(): void }
  type Workspace = { id: string; name: string; type: 'personal' | 'household' }

  let mode: Mode = 'sign-in'
  let loading = true
  let submitting = false
  let notice = ''
  let error = ''
  let name = ''
  let email = ''
  let password = ''
  let user: { name: string; email: string } | null = null
  let workspaces: Workspace[] = []

  onMount(loadSession)

  async function loadSession() {
    const response = await globalThis.fetch('/api/auth/get-session', {
      credentials: 'include',
    })
    if (response.ok) {
      const body = await response.json()
      user = body?.user ?? null
      if (user) {
        const workspaceResponse = await globalThis.fetch('/api/workspaces', {
          credentials: 'include',
        })
        if (workspaceResponse.ok)
          workspaces = (await workspaceResponse.json()).workspaces
      }
    }
    loading = false
  }

  function selectMode(nextMode: Mode) {
    mode = nextMode
    error = ''
    notice = ''
  }

  async function submit(event: FormSubmitEvent) {
    event.preventDefault()
    submitting = true
    error = ''
    notice = ''
    try {
      if (mode === 'forgot') {
        await globalThis.fetch('/api/auth/request-password-reset', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, redirectTo: '/reset-password' }),
        })
        notice = messages.checkEmailReset
        return
      }

      const response = await globalThis.fetch(
        mode === 'sign-up'
          ? '/api/auth/sign-up/email'
          : '/api/auth/sign-in/email',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            ...(mode === 'sign-up' ? { name } : {}),
            email,
            password,
          }),
        },
      )
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.message ?? messages.genericError)
      }
      if (mode === 'sign-up') {
        notice = messages.checkEmailVerification
        mode = 'sign-in'
      } else {
        await loadSession()
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : messages.genericError
    } finally {
      submitting = false
    }
  }

  async function signOut() {
    await globalThis.fetch('/api/auth/sign-out', {
      method: 'POST',
      credentials: 'include',
    })
    user = null
    workspaces = []
  }
</script>

<svelte:head>
  <title>{messages.meta.title}</title>
  <meta name="description" content={messages.meta.description} />
</svelte:head>

<main class="shell">
  <header class="masthead">
    <a class="wordmark" href="/"
      >{messages.brand}<span aria-hidden="true">.</span></a
    >
    <p>{messages.masthead}</p>
  </header>

  {#if loading}
    <section class="loading" aria-live="polite">{messages.loading}</section>
  {:else if user}
    <section class="dashboard">
      <div class="edition">
        {messages.dashboard.edition(
          new Intl.DateTimeFormat('pl-PL', { dateStyle: 'long' }).format(
            new Date(),
          ),
        )}
      </div>
      <div class="dashboard-head">
        <div>
          <p class="eyebrow">{messages.dashboard.heading}</p>
          <h1>{messages.dashboard.greeting(user.name)}</h1>
        </div>
        <button class="text-button" type="button" onclick={signOut}
          >{messages.signOut} ↗</button
        >
      </div>
      <div class="workspace-grid">
        {#each workspaces as workspace (workspace.id)}
          <article class="workspace-card">
            <span>{messages.dashboard.workspaceNumber}</span>
            <p>{workspace.type}</p>
            <h2>{workspace.name}</h2>
            <div class="rule"></div>
            <small>{messages.dashboard.workspacePlaceholder}</small>
          </article>
        {:else}
          <p>{messages.dashboard.emptyWorkspace}</p>
        {/each}
      </div>
    </section>
  {:else}
    <section class="auth-layout">
      <div class="manifesto">
        <p class="eyebrow">{messages.auth.eyebrow}</p>
        <h1>{messages.tagline}</h1>
        <p class="intro">{messages.auth.intro}</p>
        <div class="seal" aria-hidden="true">
          <span>D</span><small>PLN</small>
        </div>
      </div>

      <div class="auth-panel">
        <nav aria-label={messages.auth.optionsLabel}>
          <button
            class:active={mode === 'sign-in'}
            type="button"
            onclick={() => selectMode('sign-in')}>{messages.signIn}</button
          >
          <button
            class:active={mode === 'sign-up'}
            type="button"
            onclick={() => selectMode('sign-up')}>{messages.signUp}</button
          >
        </nav>
        <div class="form-heading">
          <span
            >{mode === 'forgot' ? '03' : mode === 'sign-up' ? '02' : '01'}</span
          >
          <h2>
            {mode === 'forgot'
              ? messages.resetPassword
              : mode === 'sign-up'
                ? messages.signUp
                : messages.signIn}
          </h2>
        </div>
        <form onsubmit={submit}>
          {#if mode === 'sign-up'}
            <label
              >{messages.auth.fullName}<input
                bind:value={name}
                name="name"
                autocomplete="name"
                required
              /></label
            >
          {/if}
          <label
            >{messages.auth.emailAddress}<input
              bind:value={email}
              name="email"
              type="email"
              autocomplete="email"
              required
            /></label
          >
          {#if mode !== 'forgot'}
            <label
              >{messages.auth.password}<input
                bind:value={password}
                name="password"
                type="password"
                autocomplete={mode === 'sign-up'
                  ? 'new-password'
                  : 'current-password'}
                minlength="8"
                required
              /></label
            >
          {/if}
          {#if error}<p class="message error" role="alert">{error}</p>{/if}
          {#if notice}<p class="message" role="status">{notice}</p>{/if}
          <button class="submit" disabled={submitting}
            >{submitting
              ? messages.auth.pleaseWait
              : mode === 'forgot'
                ? messages.auth.sendResetLink
                : mode === 'sign-up'
                  ? messages.auth.createLedger
                  : messages.auth.openLedger}<span>→</span></button
          >
        </form>
        {#if mode === 'sign-in'}
          <button
            class="forgot"
            type="button"
            onclick={() => selectMode('forgot')}
            >{messages.forgotPassword}</button
          >
        {:else if mode === 'forgot'}
          <button
            class="forgot"
            type="button"
            onclick={() => selectMode('sign-in')}
            >{messages.auth.backToSignIn}</button
          >
        {/if}
      </div>
    </section>
  {/if}
</main>

<style>
  :global(:root) {
    --paper: #f0eadc;
    --ink: #14241d;
    --red: #b43a2c;
    --line: #b9b29f;
    --faded: #667067;
  }
  :global(body) {
    background: var(--paper);
    color: var(--ink);
  }
  :global(button),
  :global(input) {
    font: inherit;
  }
  .shell {
    min-height: 100vh;
    padding: 0 clamp(1.25rem, 4vw, 4.5rem) 3rem;
    background-image: linear-gradient(
      90deg,
      transparent 49.9%,
      rgba(20, 36, 29, 0.055) 50%,
      transparent 50.1%
    );
  }
  .masthead {
    height: 5.5rem;
    border-bottom: 1px solid var(--ink);
    display: flex;
    align-items: center;
    justify-content: space-between;
    text-transform: uppercase;
    letter-spacing: 0.13em;
    font:
      600 0.66rem/1.2 'Avenir Next',
      'Trebuchet MS',
      sans-serif;
  }
  .wordmark {
    color: inherit;
    text-decoration: none;
    font:
      700 1.55rem/1 'Iowan Old Style',
      'Palatino Linotype',
      serif;
    letter-spacing: -0.02em;
    text-transform: none;
  }
  .wordmark span {
    color: var(--red);
  }
  .masthead p {
    margin: 0;
  }
  .auth-layout {
    display: grid;
    grid-template-columns: 1.15fr 0.85fr;
    min-height: calc(100vh - 8.5rem);
  }
  .manifesto {
    padding: clamp(4rem, 11vh, 8rem) 8vw 4rem 0;
    position: relative;
    border-right: 1px solid var(--line);
  }
  .eyebrow {
    color: var(--red);
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font:
      700 0.68rem/1.2 'Avenir Next',
      'Trebuchet MS',
      sans-serif;
  }
  h1 {
    margin: 1.3rem 0 1.8rem;
    max-width: 12ch;
    font:
      400 clamp(3.5rem, 7.4vw, 7.8rem)/0.88 'Iowan Old Style',
      'Palatino Linotype',
      serif;
    letter-spacing: -0.055em;
  }
  .intro {
    max-width: 30rem;
    color: var(--faded);
    font:
      400 clamp(1rem, 1.4vw, 1.2rem)/1.7 'Avenir Next',
      'Trebuchet MS',
      sans-serif;
  }
  .seal {
    position: absolute;
    right: 3rem;
    bottom: 3rem;
    width: 6.5rem;
    aspect-ratio: 1;
    border: 1px solid var(--red);
    border-radius: 50%;
    display: grid;
    place-content: center;
    text-align: center;
    transform: rotate(-8deg);
    color: var(--red);
  }
  .seal span {
    font:
      2.5rem/1 'Iowan Old Style',
      serif;
  }
  .seal small {
    letter-spacing: 0.2em;
    font-size: 0.55rem;
  }
  .auth-panel {
    align-self: center;
    margin-left: clamp(2rem, 6vw, 6rem);
    max-width: 30rem;
  }
  nav {
    display: flex;
    border-bottom: 1px solid var(--line);
    gap: 1.5rem;
  }
  nav button {
    border: 0;
    background: none;
    padding: 0 0 0.8rem;
    color: var(--faded);
    cursor: pointer;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }
  nav button.active {
    color: var(--ink);
    border-bottom: 2px solid var(--red);
  }
  .form-heading {
    display: flex;
    gap: 1rem;
    align-items: baseline;
    margin: 3rem 0 2rem;
  }
  .form-heading span {
    color: var(--red);
    font:
      0.65rem 'Avenir Next',
      sans-serif;
  }
  .form-heading h2 {
    margin: 0;
    font:
      400 2.4rem 'Iowan Old Style',
      'Palatino Linotype',
      serif;
  }
  form {
    display: grid;
    gap: 1.3rem;
  }
  label {
    display: grid;
    gap: 0.55rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font:
      700 0.62rem 'Avenir Next',
      'Trebuchet MS',
      sans-serif;
  }
  input {
    border: 0;
    border-bottom: 1px solid var(--ink);
    border-radius: 0;
    background: transparent;
    padding: 0.65rem 0;
    color: var(--ink);
    outline: none;
    font-size: 1rem;
    letter-spacing: 0;
  }
  input:focus {
    border-color: var(--red);
    box-shadow: 0 2px 0 -1px var(--red);
  }
  .submit {
    margin-top: 0.7rem;
    border: 1px solid var(--ink);
    background: var(--ink);
    color: var(--paper);
    padding: 1rem 1.15rem;
    display: flex;
    justify-content: space-between;
    cursor: pointer;
    transition:
      background 0.2s,
      color 0.2s;
  }
  .submit:hover {
    background: var(--red);
    border-color: var(--red);
  }
  .submit:disabled {
    opacity: 0.6;
    cursor: wait;
  }
  .forgot,
  .text-button {
    margin-top: 1.25rem;
    padding: 0;
    border: 0;
    background: none;
    color: var(--faded);
    text-decoration: underline;
    cursor: pointer;
    font-size: 0.78rem;
  }
  .message {
    margin: 0;
    padding: 0.75rem;
    border-left: 2px solid var(--ink);
    background: rgba(20, 36, 29, 0.06);
    font:
      0.8rem/1.5 'Avenir Next',
      sans-serif;
    text-transform: none;
    letter-spacing: 0;
  }
  .message.error {
    border-color: var(--red);
    color: #7b2119;
  }
  .loading {
    min-height: 70vh;
    display: grid;
    place-content: center;
    font-family: 'Iowan Old Style', serif;
    font-style: italic;
  }
  .dashboard {
    padding-top: 2rem;
  }
  .edition {
    padding-bottom: 0.8rem;
    border-bottom: 1px solid var(--line);
    color: var(--faded);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }
  .dashboard-head {
    display: flex;
    justify-content: space-between;
    align-items: start;
    padding: 4rem 0;
  }
  .dashboard-head h1 {
    font-size: clamp(3rem, 6vw, 6rem);
  }
  .workspace-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1px;
    background: var(--line);
    border: 1px solid var(--line);
  }
  .workspace-card {
    background: var(--paper);
    min-height: 14rem;
    padding: 1.5rem;
  }
  .workspace-card > span,
  .workspace-card p {
    color: var(--red);
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.14em;
  }
  .workspace-card h2 {
    margin: 2.5rem 0 1rem;
    font:
      400 2rem 'Iowan Old Style',
      serif;
  }
  .rule {
    border-top: 1px solid var(--ink);
    margin-bottom: 0.8rem;
  }
  .workspace-card small {
    color: var(--faded);
  }
  @media (max-width: 800px) {
    .masthead p {
      display: none;
    }
    .auth-layout {
      grid-template-columns: 1fr;
    }
    .manifesto {
      border-right: 0;
      border-bottom: 1px solid var(--line);
      padding-right: 0;
      min-height: 60vh;
    }
    .seal {
      right: 0;
    }
    .auth-panel {
      margin: 3.5rem 0;
    }
    .workspace-grid {
      grid-template-columns: 1fr;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    * {
      transition: none !important;
    }
  }
</style>
