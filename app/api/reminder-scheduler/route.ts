import { env } from "cloudflare:workers";
import { dispatchDuePushNotifications } from "@/lib/push";

function unauthorized() {
  return Response.json(
    { ok: false, error: "Unauthorized scheduler request." },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const configuredSecret = env.REMINDER_SCHEDULER_SECRET?.trim();
  const suppliedSecret = request.headers.get("x-reminder-scheduler-key")?.trim();

  if (!configuredSecret || !suppliedSecret || suppliedSecret !== configuredSecret) {
    return unauthorized();
  }

  if (!env.DB) {
    return Response.json(
      { ok: false, error: "Reminder storage is unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const result = await dispatchDuePushNotifications({
      DB: env.DB,
      VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY,
      VAPID_SUBJECT: env.VAPID_SUBJECT,
    });
    return Response.json(
      { ok: true, ...result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[push] external scheduler dispatch failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      { ok: false, error: "Reminder dispatch failed." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
