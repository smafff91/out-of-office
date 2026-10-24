// Supabase Auth Send Email Hook (see handler.ts). Deployed with
// `npx supabase functions deploy send-email --no-verify-jwt --use-api`: Auth calls it without a
// user token, the signature checks the caller instead. Secrets: `npm run functions:secrets`.
import { handleSendEmail } from './handler.ts';

Deno.serve((request) =>
	handleSendEmail(request, {
		SEND_EMAIL_HOOK_SECRET: Deno.env.get('SEND_EMAIL_HOOK_SECRET'),
		RESEND_API_KEY: Deno.env.get('RESEND_API_KEY'),
		EMAIL_FROM: Deno.env.get('EMAIL_FROM')
	})
);
