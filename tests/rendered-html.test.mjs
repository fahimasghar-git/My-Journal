import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Plant Operations Journal", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Plant Operations Journal<\/title>/i);
  assert.match(html, /Opening Plant Operations Journal/);
  assert.match(html, /og\.png/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("starter preview is fully removed", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(page, /JournalApp/);
  assert.match(layout, /Plant Operations Journal/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
  await access(new URL("../public/og.png", import.meta.url));
});

test("journal upgrade keeps dates optional and adds durable timeline fields", async () => {
  const [client, schema, migration] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0005_reflective_wrecking_crew.sql", import.meta.url), "utf8"),
  ]);
  assert.match(client, /dueDate:\s*null, ownerId:\s*null/);
  assert.match(client, /entryDate:\s*localDate\(\)/);
  assert.match(client, /Choose the source meeting/);
  assert.match(schema, /export const notebooks/);
  assert.match(schema, /reminderDate: text\("reminder_date"\)/);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM/i);
});

test("journal refinements include toggleable timed reminders, editable people, and stable section order", async () => {
  const [client, route, styles] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(client, /function AppTimeControl/);
  assert.match(client, /action: "unsubscribe"/);
  assert.match(client, /await subscription\.unsubscribe\(\)/);
  assert.match(client, /aria-pressed=\{pushStatus === "enabled"\}/);
  assert.match(client, /Completion date/);
  assert.match(route, /action === "updatePerson"/);
  assert.match(route, /nextSectionPosition/);
  assert.match(route, /a\.position - b\.position \|\| compareSerials/);
  assert.match(styles, /\.pane-resizer/);
  assert.match(styles, /--app-font: Calibri/);
  assert.match(styles, /\.supporting-people-modal/);
});

test("paper journal controls support reordering, progress, reminder resolution, and printing", async () => {
  const [client, route, styles] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(client, /Task progress/);
  assert.match(client, /Close reminder/);
  assert.match(client, /Print page/);
  assert.match(client, /Move up one level \/ make main section/);
  assert.doesNotMatch(client, /Custodian \/ Primary owner/);
  assert.match(route, /action === "reorderSection"/);
  assert.match(route, /rowid AS row_order/);
  assert.match(styles, /\.theme-paper/);
  assert.match(styles, /@media print/);
});

test("theme selection stays visible and new root sections cannot reuse the last number", async () => {
  const [client, route, styles] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(client, /className="app-theme-menu"/);
  assert.match(client, /aria-label="Application theme"/);
  assert.match(styles, /\.app-theme-menu/);
  assert.match(styles, /\.app-shell \.section-row\.selected/);
  assert.match(styles, /\.app-shell \.page-card\.selected/);
  assert.match(styles, /background: linear-gradient\(135deg, var\(--theme-accent\), var\(--theme-header\)\)/);
  assert.match(route, /const allSectionIds = new Set/);
  assert.match(route, /parentId: validParentId\(row\.parent_id, row\.department_id, row\.id\)/);
  assert.match(route, /UPDATE subsections SET parent_id = \?, serial_prefix = \?, department_id = \?/);
  assert.match(route, /if \(!parentId\)[\s\S]*nextSectionPrefix\(null, notebookId\)/);
  assert.doesNotMatch(route, /action === "createSection"[\s\S]{0,300}await normalizeSerialNumbers\(\)/);
  assert.match(route, /const position = await nextSectionPosition\(null, notebookId\)/);
});

test("new sections open independently, hierarchy state persists, and task dates stay manual", async () => {
  const [client, route] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(client, /const selectedPage = pageById\.get\(selectedPageId\);/);
  assert.doesNotMatch(client, /data\.pages\.find\(\(page\) => page\.id === selectedPageId\) \?\? data\.pages\[0\]/);
  assert.match(client, /journal-hierarchy-state:\$\{notebookId\}/);
  assert.match(client, /saveHierarchyState/);
  assert.match(client, /window\.matchMedia\("\(max-width: 480px\)"\)\.matches/);
  assert.match(client, /isMobile \? \[\.\.\.mobileDefaults\] : \[\]/);
  assert.match(route, /hierarchy_state:%/);
  assert.match(route, /action === "saveHierarchyState"/);
  assert.match(client, /journal-last-location/);
  assert.match(client, /onPageChange\(\{ \.\.\.page, status \}, true\)/);
  assert.match(client, /OptionalDateField label="Completion date"/);
  assert.match(route, /const section = await findSection\(subsectionId\)/);
  assert.match(route, /const dueDate = \/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\//);
  assert.match(route, /const completedDate = \/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\//);
  assert.doesNotMatch(route, /status === "Completed" \? plantDate\(\)/);
});

test("My Day uses column planning, immediate completion, scheduled dates, linked journal updates, and dated details", async () => {
  const [client, route, styles, schema, migration] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0006_stormy_serpent_society.sql", import.meta.url), "utf8"),
  ]);
  assert.match(client, /className="planner-columns"/);
  assert.match(client, /planner-column-add/);
  assert.match(client, /plannerView.*"day" \| "week" \| "month"/);
  assert.match(client, /Add to journal/);
  assert.match(client, /computeOutlineSerials\(baseSerial, ordered\)/);
  assert.match(client, /day-detail-date/);
  assert.match(client, /dayPlanItems: current\.dayPlanItems\.map\(\(item\) => item\.id === dayPlanId \? \{ \.\.\.item, status/);
  assert.match(route, /action === "saveDayPlanDetails"/);
  assert.match(route, /action === "linkDayPlanToJournal"/);
  assert.match(route, /UPDATE day_plan_items SET plan_date = \?/);
  assert.match(styles, /grid-template-columns: repeat\(3, minmax\(310px, 1fr\)\)/);
  assert.match(schema, /export const dayPlanDetails/);
  assert.match(migration, /CREATE TABLE `day_plan_details`/);
  assert.match(migration, /ADD `linked_page_id`/);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM/i);
});

test("My Day and journal update lines support durable media with a readable date-led planner", async () => {
  const [client, plannerRoute, pageRoute, schema, migration, styles] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/day-plan-attachments/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/attachments/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0007_nostalgic_wallop.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(client, /function InlineAttachmentTools/);
  assert.match(client, /Show completed/);
  assert.match(client, /className="planner-day-heading date-hero"/);
  assert.match(client, /onUploadAttachment\(page\.id, kind, file, item\.id\)/);
  assert.match(plannerRoute, /day_plan_attachments/);
  assert.match(plannerRoute, /detailId/);
  assert.match(pageRoute, /outlineId/);
  assert.match(schema, /export const dayPlanAttachments/);
  assert.match(migration, /CREATE TABLE `day_plan_attachments`/);
  assert.match(migration, /ADD `outline_id`/);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM/i);
  assert.match(styles, /\.date-hero-number/);
  assert.match(styles, /\.show-completed-button/);
});

test("task dates remain fully manual, My Day details wrap, and the journal has a mobile pane flow", async () => {
  const [client, route, styles, layout] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(client, /status === "In Progress" \? localDate\(\)/);
  assert.doesNotMatch(route, /status === "In Progress" \? plantDate\(\)/);
  assert.match(route, /const startDate = \/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\//);
  assert.match(client, /function OptionalDateField/);
  assert.match(client, /emptyLabel="CHOOSE DATE"/);
  assert.match(client, /<textarea rows=\{1\}/);
  assert.match(client, /fitDetailField/);
  assert.match(client, /mobile-pane-\$\{mobileJournalPane\}/);
  assert.match(styles, /@media \(max-width: 480px\)/);
  assert.match(styles, /\.mobile-journal-nav/);
  assert.match(styles, /\.planner-columns \{ grid-template-columns: 1fr/);
  assert.match(layout, /width: "device-width"/);
  assert.match(layout, /viewportFit: "cover"/);
});

test("page updates opt into task progress, long fields grow, promotion stays visible, and My Day times notify", async () => {
  const [client, route, styles, schema, migration] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0008_sharp_newton_destine.sql", import.meta.url), "utf8"),
  ]);
  assert.match(client, /item\.isTask && !richTextIsEmpty/);
  assert.match(client, /Make this a task/);
  assert.match(client, /Change to ordinary update/);
  assert.match(client, /compact \? recording \? "●" : "⋮" : "📎"/);
  assert.match(client, /AutoGrowTextarea className="planner-card-title"/);
  assert.match(client, /disabled=\{!data\.pages\.find\(\(item\) => item\.id === actionMenu\.id\)\?\.parentId\}/);
  assert.match(client, /function dayPlanReminderDate/);
  assert.match(client, /new Notification\(`My Day · \$\{item\.category\}`/);
  assert.match(route, /is_task/);
  assert.match(schema, /isTask: integer\("is_task"/);
  assert.match(migration, /ADD `is_task`/);
  assert.match(migration, /UPDATE `outline_items` SET `is_task` = true WHERE `completed` = true/);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM/i);
  assert.match(styles, /\.outline-update-mark/);
  assert.match(styles, /\.page-title-input \{ display: block; min-height: 0/);
});

test("new pages append after legacy pages and page fields remain compact", async () => {
  const [client, route, styles] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(route, /const positionDifference = a\.position - b\.position/);
  assert.match(route, /pagePositions\.set\(page\.id, index \+ 1\)/);
  assert.match(route, /UPDATE pages SET serial = \?, position = \?/);
  assert.match(route, /action === "createPage"[\s\S]*?await normalizeSerialNumbers\(\);[\s\S]*?nextPageSerial/);
  assert.match(client, /field\.style\.height = "auto"/);
  assert.match(client, /field\.style\.height = `\$\{field\.scrollHeight\}px`/);
  assert.match(styles, /\.task-facts \{ grid-template-columns: 110px 110px 120px/);
  assert.match(styles, /\.outline-row \{ grid-template-columns: 18px 72px[^}]*gap: 3px/);
  assert.match(styles, /\.outline-date \{ width: 72px; height: 25px; padding-right: 0; padding-left: 0; \}/);
  assert.match(styles, /\.outline-date::-webkit-calendar-picker-indicator \{ width: 10px; height: 10px; margin: 0; padding: 0; \}/);
  assert.match(styles, /\.outline-serial \{ padding: 3px 0 0; white-space: nowrap; \}/);
  assert.match(styles, /\.outline-serial::after \{ content: ""; display: inline-block; width: 9px; height: 2px; margin-left: 1px;/);
  assert.match(styles, /\.task-facts > :nth-child\(-n\+3\) \{ grid-column: span 2; \}/);
});

test("My Day detail lines opt into completion and planner cards open in a focused view", async () => {
  const [client, route, schema, migration, styles] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0009_smooth_tyrannus.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(client, /type DayPlanDetail = \{[^}]*isTask: boolean/);
  assert.match(client, /Make this a task/);
  assert.match(client, /Change to ordinary detail/);
  assert.match(client, /className="planner-focus-backdrop"/);
  assert.match(client, /role=\{focused \? "dialog" : undefined\}/);
  assert.match(client, /if \(event\.key === "Escape"\) setFocusedItemId\(""\)/);
  assert.match(route, /day_plan_details \(id, chain_id, level, position, text, is_task, completed, entry_date\)/);
  assert.match(schema, /isTask: integer\("is_task"/);
  assert.match(migration, /ALTER TABLE `day_plan_details` ADD `is_task`/);
  assert.match(migration, /UPDATE `day_plan_details` SET `is_task` = true WHERE `completed` = true/);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM/i);
  assert.match(styles, /\.planner-card\.focused/);
  assert.match(styles, /\.day-detail-update-mark/);
});

test("mobile journal preserves update hierarchy, centers focused cards, and exposes notebooks", async () => {
  const [client, styles] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(client, /import \{ createPortal \} from "react-dom"/);
  assert.match(client, /className="mobile-notebook-switcher"/);
  assert.match(client, /aria-label="Select notebook on mobile"/);
  assert.match(client, /aria-label="Add notebook on mobile"/);
  assert.match(client, /createPortal\(<div className="planner-focus-backdrop"/);
  assert.match(styles, /\.outline-row\.level-1 \{ width: calc\(100% - 14px\); margin-left: 14px !important; \}/);
  assert.match(styles, /\.outline-row\.level-3 \{ width: calc\(100% - 42px\); margin-left: 42px !important; \}/);
  assert.match(styles, /\.planner-focus-backdrop \{ top: calc\(104px \+ env\(safe-area-inset-top\)\);/);
  assert.match(styles, /\.mobile-notebook-switcher select/);
  assert.match(styles, /grid-template-rows: 92px minmax\(0, 1fr\)/);
});

test("mobile line menus anchor to their trigger, dismiss safely, lock scrolling, and align update metadata", async () => {
  const [client, styles] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(client, /trigger\.getBoundingClientRect\(\)/);
  assert.match(client, /className="inline-menu-backdrop"/);
  assert.match(client, /body\.classList\.add\("inline-menu-open"\)/);
  assert.match(client, /if \(event\.key === "Escape"\) setMenuOpen\(false\)/);
  assert.match(client, /style=\{menuPosition\}/);
  assert.match(styles, /\.inline-menu-backdrop \{ position: fixed; z-index: 149; inset: 0;/);
  assert.match(styles, /body\.inline-menu-open \{ overflow: hidden; overscroll-behavior: none; \}/);
  assert.doesNotMatch(styles, /\.inline-media-menu \{ position: fixed; top: auto; right: 10px; bottom:/);
  assert.match(styles, /\.outline-date::-webkit-datetime-edit \{ padding: 0; \}/);
  assert.match(styles, /\.outline-serial \{ grid-column: 3; grid-row: 2; width: 132px; padding: 0; font-size: 14px;/);
});

test("mobile journal lines have a separate left hierarchy menu", async () => {
  const [client, styles] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(client, /className="outline-hierarchy-tools"/);
  assert.match(client, /label: "Indent right"/);
  assert.match(client, /label: "Indent left"/);
  assert.match(client, /actionsOnly/);
  assert.match(client, /disabled: item\.level === 0/);
  assert.match(styles, /\.outline-hierarchy-tools \{ display: none; \}/);
  assert.match(styles, /\.outline-hierarchy-tools \{ display: flex; grid-column: 1; grid-row: 1 \/ 3;/);
  assert.match(styles, /\.outline-row \{ grid-template-columns: 24px 20px minmax\(0, 1fr\) 32px;/);
  assert.match(client, /dots: "⋮"/);
  assert.match(styles, /\.outline-hierarchy-tools \.inline-media-button \{ width: 22px !important; min-height: 30px !important; border: 0 !important; background: transparent !important;/);
});

test("every overflow menu stays anchored to its trigger and page media controls stay distinct", async () => {
  const [client, styles] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(client, /function menuAnchor\(event: React\.MouseEvent\)/);
  assert.match(client, /event\.currentTarget\.getBoundingClientRect\(\)/);
  assert.match(client, /style=\{actionMenuStyle\(actionMenu\)\}/);
  assert.match(client, /className="page-media-actions"/);
  assert.doesNotMatch(styles, /\.context-menu \{ position: fixed !important; top: auto !important;/);
  assert.doesNotMatch(styles, /\.attachment-menu \{ position: fixed; top: auto;/);
  assert.match(styles, /\.page-media-actions \{ display: flex; align-items: center; gap: 6px; \}/);
  assert.match(styles, /\.page-media-actions > \.audio-tool-button,[\s\S]*?margin-left: 0; border-radius: 6px;/);
});

test("the journal has a private British-English editor with durable learned words", async () => {
  const [client, route, styles, packageJson] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(packageJson, /"harper\.js": "2\.4\.0"/);
  assert.match(client, /new harper\.WorkerLinter/);
  assert.match(client, /dialect: harper\.Dialect\.British/);
  assert.match(client, /Checked locally on this device/);
  assert.match(client, /Change all/);
  assert.match(client, /Ignore once/);
  assert.match(client, /Learn “\{issue\.problem\}”/);
  assert.match(client, /spellCheck/);
  assert.match(client, /lang="en-GB"/);
  assert.match(route, /editor_dictionary/);
  assert.match(route, /action === "learnEditorWord" \|\| action === "removeEditorWord"/);
  assert.match(styles, /\.private-editor-card\.spelling/);
  assert.match(styles, /\.private-editor-card \{[^}]*border-left: 4px solid #376fbd/);
  assert.match(styles, /\.private-editor-panel \{ position: fixed; top: calc\(104px \+ env\(safe-area-inset-top\)\);/);
});

test("installed iPhone web app receives durable background reminder notifications", async () => {
  const [client, route, push, worker, vite, schema, migration, serviceWorker, manifest] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/push/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/push.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0010_eminent_talkback.sql", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
  ]);
  assert.match(client, /Enable notifications/);
  assert.match(client, /registration\.pushManager\.subscribe/);
  assert.match(client, /pushPage/);
  assert.match(route, /sendTestPush/);
  assert.match(route, /verifyVapidKeyPair/);
  assert.match(push, /sendPushNotification/);
  assert.match(push, /web_push: 8030/);
  assert.match(push, /notification: \{ title, body, navigate, silent: false/);
  assert.match(push, /configured VAPID public and private keys do not match/);
  assert.match(push, /push_delivery_log/);
  assert.match(push, /PUSH_LOOKBACK_MS = 15 \* 60 \* 1000/);
  assert.match(push, /ORDER BY updated_at DESC/);
  assert.match(push, /PUSH_CONCURRENCY = 16/);
  assert.match(push, /await sendPushNotification[\s\S]*INSERT OR IGNORE INTO push_delivery_log/);
  assert.match(worker, /async scheduled/);
  assert.doesNotMatch(worker, /schedulePushFallback|fallback dispatch failed/);
  assert.match(vite, /crons: \["\* \* \* \* \*"\]/);
  assert.match(schema, /export const pushSubscriptions/);
  assert.match(migration, /CREATE TABLE `push_subscriptions`/);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM/i);
  assert.match(serviceWorker, /showNotification/);
  assert.match(serviceWorker, /notificationclick/);
  assert.match(serviceWorker, /const notification = payload\.notification \|\| payload/);
  assert.match(serviceWorker, /const presentation = payload\.service_worker_presentation/);
  assert.match(serviceWorker, /showNotification\(title/);
  assert.match(serviceWorker, /tag: notification\.tag \|\| payload\.tag/);
  assert.match(serviceWorker, /data: \{ url: notification\.navigate \|\| payload\.url \|\| "\/" \}/);
  assert.doesNotMatch(serviceWorker, /\/icon\.png/);
  assert.match(client, /register\("\/sw\.js", \{ updateViaCache: "none" \}\)/);
  assert.match(client, /await registration\.update\(\)/);
  assert.match(manifest, /"display": "standalone"/);
});

test("mobile dates require confirmation, supporter avatars stay horizontal, and zoom can be locked", async () => {
  const [client, styles, layout] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(client, /ariaLabel=\{`Choose \$\{label\.toLowerCase\(\)\}`\} emptyLabel="CHOOSE DATE" onChange=\{stageDate\}/);
  assert.match(client, /className="date-confirmation-card"/);
  assert.match(client, /onChange\(draftDate \|\| null\)/);
  assert.match(client, /className="date-current-row"/);
  assert.match(styles, /\.task-facts \.supporting-picker-button \.avatar-row \{ display: flex; flex-flow: row nowrap;/);
  assert.match(styles, /\.date-current-row \{ display: grid;/);
  assert.match(client, /journal-mobile-zoom/);
  assert.match(client, /className=\{`zoom-toggle-button/);
  assert.match(layout, /userScalable: false/);
});

test("iOS-style reminder settings support end-repeat and daily reminders that only stop when closed", async () => {
  const [client, route, styles, schema, push] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/push.ts", import.meta.url), "utf8"),
  ]);
  assert.match(client, /Daily until closed/);
  assert.match(client, /Completion and closure are separate/);
  assert.match(client, /Close reminder cycle/);
  assert.match(client, /reminderRepeat !== "daily-until-closed"/);
  assert.match(route, /reminder_repeat = 'daily-until-closed'/);
  assert.match(schema, /reminderEndDate: text\("reminder_end_date"\)/);
  assert.match(push, /dueOccurrence/);
  assert.match(styles, /\.ios-reminder-sheet/);
  assert.match(styles, /#007aff/);
});

test("mobile section and page creation use compact fixed full-width centred bottom actions", async () => {
  const [client, styles] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(client, /＋ Add section/);
  assert.match(client, /＋ Add page/);
  assert.match(styles, /\.journal-panes\.mobile-pane-sections > \.hierarchy-pane \{ display: flex; flex-direction: column;[\s\S]*?overflow: hidden;/);
  assert.match(styles, /\.add-section-bottom, \.add-page-bottom \{[\s\S]*?justify-content: center;[\s\S]*?flex: 0 0 46px;[\s\S]*?width: 100%;[\s\S]*?height: 46px;[\s\S]*?font-weight: 780;/);
});

test("mobile sections behave as a fixed app pane with vertical-only list scrolling", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /\.journal-mobile-shell \{[\s\S]*?max-width: 100vw;[\s\S]*?overflow: hidden;[\s\S]*?overscroll-behavior-x: none;/);
  assert.match(styles, /\.journal-panes\.mobile-pane-sections > \.hierarchy-pane \.department-tree \{[\s\S]*?overflow-x: hidden;[\s\S]*?overflow-y: auto;[\s\S]*?touch-action: pan-y;/);
});

test("mobile journal hierarchy has separate readable one-tap controls", async () => {
  const [client, styles] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(client, /aria-expanded=\{!collapsedSections\.has\(node\.id\)\}/);
  assert.match(client, /className="section-main" onClick=\{\(\) => node\.kind === "department" \? onDepartment\(node\.id\) : subsection && onSubsection\(subsection\)\}/);
  assert.match(client, /className="page-card-due"/);
  assert.match(styles, /\.item-menu-button \{[\s\S]*?opacity: 1;/);
  assert.match(styles, /\.journal-panes\.mobile-pane-sections \.section-row \{ grid-template-columns: 17px 36px minmax\(0, 1fr\) 36px; \}/);
  assert.match(styles, /\.smart-views em, \.section-main em \{ font-size: 12\.5px; font-weight: 820; \}/);
  assert.match(styles, /\.tab-bar > button \{ flex: 1 1 20%;[\s\S]*?font-size: 12\.5px;[\s\S]*?font-weight: 680;/);
  assert.match(styles, /\.page-card-due \{ display: flex; align-items: center; gap: 7px; \}/);
});

test("Focus header follows the same hierarchy guides as section arrows and names", async () => {
  const [client, styles] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(client, /className="focus-leading-spacer"/);
  assert.match(client, /className="focus-label-spacer"/);
  assert.match(client, /className="focus-menu-spacer"/);
  assert.match(styles, /\.smart-views \.focus-collapse-button \{ grid-template-columns: 17px 20px 17px minmax\(0, 1fr\) auto 27px;/);
  assert.match(styles, /\.journal-panes\.mobile-pane-sections \.focus-collapse-button \{ grid-template-columns: 17px 36px 17px minmax\(0, 1fr\) auto 36px; \}/);
  assert.match(styles, /\.focus-collapse-button \.tree-toggle \{ position: relative; left: 6px;/);
  assert.match(styles, /\.focus-collapse-button strong \{ position: relative; left: 6px; font-size: 11\.5px; font-weight: 630; text-transform: none; letter-spacing: normal; \}/);
  assert.match(styles, /\.section-copy strong, \.focus-collapse-button strong, \.page-card > strong \{ font-size: 15px; \}/);
  assert.match(styles, /\.mobile-pane-switches button \{[\s\S]*?font-size: 13px; font-weight: 750; \}/);
  assert.match(styles, /\.mobile-pane-switches button span \{[\s\S]*?font-size: 10px; font-weight: 800; \}/);
});

test("Dashboard navigation and mobile browser history behave like app navigation", async () => {
  const [client, styles] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(client, /onOpenFilter\("today"\)/);
  assert.match(client, /onOpenFilter\("overdue"\)/);
  assert.match(client, /onOpenFilter\("waiting"\)/);
  assert.match(client, /onOpenFilter\("completed"\)/);
  assert.match(client, /onOpenDepartment\(department\.id\)/);
  assert.doesNotMatch(client, /Open today’s journal/);
  assert.match(client, /window\.history\.pushState\(\{ \.\.\.state, plantJournalNavigation: snapshot \}, ""\)/);
  assert.match(client, /window\.addEventListener\("popstate", restoreNavigation\)/);
  assert.match(client, /setMobileJournalPane\(snapshot\.mobileJournalPane\)/);
  assert.match(styles, /\.department-cards > button \{/);
});

test("the left indent menu is positioned before its first paint", async () => {
  const client = await readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8");
  assert.match(client, /import \{ useEffect, useLayoutEffect, useMemo, useRef, useState \} from "react"/);
  assert.match(client, /useLayoutEffect\(\(\) => \{\n    if \(!menuOpen\) return;/);
  assert.match(client, /positionMenu\(\);\n    body\.classList\.add\("inline-menu-open"\)/);
});

test("mobile My Day week cards use full dates, readable type, and true viewport dialogs", async () => {
  const [client, styles] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(client, /function ordinalDay\(day: number\)/);
  assert.match(client, /return `\$\{weekday\} \$\{ordinalDay\(date\.getDate\(\)\)\} \$\{monthYear\}`/);
  assert.match(client, /<strong>\{fullPlannerDate\(date\)\}<\/strong>/);
  assert.match(client, /createPortal\(<div className="modal-backdrop planner-modal-backdrop"/);
  assert.match(client, /document\.body\.classList\.add\("my-day-overlay-open"\)/);
  assert.match(styles, /body\.my-day-overlay-open \.my-day-view \{ overflow: hidden !important; touch-action: none; pointer-events: none; \}/);
  assert.match(styles, /\.week-plan-item strong \{ overflow: visible; font-size: 15px;/);
  assert.match(styles, /\.week-plan-item span \{ margin-top: 4px; font-size: 13px;/);
  assert.match(styles, /\.planner-modal-backdrop \{ inset: 0; place-items: center;/);
});

test("My Day progress leads the card and parent updates become headings", async () => {
  const [client, styles] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(client, /item\.level === 0 && \(items\[index \+ 1\]\?\.level \?\? 0\) > item\.level \? "outline-parent-heading"/);
  assert.ok(client.indexOf('className="planner-card-progress"') < client.indexOf('className="planner-card-controls"'));
  assert.match(styles, /\.day-detail-row \{ grid-template-columns: 22px 64px 38px minmax\(0, 1fr\) 30px;/);
  assert.match(styles, /\.planner-card\.focused \.day-detail-row \{ grid-template-columns: 24px 68px 42px minmax\(0, 1fr\) 32px;/);
  assert.match(styles, /\.outline-row\.outline-parent-heading \[contenteditable\] \{ font-size: 16px; font-weight: 780; line-height: 1\.4;/);
  assert.match(styles, /\.outline-row\.outline-parent-heading \[contenteditable\] \{ color: var\(--theme-header\); font-size: inherit; font-weight: 780; line-height: 1\.4;/);
});

test("compact dated lines, assignees, and journal page cleanup remain durable", async () => {
  const [client, route, styles, schema, migration] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0012_pink_liz_osborn.sql", import.meta.url), "utf8"),
  ]);
  assert.match(client, /function compactLineDate\(value: string \| null\)/);
  assert.match(client, /return value \? formatAppDate\(value\) : "Set date"/);
  assert.match(client, /wrapperClassName="outline-date-control"/);
  assert.match(client, /wrapperClassName="day-detail-date-control"/);
  assert.match(client, /className="planner-assignee-field"/);
  assert.match(client, /<b className="supporting-action-desktop">Choose ▾<\/b>/);
  assert.doesNotMatch(client, /Primary responsibility:/);
  assert.doesNotMatch(client, /Formatting the selected update line/);
  assert.ok(client.indexOf('className="task-facts"') < client.indexOf('className="page-progress"'));
  assert.match(schema, /assigneeId: text\("assignee_id"\)/);
  assert.match(route, /assignee_id = \?/);
  assert.match(route, /row\.assignee_id \|\| null/);
  assert.match(migration, /ADD `assignee_id` text/);
  assert.doesNotMatch(migration, /DROP|DELETE/i);
  assert.match(styles, /\.outline-row \{ grid-template-columns: 18px 70px max-content minmax\(180px, 1fr\) 28px;/);
  assert.match(styles, /grid-template-columns: 22px 20px 84px max-content minmax\(0, 1fr\) 30px/);
  assert.match(styles, /\.app-shell \.page-media-actions \.page-tool-button \{/);
});

test("collapsed My Day cards stay concise and dated line typography remains paired", async () => {
  const [client, styles] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(client, /!focused && <div className="planner-card-summary-schedule">/);
  assert.match(client, /\{focused && <>[\s\S]*className="planner-card-progress"[\s\S]*className="planner-card-controls"/);
  assert.doesNotMatch(client, /Smart carry-forward/);
  assert.doesNotMatch(client, /completed or resolved/);
  assert.doesNotMatch(client, /Tasks, calls and emails—with unfinished work carried forward automatically/);
  assert.match(client, /wrapperClassName="date-value-button page-date-desktop-control"[\s\S]*?onChange=\{stageDate\}/);
  assert.match(client, /wrapperClassName="date-value-button page-date-mobile-control"/);
  assert.match(client, /wrapperClassName="optional-date-button page-date-mobile-control"/);
  assert.match(client, /emptyLabel="CHOOSE DATE"/);
  assert.match(styles, /\.app-shell \.outline-date-control,\s*\.app-shell \.outline-serial \{ font-size: 10px; font-weight: 600;/);
  assert.match(styles, /\.app-shell \.day-detail-date-control,\s*\.app-shell \.day-detail-serial,/);
  assert.match(styles, /\.date-current-row \{ grid-template-columns: minmax\(0, 1fr\); grid-template-rows: auto auto;/);
  assert.match(styles, /\.date-current-row > \.clear-date-button \{ grid-column: 1; grid-row: 2; justify-self: end; min-width: 0; min-height: 18px;/);
  assert.match(styles, /\.app-shell \.tab-bar > button \{\s*min-height: 41px;[\s\S]*font-size: 15px;[\s\S]*font-weight: 700;/);
});

test("journal dates stay British and mobile page controls remain intentionally scoped", async () => {
  const [client, styles, dateFormat] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../lib/date-format.ts", import.meta.url), "utf8"),
  ]);
  assert.match(client, /import \{ formatAppDate \} from "@\/lib\/date-format"/);
  assert.match(dateFormat, /APP_DATE_FORMAT = "dd\/mm\/yyyy"/);
  assert.match(dateFormat, /`\$\{match\[3\]\}\/\$\{match\[2\]\}\/\$\{match\[1\]\}`/);
  assert.doesNotMatch(client, /Not set · choose date/);
  assert.doesNotMatch(client, /date-prompt-desktop|date-prompt-mobile/);
  assert.match(client, /className="supporting-unassigned-mobile">Unassigned<\/em>/);
  assert.match(client, /className="owner-fact"[\s\S]*className="fact-select-control"[\s\S]*className="fact-select-chevron"/);
  assert.match(styles, /@media \(max-width: 480px\) \{[\s\S]*\.page-heading-row \{[\s\S]*grid-template-columns: minmax\(0, 1fr\);[\s\S]*\.heading-controls \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[\s\S]*gap: 0;/);
  assert.match(styles, /\.heading-controls > \.select-box \{[\s\S]*grid-column: auto;[\s\S]*width: 100%;[\s\S]*min-height: 72px/);
  assert.match(styles, /\.app-shell \.task-facts > \.date-fact > span:first-child \{[\s\S]*font-weight: 900 !important;[\s\S]*-webkit-text-stroke: \.24px currentColor;/);
  assert.match(styles, /\.date-fact > \.optional-date-button em \{[\s\S]*font-size: 10px;[\s\S]*font-weight: 700;/);
  assert.match(styles, /\.date-fact > \.optional-date-button input::-webkit-date-and-time-value \{ visibility: hidden; \}/);
  assert.match(styles, /@media \(max-width: 480px\) \{[\s\S]*\.app-shell \.task-facts \.manage-team-link \{/);
  assert.match(styles, /\.supporting-none-desktop, \.supporting-action-desktop \{ display: none; \}/);
  assert.match(styles, /\.task-facts \.owner-fact > \.fact-select-control,[\s\S]*\.task-facts \.supporting-picker-button \{[\s\S]*min-height: 34px;[\s\S]*padding: 0 25px 0 0;[\s\S]*border: 0;/);
  assert.match(styles, /\.task-facts \.owner-fact > \.fact-select-control > \.fact-select-chevron,[\s\S]*\.task-facts \.supporting-picker-button > \.fact-select-chevron \{ position: absolute; top: 50%; right: 0; transform: translateY\(-50%\); \}/);
  assert.match(styles, /\.task-facts \.fact-select-chevron::before \{ top: 2px; transform: rotate\(225deg\); \}/);
});

test("laptop journal labels and My Day dated lines share stable typography", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /@media \(min-width: 769px\) \{[\s\S]*\.app-shell \.heading-controls \.select-box > span,[\s\S]*\.app-shell \.task-facts > \.date-fact > span:first-child \{[\s\S]*color: #5f5963;[\s\S]*font-weight: 900 !important;[\s\S]*-webkit-text-stroke: \.12px currentColor;/);
  assert.match(styles, /@media \(min-width: 769px\) \{[\s\S]*\.app-shell \.task-facts \.manage-team-link \{[\s\S]*min-height: 25px;[\s\S]*border: 1px solid/);
  assert.match(styles, /\.app-shell \.day-detail-date-control,[\s\S]*\.app-shell \.planner-add-details \.day-detail-serial \{[\s\S]*align-items: center;[\s\S]*height: 29px;[\s\S]*font-size: 10px;[\s\S]*font-weight: 600;/);
});

test("journal keeps page reminders while line-level reminders stay removed", async () => {
  const [client, route, styles, schema, runtime, push, migration] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/runtime.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/push.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0013_sharp_natasha_romanoff.sql", import.meta.url), "utf8"),
  ]);
  assert.match(client, /function pageReminderOccurrence\(page: Page/);
  assert.match(client, /className=\{`page-reminder-button/);
  assert.doesNotMatch(client, /const \[reminderItemId, setReminderItemId\]/);
  assert.doesNotMatch(client, /Return to this exact update/);
  assert.match(client, /title=\{page\.title\}[\s\S]*dateTime=\{page\.reminderDate \?\? null\}/);
  assert.doesNotMatch(client, /reminder-toast-stack/);
  assert.match(client, /pageFirstReminderDate\(page, data\)/);
  assert.match(route, /reminderDate: row\.reminder_date/);
  assert.match(route, /reminder_date = \?, reminder_repeat = \?, reminder_end_date = \?, reminder_closed_at = \?/);
  assert.match(schema, /reminderDate: text\("reminder_date"\)/);
  assert.match(runtime, /ALTER TABLE pages ADD COLUMN reminder_date TEXT/);
  assert.match(push, /kind: "page" \| "my-day"/);
  assert.doesNotMatch(push, /kind: "outline"/);
  assert.match(push, /FROM pages[\s\S]*WHERE reminder_date IS NOT NULL/);
  assert.match(migration, /ALTER TABLE `pages` ADD `reminder_date` text/);
  assert.doesNotMatch(migration, /DROP|DELETE/i);
  assert.match(styles, /\.page-reminder-button \{/);
  assert.match(styles, /@media \(max-width: 480px\) \{[\s\S]*\.page-reminder-button \{ grid-column: 2;/);
});

test("idle screens refresh across devices while pasted and entered journal lines stay clean", async () => {
  const client = await readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(client, /window\.setInterval\(refreshWhenIdle, 4_000\)/);
  assert.match(client, /Date\.now\(\) - lastFullRefreshAt\.current < 30_000/);
  assert.match(client, /window\.addEventListener\("focus", refreshWhenIdle\)/);
  assert.match(client, /document\.addEventListener\("visibilitychange", onVisibilityChange\)/);
  assert.match(client, /Object\.keys\(saveTimers\.current\)\.length > 0/);
  assert.match(client, /active\?\.matches\("input, textarea, select"\)/);
  assert.match(client, /const timerKey = `outline:\$\{pageId\}`/);
  assert.match(client, /saveTimers\.current\[timerKey\] = window\.setTimeout\([\s\S]*?650\)/);
  assert.match(client, /dataVersion !== localDataVersion\.current/);
  assert.match(client, /background && backgroundLoadInFlight\.current/);
  assert.match(client, /background && snapshot === stateSnapshot\.current/);
  assert.match(client, /function cleanPastedText\(value: string\)/);
  assert.match(client, /function trimRichTextEmptyEdges\(value: string\)/);
  assert.match(client, /const pasted = cleanPastedText\(event\.clipboardData\.getData\("text\/plain"\)\)/);
  assert.match(client, /event\.key === "Enter" && event\.shiftKey[\s\S]*insertLineBreak/);
  assert.match(client, /if \(event\.key === "Enter"\) \{[\s\S]*id: `outline-\$\{crypto\.randomUUID\(\)\}`/);
  assert.match(client, /function anchoredInlineMenuPosition\(trigger: DOMRect/);
  assert.match(client, /setMenuPosition\(anchoredInlineMenuPosition\(event\.currentTarget\.getBoundingClientRect\(\)/);
});

test("bottom-screen reminder cards are removed on desktop and mobile", async () => {
  const client = await readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(client, /function SwipeDismissReminderCard/);
  assert.doesNotMatch(client, /className="reminder-toast-stack"/);
  assert.doesNotMatch(client, /visibleDuePageReminders/);
});

test("page media controls read as separate buttons and mobile avoids a duplicate serial", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /\.page-media-actions \{ display: flex; align-items: center; gap: 6px; \}/);
  assert.match(styles, /\.page-media-actions > \.audio-tool-button,[\s\S]*?margin-left: 0; border-radius: 6px;/);
  assert.match(styles, /\.app-shell \.page-media-actions \.page-tool-button \{[\s\S]*?border-radius: 7px;[\s\S]*?box-shadow:/);
  assert.match(styles, /@media \(max-width: 480px\) \{[\s\S]*?\.page-serial-label \{ display: none; \}/);
  assert.match(styles, /\.page-media-actions > \.attachment-control,[\s\S]*?flex: 1 1 0;/);
});

test("page actions share one scale and My Day uses a dated navigation badge", async () => {
  const [client, styles] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(client, /className="my-day-date-icon"[\s\S]*?reminderNow\.getDate\(\)/);
  assert.match(styles, /\.my-day-date-icon \{[\s\S]*?width: 18px; height: 18px;/);
  assert.match(styles, /\.app-shell \.page-reminder-button,[\s\S]*?\.app-shell \.page-media-actions \.page-tool-button \{[\s\S]*?min-height: 38px;[\s\S]*?background: #fbfaf8;/);
  assert.match(styles, /\.app-shell \.page-media-actions \.audio-tool-button > span \{ color: #c33b45; font-size: 16px;/);
});

test("adaptive dates, centred supporter selection, and compact reminder geometry stay consistent", async () => {
  const [client, route, styles, desktopStyles, mobileStyles, layout, dateFormat] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/desktop.css", import.meta.url), "utf8"),
    readFile(new URL("../app/mobile.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/date-format.ts", import.meta.url), "utf8"),
  ]);
  assert.match(client, /function AppDateControl/);
  assert.match(client, /roomBelow >= estimatedHeight \|\| roomBelow >= rect\.top/);
  assert.match(client, /onChange\(event\.target\.value\); event\.currentTarget\.blur\(\); setPickerOpen\(false\)/);
  assert.match(client, /wrapperClassName="ios-reminder-date-control"/);
  assert.match(client, /className="ios-reminder-time-control" ariaLabel="Reminder time"/);
  assert.doesNotMatch(client, /type="time"|type="datetime-local"/);
  assert.match(client, /createPortal\(<div className="modal-backdrop supporting-overlay"/);
  assert.match(route, /formatAppDate\(String\(item\.plan_date\)\)/);
  assert.match(route, /startsWith\("my-day-link-"\) \? formatEmbeddedAppDates/);
  assert.match(dateFormat, /"dd\/mm\/yyyy"/);
  assert.match(styles, /\.page-serial-label \{ display: none; \}/);
  assert.match(layout, /import "\.\/desktop\.css";[\s\S]*import "\.\/mobile\.css";/);
  assert.match(desktopStyles, /@media screen and \(min-width: 769px\)/);
  assert.doesNotMatch(desktopStyles, /max-width: 768px/);
  assert.match(desktopStyles, /\.ios-reminder-mobile-datetime \{ display: none; \}/);
  assert.match(desktopStyles, /\.ios-settings-date \{[\s\S]*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(desktopStyles, /\.ios-reminder-desktop-datetime \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[\s\S]*width: calc\(100% \+ 26px\);/);
  assert.match(desktopStyles, /\.section-copy \{[\s\S]*?grid-template-columns: auto minmax\(0, 1fr\);[\s\S]*?align-items: center;/);
  assert.match(desktopStyles, /\.section-main em \{ align-self: center; line-height: 1\.2; \}/);
  assert.match(desktopStyles, /\.planner-card\.focused \.planner-schedule-row \{[\s\S]*?grid-template-columns: 118px 170px max-content minmax\(134px, 1fr\);[\s\S]*?margin: 14px 0 12px;/);
  assert.match(desktopStyles, /\.planner-card\.focused \.app-time-control \{[\s\S]*?minmax\(48px, 1\.1fr\);/);
  assert.match(mobileStyles, /@media screen and \(max-width: 768px\)/);
  assert.doesNotMatch(mobileStyles, /min-width: 769px/);
  assert.match(mobileStyles, /\.ios-reminder-desktop-datetime \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); gap: 0; width: calc\(100% \+ 26px\); margin: 0 -13px -8px; \}/);
  assert.match(mobileStyles, /\.planner-reminder-setting \{ grid-column: 1; width: 100%; justify-self: stretch; \}/);
  assert.match(mobileStyles, /\.section-copy \{[\s\S]*?grid-template-columns: auto minmax\(0, 1fr\);[\s\S]*?align-items: center;/);
  assert.match(mobileStyles, /\.planner-card\.focused \.app-time-control \{[\s\S]*?minmax\(48px, 1\.1fr\);/);
  assert.match(mobileStyles, /\.page-reminder-button \{ grid-column: 2; width: max-content; max-width: none; \}/);
  assert.match(styles, /\.supporting-overlay \{ width: 100vw; height: 100dvh; overflow: hidden; overscroll-behavior: contain; \}/);
  assert.match(styles, /\.page-date-mobile-control \{ display: none; \}/);
  assert.match(mobileStyles, /\.task-facts > \.date-fact \.page-date-desktop-control \{ display: none !important; \}[\s\S]*?\.page-date-mobile-control \{ display: flex; \}/);
  assert.match(mobileStyles, /\.task-facts > \.date-fact \.date-current-row \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto;[\s\S]*?grid-template-rows: 31px;/);
  assert.match(mobileStyles, /\.task-facts > \.date-fact \.date-current-row > \.clear-date-button \{[\s\S]*?grid-column: 2;[\s\S]*?min-height: 31px;/);
  assert.match(mobileStyles, /\.optional-date-button\.page-date-mobile-control input \{[\s\S]*?opacity: 0 !important;[\s\S]*?-webkit-text-fill-color: transparent !important;/);
});

test("date pickers dismiss outside, the header reminder counter stays removed, and mobile reuses universal search", async () => {
  const [client, styles] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(client, /document\.addEventListener\("pointerdown", closeOutside, true\)/);
  assert.match(client, /document\.addEventListener\("touchstart", closeOutside, true\)/);
  assert.match(client, /<div className="ios-settings-date">/);
  assert.doesNotMatch(client, /<label className="ios-settings-date">/);
  assert.doesNotMatch(client, /className="reminder-indicator"/);
  assert.doesNotMatch(client, /dueReminderCount/);
  assert.match(client, /className="mobile-search-button"/);
  assert.match(client, /className="mobile-search-backdrop"/);
  assert.match(client, /searchResults\.pages\.map/);
  assert.match(styles, /\.mobile-search-backdrop \{ position: fixed; z-index: 260; inset: 0;/);
  assert.match(styles, /@media \(max-width: 480px\) \{[\s\S]*?\.mobile-search-button \{ display: flex;/);
});

test("stale deployments recover, times stay 12-hour, and named controls keep their isolated sizing", async () => {
  const [client, layout, styles, mobileStyles] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/mobile.css", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /plant-journal-asset-recovery/);
  assert.match(layout, /\/_next\/static\//);
  assert.match(layout, /unhandledrejection/);
  assert.match(layout, /location\.replace/);
  assert.match(client, /function AppTimeControl/);
  assert.match(client, /hour12: true/);
  assert.match(client, /formatAppTime\(item\.plannedTime\)/);
  assert.doesNotMatch(client, /type="time"|type="datetime-local"/);
  assert.match(styles, /\.mobile-search-panel \{[^}]*width: min\(100%, 560px\);[^}]*background: #f5f7f8;/);
  assert.match(styles, /\.mobile-search-field \{[^}]*min-height: 56px;[^}]*background: #eef2f4;/);
  assert.match(client, /className="mobile-search-button"[\s\S]{0,300}<Icon name="search" \/><b>Search<\/b>/);
  assert.match(mobileStyles, /\.mobile-search-button \{ flex: 0 0 96px; width: 96px; height: 33px;[^}]*background: #f3f5f6; color: #353b40;/);
  assert.match(styles, /\.save-state > span::before \{/);
  assert.doesNotMatch(styles, /\.save-state span::before \{/);
  assert.match(styles, /\.page-reminder-button \{[^}]*width: max-content;[^}]*max-width: none;/);
  assert.match(mobileStyles, /\.page-reminder-button \{ grid-column: 2; width: max-content; max-width: none; \}/);
});

test("the twelve focused fixes stay isolated across reminders, pages, menus, dates, attachments, and resilience", async () => {
  const [client, styles, desktopStyles, mobileStyles, pushRoute, pushLibrary, serviceWorker] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/desktop.css", import.meta.url), "utf8"),
    readFile(new URL("../app/mobile.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/push/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/push.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  ]);
  assert.match(client, /<Icon name="search" \/><b>Search<\/b>/);
  assert.match(client, /function pageHierarchyNames/);
  assert.match(client, /if \(section\.name\) sectionNames\.unshift\(section\.name\)/);
  assert.match(client, /parentPageNames\.unshift\(current\.title\)/);
  assert.match(client, /hierarchy=\{globalJournalView \? pageHierarchyNames\(data, page\) : undefined\}/);
  assert.doesNotMatch(client, /sectionName=\{globalJournalView/);
  assert.match(styles, /\.page-card-hierarchy \{/);
  assert.match(desktopStyles, /\.title-field-wrap \{ display: flex; align-items: flex-end; min-height: 46px; \}/);
  assert.match(mobileStyles, /\.title-field-wrap \{ display: flex; align-items: flex-end; min-height: 42px; \}/);
  assert.match(styles, /\.outline-row \[contenteditable\]\.completed-text \{ color: #706b74; text-decoration: none; \}/);
  assert.match(styles, /\.outline-row > \.inline-attachment-list\.compact \{ grid-row: 2; \}/);
  assert.match(client, /document\.execCommand\("insertText", false, "\\t"\)/);
  assert.doesNotMatch(client, /journalTabReferenceSize|normalizeLegacyJournalTabs|--journal-tab-size/);
  assert.match(desktopStyles, /\.outline-row \[contenteditable\] \{ tab-size: 4; \}/);
  assert.match(client, /className="app-date-mobile-backdrop"/);
  assert.match(client, /readOnly[\s\S]{0,180}onPointerDown=\{openDatePicker\}/);
  assert.doesNotMatch(client, /value=\{value \?\? localDate\(\)\}/);
  assert.match(client, /document\.addEventListener\("pointerdown", closeAttachmentMenuOutside, true\)/);
  assert.match(client, /const attempts = background \? 2 : 3/);
  assert.match(client, /pushSubscriptionUsesKey/);
  assert.match(client, /action: sendTest \? "test" : "subscribe"/);
  assert.match(pushRoute, /action === "test"/);
  assert.match(pushLibrary, /sendTestPush|dispatchDuePushNotifications/);
  assert.match(pushLibrary, /pushPayload\(\s*"Reminder",\s*""/);
  assert.match(pushLibrary, /function pageReminderContent/);
  assert.match(pushLibrary, /const hierarchy = \[\.\.\.sectionNames, \.\.\.parentPageNames\][\s\S]*?\.join\(" › "\)/);
  assert.match(pushLibrary, /const pageLabel = `\$\{page\.serial\} · \$\{page\.title\}`;/);
  assert.match(pushLibrary, /\? \{ title: hierarchy, body: pageLabel \}/);
  assert.match(pushLibrary, /const content = pageReminderContent\(row, pageById, sectionById\)/);
  assert.match(pushLibrary, /const linkedPage = row\.linked_page_id \? pageById\.get\(row\.linked_page_id\) : undefined;[\s\S]*?pageReminderContent\(linkedPage, pageById, sectionById\)/);
  assert.doesNotMatch(pushLibrary, /Journal page reminder · Daily until closed|My Day · \$\{row\.category\}/);
  assert.match(serviceWorker, /\.\.\.\(body \? \{ body \} : \{\}\)/);
  assert.match(mobileStyles, /\.ios-reminder-date-control \{ height: 44px; padding: 0 13px;/);
  assert.match(styles, /\.planner-time-field \{ position: static; display: grid; gap: 4px; min-width: 0; height: auto; padding-top: 0; \}/);
  assert.match(styles, /\.planner-time-field > span \{ position: static; top: auto; left: auto;/);
});

test("the external reminder clock is isolated and requires both private credentials", async () => {
  const [schedulerRoute, workerConfig, workerTypes] = await Promise.all([
    readFile(new URL("../app/api/reminder-scheduler/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../cloudflare-env.d.ts", import.meta.url), "utf8"),
  ]);
  assert.match(schedulerRoute, /export async function POST/);
  assert.match(schedulerRoute, /x-reminder-scheduler-key/);
  assert.match(schedulerRoute, /REMINDER_SCHEDULER_SECRET/);
  assert.match(schedulerRoute, /dispatchDuePushNotifications/);
  assert.doesNotMatch(schedulerRoute, /export async function GET/);
  assert.match(workerConfig, /triggers: \{ crons: \["\* \* \* \* \*"\] \}/);
  assert.match(workerTypes, /REMINDER_SCHEDULER_SECRET\?: string/);
});

test("startup and page opening load only the data needed for the visible screen", async () => {
  const [client, route] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /url\.searchParams\.get\("scope"\) === "secondary"/);
  assert.match(route, /async function readSecondaryState\(\)/);
  assert.match(client, /requestWithTimeout\("\/api\/state\?scope=secondary"/);
  assert.match(client, /secondaryStateLoaded/);
  assert.match(client, /pendingPageWriteCounts\.current\.get\(pageId\)/);
  assert.match(client, /void loadPageContent\(page\.id\)/);
  assert.match(client, /const pageById = useMemo/);
  assert.match(client, /const pageDepthById = useMemo/);
});

test("dashboard follows the My Day visual system and every summary opens its source section", async () => {
  const [client, styles] = await Promise.all([
    readFile(new URL("../app/JournalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(client, /function LiveClock/);
  assert.doesNotMatch(client, /<LiveClock className="my-day-live-clock" \/>/);
  assert.doesNotMatch(client, /className="dashboard-live-clock"/);
  assert.match(client, /className="dashboard-overview-grid"/);
  assert.match(client, /className="dashboard-module my-day-module"/);
  assert.match(client, /className="dashboard-module journal-module"/);
  assert.match(client, /className="dashboard-module meetings-module"/);
  assert.match(client, /className="dashboard-module people-module"/);
  assert.match(client, /onClick=\{onOpenMeetings\}/);
  assert.match(client, /onClick=\{onOpenPeople\}>Open People/);
  assert.match(client, /onClick=\{\(\) => onOpenMeeting\(meeting\.id\)\}/);
  assert.match(styles, /\.dashboard-hero \{[\s\S]*?background: var\(--theme-header\);/);
  assert.match(styles, /\.dashboard-hero \{[^}]*width: calc\(100% \+ \(var\(--dashboard-gutter\) \* 2\)\);/);
  assert.match(styles, /\.dashboard-overview-grid \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(styles, /@media \(max-width: 480px\) \{[\s\S]*?\.dashboard-overview-grid \{ grid-template-columns: 1fr;/);
  assert.match(styles, /@media \(max-width: 480px\) \{[\s\S]*?\.my-day-header > div:first-child > small \{ display: none; \}/);
});
