// SSR stays on for the web build (SEO); the app build renders everything in the client.
export const ssr = __BUILD_TARGET__ !== 'app';
