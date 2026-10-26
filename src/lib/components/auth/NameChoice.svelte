<script lang="ts">
	// "Show my name on places" / "Stay anonymous", asked on the first update (feature 7b mounts
	// it). Nothing is preselected: the user has to pick. Showing the name asks for a first name,
	// prefilled from Google (given_name) or empty for email sign-ins.
	// Opened again from "Change" (`changing`): the current choice is selected and a line says it
	// applies to every place, past updates included.
	import { untrack } from 'svelte';
	import { displayNameProblem, normalizeDisplayName } from '#lib/auth/display-name.ts';
	import { saveProfile, session } from '#lib/auth/session.svelte.ts';
	import { DISPLAY_NAME_MAX_LENGTH } from '#lib/config.ts';
	import * as m from '#lib/paraglide/messages.js';

	let { changing = false, onsaved }: { changing?: boolean; onsaved?: (showName: boolean) => void } =
		$props();

	const id = $props.id();
	const current = session.profile?.showName;
	let choice = $state<'show' | 'anonymous' | undefined>(
		untrack(() => (changing && current != null ? (current ? 'show' : 'anonymous') : undefined))
	);
	let name = $state(session.profile?.displayName ?? '');
	let tried = $state(false);
	let saving = $state(false);
	let failed = $state(false);

	const NAME_ERRORS = {
		empty: m.profile_name_error_empty,
		too_long: m.profile_name_error_too_long,
		invalid: m.profile_name_error_invalid
	};

	const problem = $derived(
		choice === 'show' ? displayNameProblem(normalizeDisplayName(name)) : undefined
	);

	async function save(event: SubmitEvent) {
		event.preventDefault();
		tried = true;
		failed = false;
		if (!choice || problem || saving) return;
		saving = true;
		try {
			const showName = choice === 'show';
			await saveProfile(
				showName ? { showName, displayName: normalizeDisplayName(name) } : { showName }
			);
			onsaved?.(showName);
		} catch {
			failed = true;
		} finally {
			saving = false;
		}
	}
</script>

<form class="choice" novalidate onsubmit={save}>
	<fieldset aria-describedby={changing ? `${id}-body ${id}-everywhere` : `${id}-body`}>
		<legend>{m.profile_name_choice_title()}</legend>
		<p id="{id}-body">{m.profile_name_choice_body()}</p>
		{#if changing}
			<p class="everywhere" id="{id}-everywhere">{m.profile_name_choice_everywhere()}</p>
		{/if}

		<label class="option" class:on={choice === 'show'}>
			<input type="radio" name="{id}-choice" value="show" bind:group={choice} />
			{m.profile_show_name()}
		</label>
		{#if choice === 'show'}
			<div class="name">
				<label for="{id}-name">{m.profile_name_label()}</label>
				<input
					id="{id}-name"
					type="text"
					autocomplete="given-name"
					maxlength={DISPLAY_NAME_MAX_LENGTH}
					aria-invalid={tried && !!problem}
					aria-describedby="{id}-hint"
					bind:value={name}
				/>
				<span class="hint" id="{id}-hint">
					{tried && problem ? NAME_ERRORS[problem]() : m.profile_name_hint()}
				</span>
			</div>
		{/if}
		<label class="option" class:on={choice === 'anonymous'}>
			<input type="radio" name="{id}-choice" value="anonymous" bind:group={choice} />
			{m.profile_stay_anonymous()}
		</label>
	</fieldset>

	{#if tried && !choice}
		<p class="error" role="alert">{m.profile_name_choice_required()}</p>
	{/if}
	{#if failed}
		<p class="error" role="alert">{m.profile_save_failed()}</p>
	{/if}

	<button class="primary" type="submit" disabled={saving}>{m.profile_save()}</button>
</form>

<style>
	.choice {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	fieldset {
		margin: 0;
		padding: 0;
		border: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	legend {
		padding: 0;
		margin-bottom: 6px;
		font-size: 22px;
		font-weight: 800;
		letter-spacing: -0.03em;
	}

	p {
		margin: 0 0 4px;
		font-size: 15px;
		line-height: 1.5;
		color: var(--muted);
	}

	.everywhere {
		color: var(--ink);
		font-weight: 600;
	}

	.option {
		min-height: 56px;
		padding: 0 16px;
		border: 1.5px solid var(--line);
		border-radius: var(--radius);
		background: var(--surface);
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 16px;
		font-weight: 700;
		cursor: pointer;
	}

	.option.on {
		border-color: var(--ink);
	}

	.option input {
		width: 20px;
		height: 20px;
		margin: 0;
		accent-color: var(--ink);
	}

	.name {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 0 4px 4px;
	}

	.name label {
		font-size: 14px;
		font-weight: 700;
	}

	.name input {
		height: 54px;
		border: 1px solid var(--line);
		border-radius: 14px;
		padding: 0 16px;
		font: 400 16px var(--font-sans);
		background: var(--bg);
		color: var(--ink);
	}

	.name input[aria-invalid='true'] {
		border-color: var(--danger);
	}

	.hint {
		font-size: 13px;
		color: var(--muted);
	}

	.name input[aria-invalid='true'] + .hint,
	.error {
		color: var(--danger);
	}

	.error {
		margin: 0;
		font-size: 14px;
	}

	.primary {
		height: var(--btn-height);
		border: 0;
		border-radius: var(--radius);
		background: var(--btn);
		color: var(--btnfg);
		font-size: 16px;
		font-weight: 700;
		cursor: pointer;
	}

	.primary:disabled {
		opacity: 0.6;
	}
</style>
