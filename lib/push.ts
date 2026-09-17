import { sendPushNotification, topicFromString, type PushPayload, type PushSubscriptionData } from "@mmmike/web-push/send";

const APP_ORIGIN = "https://fahim-plant-operations-journal.ai-vitalagri.chatgpt.site";

export type PushRuntimeEnv = {
  DB: D1Database;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
};

type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
  updated_at: string;
};

type DueReminder = {
  kind: "page" | "my-day";
  id: string;
  reminderAt: string;
  title: string;
  body: string;
  url: string;
};

type ReminderPageRow = {
  id: string;
  serial: string;
  parent_id: string | null;
  subsection_id: string;
  reminder_date: string;
  reminder_repeat: string | null;
  reminder_end_date: string | null;
  reminder_closed_at: string | null;
  status: string;
  title: string;
};

type ReminderSectionRow = { id: string; name: string; parent_id: string | null };

type ReminderRepeat = "none" | "daily-until-closed" | "daily" | "weekdays" | "weekly" | "monthly";
type VapidConfig = { publicKey: string; privateKey: string; subject: string };
type PushDeliveryResult = "delivered" | "gone" | "duplicate";
const PUSH_LOOKBACK_MS = 15 * 60 * 1000;
const PUSH_CONCURRENCY = 16;
type DeclarativePushPayload = PushPayload & {
  web_push: 8030;
  notification: {
    title: string;
    body: string;
    navigate: string;
    silent: false;
    app_badge: string;
    tag?: string;
  };
  badgeCount: number;
  service_worker_presentation?: {
    title: string;
    body: string;
  };
};

export type PushDispatchSummary = {
  subscriptions: number;
  reminders: number;
  delivered: number;
  gone: number;
  duplicate: number;
  failed: number;
  skippedBeforeSubscription: number;
};

function reminderRepeat(value: string | null | undefined): ReminderRepeat {
  return value === "daily-until-closed" || value === "daily" || value === "weekdays" || value === "weekly" || value === "monthly" ? value : "none";
}

function repeatMatchesDate(startDate: string, candidateDate: string, repeat: ReminderRepeat) {
  if (repeat === "daily" || repeat === "daily-until-closed") return true;
  const start = new Date(`${startDate}T12:00:00+05:00`);
  const candidate = new Date(`${candidateDate}T12:00:00+05:00`);
  if (repeat === "weekdays") return candidate.getDay() > 0 && candidate.getDay() < 6;
  if (repeat === "weekly") return start.getDay() === candidate.getDay();
  if (repeat === "monthly") return start.getDate() === candidate.getDate();
  return startDate === candidateDate;
}

function dueOccurrence(dateTime: string, repeatValue: string | null, endDate: string | null, closedAt: string | null, completed: boolean, start: string, current: string) {
  if (!dateTime || closedAt) return null;
  const repeat = reminderRepeat(repeatValue);
  if (completed && repeat !== "daily-until-closed") return null;
  const normalized = dateTime.length === 10 ? `${dateTime}T09:00` : dateTime.slice(0, 16);
  if (repeat === "none") return normalized >= start && normalized <= current ? normalized : null;
  const candidateDate = current.slice(0, 10);
  const startDate = normalized.slice(0, 10);
  if (candidateDate < startDate || (endDate && candidateDate > endDate) || !repeatMatchesDate(startDate, candidateDate, repeat)) return null;
  const occurrence = `${candidateDate}T${normalized.slice(11, 16) || "09:00"}`;
  return occurrence >= start && occurrence <= current ? occurrence : null;
}

function vapidConfig(env: PushRuntimeEnv): VapidConfig {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) throw new Error("Mobile notifications are not configured yet.");
  if (!/^(mailto:|https:\/\/)/.test(subject)) throw new Error("The VAPID subject must use a mailto: or https:// address.");
  return { publicKey, privateKey, subject };
}

function decodeBase64Url(value: string) {
  const base64 = (value + "=".repeat((4 - value.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function encodeBase64Url(value: Uint8Array) {
  let raw = "";
  for (const byte of value) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function verifyVapidKeyPair(env: Pick<PushRuntimeEnv, "VAPID_PUBLIC_KEY" | "VAPID_PRIVATE_KEY" | "VAPID_SUBJECT">) {
  try {
    const config = vapidConfig(env as PushRuntimeEnv);
    const publicBytes = decodeBase64Url(config.publicKey);
    const privateBytes = decodeBase64Url(config.privateKey);
    if (publicBytes.length !== 65 || publicBytes[0] !== 4 || privateBytes.length !== 32) return false;
    const publicKey = await crypto.subtle.importKey(
      "raw",
      publicBytes,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const privateKey = await crypto.subtle.importKey(
      "jwk",
      {
        kty: "EC",
        crv: "P-256",
        x: encodeBase64Url(publicBytes.slice(1, 33)),
        y: encodeBase64Url(publicBytes.slice(33, 65)),
        d: encodeBase64Url(privateBytes),
        ext: true,
      },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
    const message = new TextEncoder().encode("plant-operations-journal-vapid-check");
    const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, message);
    return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, signature, message);
  } catch {
    return false;
  }
}

async function verifiedVapidConfig(env: PushRuntimeEnv) {
  const config = vapidConfig(env);
  if (!await verifyVapidKeyPair(env)) throw new Error("The configured VAPID public and private keys do not match.");
  return config;
}

function plantDateTime(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function createdAtMillis(value: string) {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  return Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(normalized) ? normalized : `${normalized}Z`);
}

function reminderAtMillis(value: string) {
  return Date.parse(`${value}:00+05:00`);
}

function pageReminderContent(
  page: Pick<ReminderPageRow, "id" | "serial" | "parent_id" | "subsection_id" | "title">,
  pageById: Map<string, Pick<ReminderPageRow, "id" | "parent_id" | "title">>,
  sectionById: Map<string, ReminderSectionRow>,
) {
  const sectionNames: string[] = [];
  const seenSections = new Set<string>();
  let section = sectionById.get(page.subsection_id);
  while (section && !seenSections.has(section.id)) {
    seenSections.add(section.id);
    if (section.name) sectionNames.unshift(section.name);
    section = section.parent_id ? sectionById.get(section.parent_id) : undefined;
  }

  const parentPageNames: string[] = [];
  const seenPages = new Set<string>();
  let parent = page.parent_id ? pageById.get(page.parent_id) : undefined;
  while (parent && !seenPages.has(parent.id)) {
    seenPages.add(parent.id);
    if (parent.title) parentPageNames.unshift(parent.title);
    parent = parent.parent_id ? pageById.get(parent.parent_id) : undefined;
  }

  const hierarchy = [...sectionNames, ...parentPageNames]
    .filter((name, index, names) => name && (index === 0 || name !== names[index - 1]))
    .join(" › ");
  const pageLabel = `${page.serial} · ${page.title}`;
  return hierarchy
    ? { title: hierarchy, body: pageLabel }
    : { title: pageLabel, body: "" };
}

function subscriptionData(row: Pick<SubscriptionRow, "endpoint" | "p256dh" | "auth">): PushSubscriptionData {
  return { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } };
}

function pushPayload(
  title: string,
  body: string,
  url: string,
  tag?: string,
  serviceWorkerPresentation?: { title: string; body: string },
): DeclarativePushPayload {
  const navigate = new URL(url, APP_ORIGIN).href;
  return {
    web_push: 8030,
    notification: { title, body, navigate, silent: false, app_badge: "1", ...(tag ? { tag } : {}) },
    badgeCount: 1,
    ...(serviceWorkerPresentation ? { service_worker_presentation: serviceWorkerPresentation } : {}),
    title,
    body,
    url: navigate,
    ...(tag ? { tag } : {}),
  };
}

function validPushEndpoint(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("The notification subscription is invalid.");
  const hostname = url.hostname.toLowerCase();
  const knownPushService = hostname === "fcm.googleapis.com"
    || hostname.endsWith(".push.apple.com")
    || hostname.endsWith(".push.services.mozilla.com");
  if (!knownPushService) throw new Error("This browser notification service is not supported.");
  return url.toString();
}

export function normalizeSubscription(value: unknown): PushSubscriptionData {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const keys = record.keys && typeof record.keys === "object" ? record.keys as Record<string, unknown> : {};
  const endpoint = validPushEndpoint(String(record.endpoint ?? ""));
  const p256dh = String(keys.p256dh ?? "").trim();
  const auth = String(keys.auth ?? "").trim();
  if (!p256dh || !auth || p256dh.length > 500 || auth.length > 500) throw new Error("The notification subscription is incomplete.");
  return { endpoint, keys: { p256dh, auth } };
}

async function ensurePushStorage(db: D1Database) {
  // Local development can initialize these through db/runtime; hosted
  // databases are always prepared by Drizzle migrations before deployment.
  if (process.env.NODE_ENV === "production") return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
      user_agent TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS push_delivery_log (
      notification_key TEXT PRIMARY KEY, subscription_id TEXT NOT NULL, reminder_kind TEXT NOT NULL,
      reminder_id TEXT NOT NULL, reminder_at TEXT NOT NULL, sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_push_subscriptions_updated ON push_subscriptions(updated_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_push_delivery_subscription ON push_delivery_log(subscription_id, sent_at)"),
  ]);
}

export async function savePushSubscription(db: D1Database, subscription: PushSubscriptionData, userAgent = "") {
  const existing = await db.prepare("SELECT id FROM push_subscriptions WHERE endpoint = ?").bind(subscription.endpoint).first<{ id: string }>();
  const id = existing?.id ?? `push-${crypto.randomUUID()}`;
  await db.prepare(`INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, user_agent, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth,
      user_agent = excluded.user_agent, updated_at = CURRENT_TIMESTAMP`)
    .bind(id, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, userAgent.slice(0, 500)).run();
  return id;
}

export async function removePushSubscription(db: D1Database, endpoint: string) {
  const row = await db.prepare("SELECT id FROM push_subscriptions WHERE endpoint = ?").bind(endpoint).first<{ id: string }>();
  if (!row) return;
  await db.batch([
    db.prepare("DELETE FROM push_delivery_log WHERE subscription_id = ?").bind(row.id),
    db.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(row.id),
  ]);
}

export async function sendTestPush(env: PushRuntimeEnv, subscription: PushSubscriptionData) {
  const config = await verifiedVapidConfig(env);
  const delivered = await sendPushNotification(subscription, pushPayload(
    "Reminder",
    "",
    "/",
    "plant-journal-notifications-enabled",
  ), config, { urgency: "high", ttl: 300, timeoutMs: 15_000 });
  if (!delivered) throw new Error("This device's push subscription has expired. Turn notifications on again to create a new subscription.");
  console.info("[push] test notification accepted", { endpointHost: new URL(subscription.endpoint).hostname });
  return true;
}

export async function sendNotificationLayoutTest(env: PushRuntimeEnv) {
  const config = await verifiedVapidConfig(env);
  await ensurePushStorage(env.DB);
  const subscriptions = await env.DB
    .prepare("SELECT id, endpoint, p256dh, auth, created_at, updated_at FROM push_subscriptions ORDER BY updated_at DESC")
    .all<SubscriptionRow>();
  const hierarchy = "Operations / IR › Labor Deptt";
  const pageLabel = "7.6.1-P1 · Flamephotometer";
  const body = `${hierarchy}\n${pageLabel}`;
  const payload = pushPayload(
    "​",
    body,
    "/",
    "plant-journal-layout-test",
    { title: "", body },
  );

  let delivered = 0;
  let gone = 0;
  let failed = 0;
  await Promise.all(subscriptions.results.map(async (subscription) => {
    try {
      const accepted = await sendPushNotification(subscriptionData(subscription), payload, config, {
        urgency: "high",
        ttl: 300,
        timeoutMs: 15_000,
      });
      if (accepted) delivered += 1;
      else {
        gone += 1;
        await removePushSubscription(env.DB, subscription.endpoint);
      }
    } catch {
      failed += 1;
    }
  }));
  return { subscriptions: subscriptions.results.length, delivered, gone, failed };
}

async function dueReminders(db: D1Database, now: Date): Promise<DueReminder[]> {
  const current = plantDateTime(now);
  const start = plantDateTime(new Date(now.getTime() - PUSH_LOOKBACK_MS));
  const [pageRows, dayRows, departmentRows, subsectionRows, hierarchyPageRows] = await Promise.all([
    db.prepare(`SELECT id, serial, parent_id, subsection_id, reminder_date, reminder_repeat, reminder_end_date, reminder_closed_at, status, title
      FROM pages
      WHERE reminder_date IS NOT NULL AND reminder_date != ''
      ORDER BY reminder_date`)
      .all<ReminderPageRow>(),
    db.prepare(`SELECT id, plan_date, planned_time, reminder_repeat, reminder_end_date, reminder_closed_at, status, category, title, linked_page_id
      FROM day_plan_items
      WHERE planned_time IS NOT NULL AND planned_time != ''
      ORDER BY plan_date, planned_time`)
      .all<{ id: string; plan_date: string; planned_time: string; reminder_repeat: string | null; reminder_end_date: string | null; reminder_closed_at: string | null; status: string; category: string; title: string; linked_page_id: string | null }>(),
    db.prepare("SELECT id, name, parent_id FROM departments").all<ReminderSectionRow>(),
    db.prepare("SELECT id, name, parent_id FROM subsections").all<ReminderSectionRow>(),
    db.prepare("SELECT id, serial, parent_id, subsection_id, title FROM pages")
      .all<Pick<ReminderPageRow, "id" | "serial" | "parent_id" | "subsection_id" | "title">>(),
  ]);

  const pageById = new Map(hierarchyPageRows.results.map((row) => [row.id, row]));
  const sectionById = new Map([...departmentRows.results, ...subsectionRows.results].map((row) => [row.id, row]));

  const pages = pageRows.results.flatMap((row): DueReminder[] => {
    const reminderAt = dueOccurrence(row.reminder_date, row.reminder_repeat, row.reminder_end_date, row.reminder_closed_at, row.status === "Completed", start, current);
    const content = pageReminderContent(row, pageById, sectionById);
    return reminderAt ? [{
      kind: "page",
      id: row.id,
      reminderAt,
      title: content.title,
      body: content.body,
      url: `/?pushPage=${encodeURIComponent(row.id)}`,
    }] : [];
  });
  const days = dayRows.results
    .flatMap((row): DueReminder[] => {
      const reminderAt = dueOccurrence(`${row.plan_date}T${row.planned_time}`, row.reminder_repeat, row.reminder_end_date, row.reminder_closed_at, row.status !== "Active", start, current);
      const linkedPage = row.linked_page_id ? pageById.get(row.linked_page_id) : undefined;
      const content = linkedPage
        ? pageReminderContent(linkedPage, pageById, sectionById)
        : { title: row.category, body: row.title };
      return reminderAt ? [{
        kind: "my-day",
        id: row.id,
        reminderAt,
        title: content.title,
        body: content.body,
        url: `/?pushDay=${encodeURIComponent(row.plan_date)}&pushItem=${encodeURIComponent(row.id)}`,
      }] : [];
    });
  return [...pages, ...days];
}

async function sendReminder(env: PushRuntimeEnv, subscription: SubscriptionRow, reminder: DueReminder, config: VapidConfig): Promise<PushDeliveryResult> {
  const notificationKey = `${subscription.id}:${reminder.kind}:${reminder.id}:${reminder.reminderAt}`;
  const existing = await env.DB.prepare("SELECT notification_key FROM push_delivery_log WHERE notification_key = ?")
    .bind(notificationKey)
    .first<{ notification_key: string }>();
  if (existing) return "duplicate";

  try {
    const payload = pushPayload(reminder.title, reminder.body, reminder.url, `${reminder.kind}-${reminder.id}`);
    const delivered = await sendPushNotification(subscriptionData(subscription), payload, config, {
      urgency: "high",
      ttl: 86_400,
      topic: await topicFromString(notificationKey),
      timeoutMs: 15_000,
    });
    if (!delivered) {
      await removePushSubscription(env.DB, subscription.endpoint);
      console.warn("[push] expired subscription removed", { subscriptionId: subscription.id, reminderKind: reminder.kind, reminderId: reminder.id });
      return "gone";
    }
    await env.DB.prepare(`INSERT OR IGNORE INTO push_delivery_log
        (notification_key, subscription_id, reminder_kind, reminder_id, reminder_at)
        VALUES (?, ?, ?, ?, ?)`)
      .bind(notificationKey, subscription.id, reminder.kind, reminder.id, reminder.reminderAt)
      .run();
    console.info("[push] reminder accepted", { subscriptionId: subscription.id, reminderKind: reminder.kind, reminderId: reminder.id, reminderAt: reminder.reminderAt });
    return "delivered";
  } catch (error) {
    throw error;
  }
}

export async function dispatchDuePushNotifications(env: PushRuntimeEnv, now = new Date()) {
  const config = await verifiedVapidConfig(env);
  await ensurePushStorage(env.DB);
  const [subscriptions, reminders] = await Promise.all([
    env.DB.prepare("SELECT id, endpoint, p256dh, auth, created_at, updated_at FROM push_subscriptions ORDER BY updated_at DESC").all<SubscriptionRow>(),
    dueReminders(env.DB, now),
  ]);
  const summary: PushDispatchSummary = {
    subscriptions: subscriptions.results.length,
    reminders: reminders.length,
    delivered: 0,
    gone: 0,
    duplicate: 0,
    failed: 0,
    skippedBeforeSubscription: 0,
  };
  if (!subscriptions.results.length || !reminders.length) {
    console.info("[push] dispatch completed", summary);
    return summary;
  }

  const queue: Array<{ subscription: SubscriptionRow; reminder: DueReminder }> = [];
  for (const reminder of reminders) {
    for (const subscription of subscriptions.results) {
      const subscribedAt = createdAtMillis(subscription.created_at);
      if (Number.isFinite(subscribedAt) && reminderAtMillis(reminder.reminderAt) < subscribedAt) {
        summary.skippedBeforeSubscription += 1;
        continue;
      }
      queue.push({ subscription, reminder });
    }
  }

  const jobs = queue.values();
  const deliver = async () => {
    for (const { subscription, reminder } of jobs) {
      try {
        const result = await sendReminder(env, subscription, reminder, config);
        summary[result] += 1;
      } catch (error) {
        summary.failed += 1;
        console.error("[push] reminder delivery failed", {
          subscriptionId: subscription.id,
          reminderKind: reminder.kind,
          reminderId: reminder.id,
          reminderAt: reminder.reminderAt,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PUSH_CONCURRENCY, queue.length) }, deliver));
  await env.DB.prepare("DELETE FROM push_delivery_log WHERE sent_at < datetime('now', '-90 days')").run();
  console.info("[push] dispatch completed", summary);
  return summary;
}
