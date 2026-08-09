// The reminder job (S5-2).
//
// Called on a schedule by Vercel Cron (see vercel.json). Guarded by a shared
// secret rather than left open: the endpoint sends mail, so an open one is a
// way to make this product email people repeatedly. The guard is constant-time
// so the secret cannot be recovered a character at a time.
//
// Sending once is not this endpoint's job — `sendDueReminders` claims a
// delivery row before it sends, so running this every minute would still send
// one reminder per appointment.
import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // No secret configured means the job cannot run. Failing closed is the only
  // safe default for something that sends mail.
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  return timingSafeEqual(bearer, secret);
}

async function run(request: Request): Promise<Response> {
  if (!authorised(request)) {
    return new Response(JSON.stringify({ error: "unauthorised" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  // Imported here, not at module scope: the module reaches for the service
  // role and the provider key, and must never be pulled into a client bundle.
  const { sendDueReminders } = await import("@/lib/notify.functions");
  const tally = await sendDueReminders();

  return new Response(JSON.stringify(tally), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/reminders")({
  server: {
    handlers: {
      // Vercel Cron issues GET; POST is here for running it by hand.
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});
