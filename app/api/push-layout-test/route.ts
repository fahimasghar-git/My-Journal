import { env } from "cloudflare:workers";
import { getD1, initializeDatabase } from "@/db/runtime";
import { sendNotificationLayoutTest } from "@/lib/push";

const LAYOUT_TEST_KEY = "161B1803-0711-4F70-9ED5-688D2963D884";

export async function POST(request: Request) {
  if (request.headers.get("x-layout-test-key") !== LAYOUT_TEST_KEY) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  await initializeDatabase();
  const result = await sendNotificationLayoutTest({
    DB: getD1(),
    VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: env.VAPID_SUBJECT,
  });
  return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
}
