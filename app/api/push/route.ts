import { env } from "cloudflare:workers";
import { getD1, initializeDatabase } from "@/db/runtime";
import { normalizeSubscription, removePushSubscription, savePushSubscription, sendTestPush, verifyVapidKeyPair } from "@/lib/push";

export async function GET() {
  const hasConfiguration = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
  const keyPairValid = hasConfiguration && await verifyVapidKeyPair({
    VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: env.VAPID_SUBJECT,
  });
  return Response.json({
    publicKey: env.VAPID_PUBLIC_KEY ?? "",
    configured: keyPairValid,
    keyPairValid,
    error: hasConfiguration && !keyPairValid ? "The configured notification keys do not match." : undefined,
  });
}

export async function POST(request: Request) {
  try {
    await initializeDatabase();
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "subscribe");
    const subscription = normalizeSubscription(body.subscription);
    if (action === "subscribe") {
      await savePushSubscription(getD1(), subscription, request.headers.get("user-agent") ?? "");
      return Response.json({ ok: true });
    }
    if (action === "test") {
      await savePushSubscription(getD1(), subscription, request.headers.get("user-agent") ?? "");
      const delivered = await sendTestPush({ DB: getD1(), VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: env.VAPID_SUBJECT }, subscription);
      return Response.json({ ok: delivered });
    }
    if (action === "unsubscribe") {
      await removePushSubscription(getD1(), subscription.endpoint);
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Unknown notification action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update notifications.";
    return Response.json({ error: message }, { status: 400 });
  }
}
