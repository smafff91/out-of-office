<script lang="ts">
	// The contribution form (LatteContribute), one page that scrolls, then the thanks screen
	// (LatteThanks). Full screen on phones; the left panel on desktop, next to the map.
	// - Prefilled with the user's own answers of the last 30 days, else with what the community
	//   reported (draft.ts).
	// - Sign-in only on "Send update" (LatteSignIn); the draft survives the Google redirect and
	//   a language change (stash), and the sending carries on once signed in.
	// - The position is asked when the form opens for a check-in or on "I'm here now", and read
	//   again, fresh, when sending. The database alone decides whether the check-in counts.
	// - Photos are compressed when chosen and kept in IndexedDB (stored-photos.ts) so they also
	//   survive the reloads; they are uploaded once the contribution is saved, and a failed
	//   upload never loses it (the thanks screen offers to try again).
	import { onMount, tick, untrack } from 'svelte';
	import { beforeNavigate, goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import { onBeforeLeave, stash, takeStash } from '#lib/auth/handoff.ts';
	import { openSignIn, session, signInSheet } from '#lib/auth/session.svelte.ts';
	import { checkinView, type CheckinView } from '#lib/contribute/checkin.ts';
	import {
		EXTRAS,
		LONG_STAYS,
		NOISE,
		NOTE_MAX,
		OUTLETS,
		RULE_CHOICES,
		TIME_LIMIT_HOURS,
		WIFI,
		canConfirmAll,
		confirmAll,
		draftKey,
		firstMissing,
		matchStoredPhotos,
		noteLength,
		parseDraft,
		prefill,
		sameDraft,
		toggleExtra,
		toggleRule,
		type Draft,
		type Extra,
		type PrefillSource,
		type RequiredField,
		type RuleChoice,
		type StashedDraft
	} from '#lib/contribute/draft.ts';
	import { contributeErrorKind, type ContributeErrorKind } from '#lib/contribute/errors.ts';
	import { notifyPlaceUpdated } from '#lib/contribute/updates.ts';
	import { PHOTOS_PER_CONTRIBUTION } from '#lib/config.ts';
	import type { CompressedPhoto } from '#lib/photos/compress.ts';
	import {
		clearPhotos,
		loadPhotos,
		pruneStoredPhotos,
		savePhotos
	} from '#lib/photos/stored-photos.ts';
	import NameChoice from '#lib/components/auth/NameChoice.svelte';
	import Icon from '#lib/components/place/Icon.svelte';
	import {
		ATTRIBUTE_NAMES,
		ATTRIBUTE_OPTIONS,
		ATTRIBUTE_VALUES,
		EXTRAS as EXTRA_LABELS,
		LAPTOP_RULES
	} from '#lib/components/place/labels.ts';
	import Sheet from '#lib/components/sheet/Sheet.svelte';
	import { formatDaysAgo, formatHours, formatNumber } from '#lib/i18n/format.ts';
	import * as m from '#lib/paraglide/messages.js';
	import { daysSince } from '#lib/places/dates.ts';
	import {
		getPermissionStatus,
		requestFreshPosition,
		type Position
	} from '#lib/platform/geolocation.ts';
	import { createSupabaseClient } from '#lib/supabase/client.ts';
	import {
		fetchMyRecentContribution,
		submitContribution,
		type CompleteDraft,
		type SubmitResult
	} from '#lib/supabase/contributions.ts';
	import {
		PLACE_DEPENDENCY,
		invalidatePlaceDetail,
		type PlaceDetail
	} from '#lib/supabase/place-details.ts';
	import {
		fetchMyPlacePhotoCount,
		newUploads,
		uploadPhotos,
		type PhotoUpload
	} from '#lib/supabase/photos.ts';
	import { fetchMyProfile } from '#lib/supabase/profile.ts';
	import Segmented from './Segmented.svelte';
	import ChipGroup from './ChipGroup.svelte';
	import LocationBox from './LocationBox.svelte';
	import PhotoPicker from './PhotoPicker.svelte';
	import ThanksView from './ThanksView.svelte';

	type Props = {
		place: PlaceDetail;
		city: { id: string; name: string };
		/** Opened with "Check in here": ask for the position at once. */
		checkin: boolean;
		/** The place page (close, "Back to {place}"). */
		placeHref: string;
		/** The city map ("Find another place"). */
		mapHref: string;
	};

	let { place, city, checkin, placeHref, mapHref }: Props = $props();

	const uid = $props.id();
	const start = untrack(() => prefill(place));

	let initial = $state<Draft>(start.draft);
	let draft = $state<Draft>(structuredClone(start.draft));
	let source = $state<PrefillSource>(start.source);
	/** The user asked for their position (check-in, "I'm here now"): read it again on sending. */
	let wantsLocation = $state(untrack(() => checkin));
	let here = $state<CheckinView>(
		untrack(() => (checkin ? { state: 'locating' } : { state: 'idle' }))
	);
	let step = $state<'form' | 'sending' | 'thanks'>('form');
	let error = $state<ContributeErrorKind>();
	let missing = $state<RequiredField>();
	let result = $state<SubmitResult>();
	let sent = $state<CompleteDraft>();
	/** "Send update" while signed out: carry on once signed in (sheet closed). */
	let awaitingSignIn = $state(false);
	let sheetShown = false;
	let nameChoiceOpen = $state(false);
	/** Opened from "Change" under Send update: saving only closes it, nothing is sent. */
	let changingName = $state(false);
	let discardOpen = $state(false);
	let pendingNavigation: { url: URL; type: string; delta?: number; unload: boolean } | undefined;
	/** We are leaving on purpose (Google, language reload): no "discard?" question. */
	let leaving = false;
	let discarded = false;
	let restored = false;
	let ownChecked = false;
	let root = $state<HTMLElement>();
	let bottom = $state<HTMLElement>();
	/** Raw: Blobs inside, nothing to track deeply. */
	let photos = $state.raw<CompressedPhoto[]>([]);
	/** Photos of a restored draft that the browser could not keep. */
	let photosNotice = $state<string>();
	let uploads = $state.raw<PhotoUpload[]>([]);
	/** The user's visible photos already here: new ones beyond the limit replace them. */
	let myPhotosHere = $state(0);
	let photosCounted = false;
	let uploading = $state(false);

	// Photos count as changes too.
	const dirty = $derived(!sameDraft(draft, initial) || photos.length > 0);
	const showConfirmAll = $derived(source !== 'none' && canConfirmAll(initial));
	const nameLine = $derived(
		session.profile?.showName === true
			? m.contribute_name_shown()
			: session.profile?.showName === false
				? m.contribute_name_hidden()
				: undefined
	);

	const options = <T extends string>(values: readonly T[], labels: Record<T, () => string>) =>
		values.map((value) => ({ value, label: labels[value]() }));

	const attributes = $derived([
		{
			field: 'wifi' as const,
			name: ATTRIBUTE_NAMES.wifi(),
			options: options(WIFI, ATTRIBUTE_OPTIONS.wifi),
			now: freshness(place.attributes.wifi, ATTRIBUTE_VALUES.wifi)
		},
		{
			field: 'outlets' as const,
			name: ATTRIBUTE_NAMES.outlets(),
			options: options(OUTLETS, ATTRIBUTE_OPTIONS.outlets),
			now: freshness(place.attributes.outlets, ATTRIBUTE_VALUES.outlets)
		},
		{
			field: 'noise' as const,
			name: ATTRIBUTE_NAMES.noise(),
			options: options(NOISE, ATTRIBUTE_OPTIONS.noise),
			now: freshness(place.attributes.noise, ATTRIBUTE_VALUES.noise)
		},
		{
			field: 'longStays' as const,
			name: ATTRIBUTE_NAMES.long_stays(),
			options: options(LONG_STAYS, ATTRIBUTE_OPTIONS.long_stays),
			now: freshness(place.attributes.long_stays, ATTRIBUTE_OPTIONS.long_stays)
		}
	]);

	const ruleOptions = $derived(
		RULE_CHOICES.map((value) => ({
			value,
			label:
				value === 'none'
					? m.contribute_rule_none()
					: value === 'time_limit'
						? m.contribute_rule_time_limit()
						: LAPTOP_RULES[value]()
		}))
	);
	const rulesNow = $derived.by(() => {
		const latest = place.laptopRules
			.map((rule) => rule.lastConfirmedOn)
			.sort()
			.at(-1);
		if (!latest) return undefined;
		return m.contribute_now({
			value: m.contribute_rules_count({ count: place.laptopRules.length }),
			ago: ago(latest)
		});
	});
	const hourOptions = $derived(
		TIME_LIMIT_HOURS.map((hours) => ({
			value: String(hours) as '1' | '2' | '3',
			label: formatHours(hours)
		}))
	);
	const extraOptions = $derived(options(EXTRAS, EXTRA_LABELS));

	function ago(day: string) {
		return formatDaysAgo(daysSince(day, place.timezone));
	}

	function freshness<T extends string>(
		attribute: { value: T; lastConfirmedOn: string } | undefined,
		labels: Record<T, () => string>
	) {
		if (!attribute) return undefined;
		return m.contribute_now({
			value: labels[attribute.value](),
			ago: ago(attribute.lastConfirmedOn)
		});
	}

	function setAnswer<K extends RequiredField>(field: K, value: Draft[K]) {
		draft = { ...draft, [field]: value };
		if (missing === field) missing = undefined;
		error = undefined;
	}

	function setNote(event: Event) {
		const input = event.currentTarget as HTMLTextAreaElement;
		// The database counts characters (code points): cut there, not at UTF-16 units.
		if (noteLength(input.value) > NOTE_MAX)
			input.value = [...input.value].slice(0, NOTE_MAX).join('');
		draft = { ...draft, note: input.value };
	}

	/** Saves one after the other, so a quick add then remove cannot land in the wrong order. */
	let saving = Promise.resolve();
	function setPhotos(next: CompressedPhoto[]) {
		photos = next;
		photosNotice = undefined;
		saving = saving.then(() => savePhotos(place.id, next).then(() => {}));
	}

	/** After the contribution is saved: uploads what is left (also "Try again"). */
	async function sendPhotos() {
		if (!result || uploading) return;
		uploading = true;
		uploads = await uploadPhotos(createSupabaseClient(), result.id, uploads);
		uploading = false;
		if (uploads.some((upload) => upload.state === 'done')) {
			invalidatePlaceDetail(city.id, place.slug);
			notifyPlaceUpdated(place.slug);
			void invalidate(PLACE_DEPENDENCY);
		}
	}

	async function everythingStillRight() {
		draft = confirmAll(draft, initial);
		missing = undefined;
		await tick();
		bottom?.scrollIntoView({ behavior: 'smooth', block: 'end' });
		document.getElementById(`${uid}-send`)?.focus({ preventScroll: true });
	}

	async function locate() {
		wantsLocation = true;
		here = { state: 'locating' };
		const reading = await requestFreshPosition();
		here = checkinView(reading, place.point, place.checkin);
		return reading.ok ? reading.position : undefined;
	}

	/** "Send update": checks, then sign-in if needed, then the name choice, then sending. */
	async function send() {
		error = undefined;
		const first = firstMissing(draft);
		if (first) {
			missing = first;
			await tick();
			const field = document.getElementById(`${uid}-${first}`);
			field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			field?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
			return;
		}
		missing = undefined;
		sheetShown = false;
		awaitingSignIn = true;
	}

	// Signed in (or already was): send. Signed out: the sign-in sheet; closed without signing
	// in: the draft stays, with a message. Waits for the session to be known after a reload.
	$effect(() => {
		if (!awaitingSignIn || signInSheet.open || session.status === 'loading') return;
		untrack(() => {
			if (session.status === 'signed-in') {
				awaitingSignIn = false;
				void sendSignedIn();
			} else if (!sheetShown) {
				sheetShown = true;
				openSignIn({ context: 'contribution' });
			} else {
				awaitingSignIn = false;
				error = 'sign_in_cancelled';
			}
		});
	});

	async function sendSignedIn() {
		if (!session.userId || step === 'sending') return;
		step = 'sending';
		const profile =
			session.profile ?? (await fetchMyProfile(session.userId).catch(() => undefined));
		// First update ever: choose how to appear (nothing preselected). Without the profile
		// (offline) the name stays hidden until the user chooses.
		if (profile?.showName === null) {
			step = 'form';
			changingName = false;
			nameChoiceOpen = true;
			return;
		}

		let position: Position | undefined;
		if (wantsLocation || (await getPermissionStatus()) === 'granted') position = await locate();

		try {
			result = await submitContribution(
				createSupabaseClient(),
				place.id,
				draft as CompleteDraft,
				position
			);
		} catch (err) {
			step = 'form';
			error = contributeErrorKind(err, { online: navigator.onLine });
			if (error === 'not_signed_in') {
				// The session ended: sign in again, then carry on.
				sheetShown = false;
				awaitingSignIn = true;
			}
			return;
		}

		sent = draft as CompleteDraft;
		step = 'thanks';
		// Beyond today's slots the database would refuse them anyway: no request for those.
		const slots = result.photoSlots;
		uploads = newUploads(photos).map((upload, i) =>
			i < slots ? upload : { ...upload, state: 'limit' }
		);
		photos = [];
		void clearPhotos(place.id);
		void sendPhotos();
		invalidatePlaceDetail(city.id, place.slug);
		notifyPlaceUpdated(place.slug);
		void invalidate(PLACE_DEPENDENCY);
		await tick();
		root?.scrollIntoView({ block: 'start' });
		document.getElementById('thanks-title')?.focus({ preventScroll: true });
	}

	function restore(saved: StashedDraft) {
		restored = true;
		draft = saved.draft;
		initial = saved.initial;
		source = saved.source;
		wantsLocation ||= saved.wantsLocation;
		if (saved.photoIds.length > 0) {
			void loadPhotos(place.id).then((stored) => {
				const kept = matchStoredPhotos(saved.photoIds, stored);
				photos = [...kept.photos, ...photos].slice(0, PHOTOS_PER_CONTRIBUTION);
				if (kept.missing > 0) photosNotice = m.contribute_photos_readd();
			});
		}
		if (saved.pendingSubmit) {
			sheetShown = true;
			awaitingSignIn = true;
		}
	}

	// Signed in: the user's own recent answers replace the community's, if nothing was changed.
	$effect(() => {
		if (session.status !== 'signed-in' || ownChecked || restored) return;
		ownChecked = true;
		void fetchMyRecentContribution(
			createSupabaseClient(),
			untrack(() => place.id)
		)
			.then((mine) => {
				if (!mine || !sameDraft(draft, initial) || step !== 'form') return;
				const own = prefill(place, mine);
				initial = own.draft;
				draft = structuredClone(own.draft);
				source = own.source;
			})
			.catch(() => {
				// The community answers stay.
			});
	});

	// Signed in: how many photos of theirs this place already shows (for the replace notice).
	$effect(() => {
		if (session.status !== 'signed-in' || photosCounted) return;
		photosCounted = true;
		void fetchMyPlacePhotoCount(
			createSupabaseClient(),
			untrack(() => place.id)
		)
			.then((count) => (myPhotosHere = count))
			.catch(() => {
				// No notice: the database applies the limit anyway.
			});
	});

	onMount(() => {
		root?.scrollIntoView({ block: 'start' });
		const saved = parseDraft(takeStash(draftKey(place.id)), { placeId: place.id });
		if (saved) restore(saved);
		// Photos left by a draft that is not coming back (tab closed, another visit).
		else void clearPhotos(place.id);
		void pruneStoredPhotos();
		if (wantsLocation) void locate();

		return onBeforeLeave(() => {
			leaving = true;
			setTimeout(() => (leaving = false), 3000);
			if (step === 'thanks') return;
			stash(draftKey(place.id), {
				v: 1,
				placeId: place.id,
				savedAt: Date.now(),
				draft: $state.snapshot(draft),
				initial: $state.snapshot(initial),
				source,
				pendingSubmit: awaitingSignIn,
				wantsLocation,
				photoIds: photos.map((photo) => photo.id)
			} satisfies StashedDraft);
		});
	});

	// Leaving with unsent answers: ask first. Tab closed or reloaded: the browser asks.
	beforeNavigate((navigation) => {
		if (!dirty || step === 'thanks' || leaving || discarded) return;
		const to = navigation.to?.url;
		// Same page (a sheet opening or closing): not leaving.
		if (to && to.pathname === page.url.pathname && to.search === page.url.search) return;
		navigation.cancel();
		if (navigation.type === 'leave' || !to) return;
		pendingNavigation = {
			url: to,
			type: navigation.type,
			delta: navigation.type === 'popstate' ? navigation.delta : undefined,
			unload: navigation.willUnload
		};
		discardOpen = true;
	});

	/**
	 * Leaves where the user was going. The dialog's own history entry is replaced (or skipped
	 * when going back), so Back afterwards does not land on a closed dialog.
	 */
	function discard() {
		discarded = true;
		void clearPhotos(place.id);
		const target = pendingNavigation;
		pendingNavigation = undefined;
		const onDialogEntry = page.state.sheet === 'discard-draft';
		if (!target) {
			discardOpen = false;
		} else if (target.unload) {
			window.location.href = target.url.href;
		} else if (target.type === 'popstate' && target.delta && target.delta < 0) {
			history.go(onDialogEntry ? target.delta - 1 : target.delta);
		} else {
			void goto(target.url, { replace: onDialogEntry });
		}
	}

	const ERRORS: Record<ContributeErrorKind, () => string> = {
		offline: m.contribute_error_offline,
		daily_limit: m.contribute_error_daily_limit,
		email_not_confirmed: m.contribute_error_email_not_confirmed,
		place_not_found: m.contribute_error_place_not_found,
		not_signed_in: m.contribute_error_unknown,
		sign_in_cancelled: m.contribute_error_sign_in_cancelled,
		unknown: m.contribute_error_unknown
	};
</script>

<div class="contribute" bind:this={root}>
	{#if step === 'thanks' && result && sent}
		<ThanksView
			placeName={place.name}
			cityName={city.name}
			name={session.profile?.displayName}
			draft={sent}
			{result}
			{mapHref}
			{placeHref}
			{uploads}
			{uploading}
			onretry={() => void sendPhotos()}
		/>
	{:else}
		<header class="top">
			<a class="close" href={placeHref} aria-label={m.action_close()}><Icon name="close" /></a>
			<span class="place-name">{place.name}</span>
		</header>

		<form
			class="form"
			novalidate
			onsubmit={(event) => {
				event.preventDefault();
				void send();
			}}
		>
			<LocationBox view={here} onlocate={() => void locate()} />

			<section class="q" id="{uid}-workAgain">
				<h2 class="big-question" id="{uid}-workAgain-label">{m.contribute_work_again()}</h2>
				<div
					class="yes-no"
					class:invalid={missing === 'workAgain'}
					role="radiogroup"
					aria-labelledby="{uid}-workAgain-label"
					aria-invalid={missing === 'workAgain'}
				>
					{#each [true, false] as value (value)}
						<button
							type="button"
							role="radio"
							aria-checked={draft.workAgain === value}
							onclick={() => setAnswer('workAgain', value)}
						>
							<span class:down={!value}><Icon name="thumb" /></span>
							{value ? m.contribute_yes() : m.contribute_no()}
						</button>
					{/each}
				</div>
				{#if missing === 'workAgain'}
					<span class="required" role="alert">{m.contribute_required()}</span>
				{/if}
			</section>

			<div class="intro">
				{#if source === 'none'}
					<h1>{m.contribute_whats_it_like()}</h1>
				{:else}
					<h1>{m.contribute_still_right()}</h1>
					<p>
						{source === 'mine' ? m.contribute_own_answers_body() : m.contribute_still_right_body()}
					</p>
				{/if}
			</div>

			{#if showConfirmAll}
				<button class="confirm-all" type="button" onclick={() => void everythingStillRight()}>
					<Icon name="check" />{m.action_everything_still_right()}
				</button>
			{/if}

			{#each attributes as attribute (attribute.field)}
				<section class="q" id="{uid}-{attribute.field}">
					<div class="ql">
						<h2 id="{uid}-{attribute.field}-label">{attribute.name}</h2>
						{#if attribute.now}<span class="fr">{attribute.now}</span>{/if}
					</div>
					<Segmented
						labelledby="{uid}-{attribute.field}-label"
						options={attribute.options}
						value={draft[attribute.field]}
						invalid={missing === attribute.field}
						onchange={(value) => setAnswer(attribute.field, value as never)}
					/>
					{#if missing === attribute.field}
						<span class="required" role="alert">{m.contribute_required()}</span>
					{/if}
				</section>
			{/each}

			<div class="optional" aria-hidden="true">
				<span></span>{m.contribute_optional()}<span></span>
			</div>

			<section class="q">
				<div class="ql">
					<h2 id="{uid}-rules">{m.contribute_laptop_rules()}</h2>
					{#if rulesNow}<span class="fr">{rulesNow}</span>{/if}
				</div>
				<ChipGroup
					labelledby="{uid}-rules"
					options={ruleOptions}
					selected={draft.rules}
					ontoggle={(rule: RuleChoice) => (draft = toggleRule(draft, rule))}
				/>
				{#if draft.rules.includes('time_limit')}
					<div class="hours">
						<span class="sub" id="{uid}-hours">{m.contribute_time_limit_label()}</span>
						<Segmented
							labelledby="{uid}-hours"
							options={hourOptions}
							value={draft.hours ? (String(draft.hours) as '1' | '2' | '3') : undefined}
							onchange={(value) => (draft = { ...draft, hours: Number(value) as 1 | 2 | 3 })}
						/>
					</div>
				{/if}
			</section>

			<section class="q">
				<div class="ql"><h2 id="{uid}-extras">{m.place_more_details()}</h2></div>
				<ChipGroup
					labelledby="{uid}-extras"
					options={extraOptions}
					selected={draft.extras}
					ontoggle={(extra: Extra) => (draft = toggleExtra(draft, extra))}
				/>
			</section>

			<section class="q">
				<div class="ql"><h2 id="{uid}-photos">{m.contribute_photos()}</h2></div>
				<PhotoPicker
					labelledby="{uid}-photos"
					{photos}
					{myPhotosHere}
					notice={photosNotice}
					onadd={(photo) => setPhotos([...photos, photo])}
					onremove={(id) => setPhotos(photos.filter((photo) => photo.id !== id))}
				/>
			</section>

			<section class="q">
				<label class="ql" for="{uid}-note">
					<span class="label">{m.contribute_note()}</span>
					<span class="fr">
						{m.contribute_note_count({
							count: formatNumber(noteLength(draft.note)),
							max: formatNumber(NOTE_MAX)
						})}
					</span>
				</label>
				<textarea
					id="{uid}-note"
					rows="2"
					placeholder={m.contribute_note_placeholder()}
					value={draft.note}
					oninput={setNote}></textarea>
			</section>

			<div bind:this={bottom}></div>

			<div class="send">
				{#if error}
					<p class="error" role="alert">{ERRORS[error]()}</p>
				{/if}
				<button id="{uid}-send" class="primary" type="submit" disabled={step === 'sending'}>
					{step === 'sending' ? m.contribute_sending() : m.action_send_update()}
				</button>
				{#if nameLine}
					<span class="name-line">
						{nameLine} ·
						<button
							class="change tap-target"
							type="button"
							aria-label={m.contribute_change_name()}
							onclick={() => {
								changingName = true;
								nameChoiceOpen = true;
							}}>{m.action_change()}</button
						>
					</span>
				{/if}
			</div>
		</form>
	{/if}
</div>

<Sheet bind:open={nameChoiceOpen} name="name-choice" label={m.profile_name_choice_title()}>
	<NameChoice
		changing={changingName}
		onsaved={() => {
			nameChoiceOpen = false;
			if (!changingName) void sendSignedIn();
		}}
	/>
</Sheet>

<Sheet bind:open={discardOpen} name="discard-draft" variant="center" labelledby="{uid}-discard">
	<div class="discard">
		<h2 id="{uid}-discard">{m.contribute_discard_title()}</h2>
		<p>{m.contribute_discard_body()}</p>
		<button class="primary" type="button" onclick={() => (discardOpen = false)}>
			{m.action_keep_editing()}
		</button>
		<button class="danger" type="button" onclick={discard}>{m.action_discard()}</button>
	</div>
</Sheet>

<style>
	.contribute {
		position: relative;
		min-height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--bg);
	}

	.top {
		height: 68px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 12px;
	}

	.close {
		width: var(--tap);
		height: var(--tap);
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--ink);
	}

	.place-name {
		min-width: 0;
		font-size: 17px;
		font-weight: 700;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.form {
		flex-grow: 1;
		display: flex;
		flex-direction: column;
		gap: 26px;
		padding: 4px 20px 0;
	}

	.q {
		display: flex;
		flex-direction: column;
		gap: 10px;
		scroll-margin: 96px;
	}

	.ql {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 2px 12px;
	}

	.ql h2,
	.ql .label {
		margin: 0;
		font-size: 16px;
		font-weight: 700;
	}

	.big-question {
		margin: 0;
		font-size: 20px;
		font-weight: 800;
		letter-spacing: -0.02em;
	}

	.fr {
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 400;
		color: var(--muted);
	}

	.yes-no {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
		border-radius: 18px;
	}

	.yes-no.invalid {
		box-shadow: 0 0 0 1.5px var(--danger);
	}

	.yes-no button {
		min-height: 60px;
		border-radius: var(--radius);
		border: 1.5px solid var(--line);
		background: var(--surface);
		color: var(--ink);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		font-size: 16px;
		font-weight: 700;
		cursor: pointer;
	}

	.yes-no button[aria-checked='true'] {
		background: var(--btn);
		color: var(--btnfg);
		border-color: var(--btn);
	}

	.yes-no span {
		display: flex;
	}

	.yes-no .down {
		transform: rotate(180deg);
	}

	.required {
		font-size: 13px;
		color: var(--danger);
	}

	.intro {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.intro h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 800;
		letter-spacing: -0.03em;
	}

	.intro p {
		margin: 0;
		font-size: 15px;
		line-height: 1.45;
		color: var(--muted);
	}

	.confirm-all {
		min-height: var(--btn-height);
		padding: 8px 16px;
		border-radius: var(--radius);
		border: 1.5px solid var(--ink);
		background: transparent;
		color: var(--ink);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		font-size: 16px;
		font-weight: 700;
		text-align: center;
		cursor: pointer;
	}

	.optional {
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.optional span {
		flex-grow: 1;
		height: 1px;
		background: var(--line);
	}

	.hours {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.sub {
		font-size: 14px;
		color: var(--muted);
	}

	textarea {
		border: 1px solid var(--line);
		border-radius: 14px;
		padding: 14px;
		font: 400 16px var(--font-sans);
		resize: none;
		background: var(--surface);
		color: var(--ink);
	}

	.send {
		position: sticky;
		bottom: 0;
		margin: 0 -20px;
		padding: 14px 20px calc(26px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 8px;
		background: var(--bg);
		border-top: 1px solid var(--line);
		z-index: 2;
	}

	.primary,
	.danger {
		min-height: var(--btn-height);
		padding: 0 16px;
		border: 0;
		border-radius: var(--radius);
		font-size: 16px;
		font-weight: 700;
		cursor: pointer;
	}

	.primary {
		background: var(--btn);
		color: var(--btnfg);
	}

	.primary:disabled {
		opacity: 0.6;
	}

	.danger {
		background: var(--pill);
		color: var(--danger);
	}

	.name-line {
		text-align: center;
		font-size: 12px;
		color: var(--muted);
	}

	.change {
		padding: 0;
		border: 0;
		background: none;
		font: inherit;
		font-weight: 700;
		color: var(--ink);
		text-decoration: underline;
		text-underline-offset: 2px;
		cursor: pointer;
	}

	.error {
		margin: 0;
		font-size: 14px;
		line-height: 1.45;
		color: var(--danger);
	}

	.discard {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.discard h2 {
		margin: 0;
		font-size: 22px;
		font-weight: 800;
		letter-spacing: -0.03em;
	}

	.discard p {
		margin: 0 0 4px;
		font-size: 15px;
		line-height: 1.5;
		color: var(--muted);
	}
</style>
