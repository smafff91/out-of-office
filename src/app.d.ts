// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	/** 'web' or 'app', injected by vite.config.ts from BUILD_TARGET. */
	const __BUILD_TARGET__: 'web' | 'app';

	namespace App {
		interface Platform {
			env: Env;
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}

		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		interface PageState {
			/** Area picked on the Home ([west, south, east, north]): the city map opens on it. */
			area?: [number, number, number, number];
			/** Place shown in the tap preview over the map (phones); Back closes it. */
			preview?: string;
			/** A sheet or dialog is open (Sheet.svelte); Back closes it. */
			sheet?: 'sign-in' | 'account' | 'language';
		}
	}
}

export {};
