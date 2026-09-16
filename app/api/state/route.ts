import { getD1, getFiles, initializeDatabase } from "@/db/runtime";
import { formatAppDate } from "@/lib/date-format";

type JsonRecord = Record<string, unknown>;
type SectionKind = "department" | "subsection";

const defaultFocusOrder = ["all", "today", "reminders", "attention", "in-progress", "not-started", "completed"] as const;
const finalDayPlanStatuses = new Set(["Completed", "Abandoned", "Cancelled"]);
const dayPlanCategories = new Set(["Task", "Call", "Email"]);
const reminderRepeats = new Set(["none", "daily-until-closed", "daily", "weekdays", "weekly", "monthly"]);

function validReminderRepeat(value: unknown) {
  const repeat = String(value ?? "none");
  return reminderRepeats.has(repeat) ? repeat : "none";
}

function validReminderEndDate(value: unknown) {
  const date = String(value ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function validReminderDateTime(value: unknown) {
  const dateTime = String(value ?? "");
  return /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?$/.test(dateTime) ? dateTime : null;
}

function plantDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function validPlanDate(value: unknown) {
  const date = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Choose a valid planning date.");
  return date;
}

function calendarDayDistance(from: string, to: string) {
  return Math.max(1, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000));
}

function normalizeFocusOrder(value: unknown) {
  const requested = Array.isArray(value) ? value.map(String) : [];
  const known = new Set<string>(defaultFocusOrder);
  return [...requested.filter((item, index) => known.has(item) && requested.indexOf(item) === index), ...defaultFocusOrder.filter((item) => !requested.includes(item))];
}

function normalizeHierarchyState(value: unknown) {
  const record = value && typeof value === "object" ? value as JsonRecord : {};
  const collapsedSections = Array.isArray(record.collapsedSections)
    ? [...new Set(record.collapsedSections.map(String).filter(Boolean))].slice(0, 500)
    : [];
  return { collapsedSections, focusCollapsed: record.focusCollapsed === true };
}

function normalizeEditorDictionary(value: unknown) {
  const words = Array.isArray(value) ? value.map((word) => String(word).trim()).filter(Boolean) : [];
  const unique = new Map<string, string>();
  for (const word of words) {
    if (/^[\p{L}\p{N}][\p{L}\p{N}'’.-]{0,63}$/u.test(word)) unique.set(word.toLocaleLowerCase("en-GB"), word);
  }
  return [...unique.values()].sort((left, right) => left.localeCompare(right, "en-GB", { sensitivity: "base" })).slice(0, 2_000);
}

function safeJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function slots(values: unknown[]) {
  return values.map(() => "?").join(",");
}

function formatEmbeddedAppDates(value: unknown) {
  return String(value ?? "").replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_match, year, month, day) => `${day}/${month}/${year}`);
}

function replacePrefix(value: string, oldPrefix: string, newPrefix: string) {
  return value === oldPrefix ? newPrefix : `${newPrefix}${value.slice(oldPrefix.length)}`;
}

function compareSerials(a: string, b: string) {
  const left = (a.match(/\d+/g) ?? []).map(Number);
  const right = (b.match(/\d+/g) ?? []).map(Number);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? -1) - (right[index] ?? -1);
    if (difference) return difference;
  }
  return a.localeCompare(b);
}

async function normalizeSerialNumbers() {
  const db = getD1();
  const [departmentRows, subsectionRows, pageRows] = await Promise.all([
    db.prepare("SELECT id, notebook_id, parent_id, serial_prefix, position, rowid AS row_order FROM departments").all<{ id: string; notebook_id: string; parent_id: string | null; serial_prefix: string; position: number; row_order: number }>(),
    db.prepare("SELECT id, notebook_id, department_id, parent_id, serial_prefix, position, rowid AS row_order FROM subsections").all<{ id: string; notebook_id: string; department_id: string; parent_id: string | null; serial_prefix: string; position: number; row_order: number }>(),
    db.prepare("SELECT id, parent_id, subsection_id, serial, position, created_at FROM pages").all<{ id: string; parent_id: string | null; subsection_id: string; serial: string; position: number; created_at: string }>(),
  ]);

  type NumberingSection = {
    id: string;
    kind: SectionKind;
    parentId: string | null;
    departmentId: string;
    notebookId: string;
    serialPrefix: string;
    position: number;
    rowOrder: number;
  };

  const allSectionIds = new Set([
    ...departmentRows.results.map((row) => row.id),
    ...subsectionRows.results.map((row) => row.id),
  ]);
  const validParentId = (parentId: string | null, fallbackId: string | null, sectionId: string) => {
    if (parentId && parentId !== sectionId && allSectionIds.has(parentId)) return parentId;
    if (fallbackId && fallbackId !== sectionId && allSectionIds.has(fallbackId)) return fallbackId;
    return null;
  };
  const sections: NumberingSection[] = [
    ...departmentRows.results.map((row) => ({
      id: row.id,
      kind: "department" as const,
      parentId: validParentId(row.parent_id, null, row.id),
      departmentId: row.id,
      notebookId: row.notebook_id,
      serialPrefix: row.serial_prefix,
      position: row.position,
      rowOrder: row.row_order,
    })),
    ...subsectionRows.results.map((row) => ({
      id: row.id,
      kind: "subsection" as const,
      parentId: validParentId(row.parent_id, row.department_id, row.id),
      departmentId: row.department_id,
      notebookId: row.notebook_id,
      serialPrefix: row.serial_prefix,
      position: row.position,
      rowOrder: row.row_order,
    })),
  ];
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const sectionChildren = new Map<string, NumberingSection[]>();
  const rootKey = (notebookId: string) => `__root__:${notebookId}`;
  for (const section of sections) {
    const parentKey = section.parentId && sectionById.has(section.parentId) ? section.parentId : rootKey(section.notebookId);
    const siblings = sectionChildren.get(parentKey) ?? [];
    siblings.push(section);
    sectionChildren.set(parentKey, siblings);
  }
  for (const siblings of sectionChildren.values()) {
    siblings.sort((a, b) => a.position - b.position || compareSerials(a.serialPrefix, b.serialPrefix) || a.rowOrder - b.rowOrder || a.id.localeCompare(b.id));
  }

  const sectionPrefixes = new Map<string, string>();
  const sectionPositions = new Map<string, number>();
  const sectionDepartments = new Map<string, string>();
  const sectionNotebooks = new Map<string, string>();
  const visitedSections = new Set<string>();
  function numberSections(parentId: string, base: string, inheritedDepartmentId = "", inheritedNotebookId = "") {
    const siblings = sectionChildren.get(parentId) ?? [];
    siblings.forEach((section, index) => {
      if (visitedSections.has(section.id)) return;
      visitedSections.add(section.id);
      const prefix = base ? `${base}.${index + 1}` : String(index + 1);
      const departmentId = section.kind === "department"
        ? section.id
        : inheritedDepartmentId || (section.parentId ? section.departmentId : section.id);
      const notebookId = inheritedNotebookId || section.notebookId;
      sectionPrefixes.set(section.id, prefix);
      sectionPositions.set(section.id, index + 1);
      sectionDepartments.set(section.id, departmentId);
      sectionNotebooks.set(section.id, notebookId);
      numberSections(section.id, prefix, departmentId, notebookId);
    });
  }
  for (const key of sectionChildren.keys()) {
    if (key.startsWith("__root__:")) numberSections(key, "", "", key.slice("__root__:".length));
  }

  const pageById = new Map(pageRows.results.map((page) => [page.id, page]));
  const pageChildren = new Map<string, typeof pageRows.results>();
  for (const page of pageRows.results) {
    const hasValidParent = Boolean(page.parent_id && pageById.get(page.parent_id)?.subsection_id === page.subsection_id);
    const parentKey = hasValidParent ? String(page.parent_id) : `section:${page.subsection_id}`;
    const siblings = pageChildren.get(parentKey) ?? [];
    siblings.push(page);
    pageChildren.set(parentKey, siblings);
  }
  for (const siblings of pageChildren.values()) {
    siblings.sort((a, b) => {
      const aTemporary = a.serial.startsWith("__renumber__");
      const bTemporary = b.serial.startsWith("__renumber__");
      if (aTemporary || bTemporary) {
        return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
      }
      // Position zero is valid on pages created before explicit page ordering was added.
      // Keeping it in the normal sort puts those existing pages before the next appended page.
      const positionDifference = a.position - b.position;
      return positionDifference || compareSerials(a.serial, b.serial) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
    });
  }

  const pageSerials = new Map<string, string>();
  const pagePositions = new Map<string, number>();
  const visitedPages = new Set<string>();
  function numberPages(parentKey: string, base: string, isSectionRoot = false) {
    const siblings = pageChildren.get(parentKey) ?? [];
    siblings.forEach((page, index) => {
      if (visitedPages.has(page.id)) return;
      visitedPages.add(page.id);
      const serial = isSectionRoot ? `${base}-P${index + 1}` : `${base}.${index + 1}`;
      pageSerials.set(page.id, serial);
      pagePositions.set(page.id, index + 1);
      numberPages(page.id, serial);
    });
  }
  for (const section of sections) {
    const base = sectionPrefixes.get(section.id);
    if (base) numberPages(`section:${section.id}`, base, true);
  }

  const sectionStatements: D1PreparedStatement[] = [];
  for (const department of departmentRows.results) {
    const parentId = sectionById.get(department.id)?.parentId ?? null;
    const serialPrefix = sectionPrefixes.get(department.id);
    const position = sectionPositions.get(department.id);
    if (serialPrefix && position && (parentId !== department.parent_id || serialPrefix !== department.serial_prefix || position !== department.position)) {
      sectionStatements.push(db.prepare("UPDATE departments SET parent_id = ?, serial_prefix = ?, position = ? WHERE id = ?").bind(parentId, serialPrefix, position, department.id));
    }
  }
  for (const subsection of subsectionRows.results) {
    const parentId = sectionById.get(subsection.id)?.parentId ?? null;
    const serialPrefix = sectionPrefixes.get(subsection.id);
    const departmentId = sectionDepartments.get(subsection.id);
    const notebookId = sectionNotebooks.get(subsection.id);
    const position = sectionPositions.get(subsection.id);
    if (serialPrefix && departmentId && notebookId && position && (parentId !== subsection.parent_id || serialPrefix !== subsection.serial_prefix || departmentId !== subsection.department_id || notebookId !== subsection.notebook_id || position !== subsection.position)) {
      sectionStatements.push(db.prepare("UPDATE subsections SET parent_id = ?, serial_prefix = ?, department_id = ?, notebook_id = ?, position = ? WHERE id = ?").bind(parentId, serialPrefix, departmentId, notebookId, position, subsection.id));
    }
  }
  const changedPages = pageRows.results.filter((page) => {
    const serial = pageSerials.get(page.id);
    const position = pagePositions.get(page.id);
    return serial && position && (serial !== page.serial || position !== page.position);
  });
  const serialChangedPages = changedPages.filter((page) => pageSerials.get(page.id) !== page.serial);
  if (sectionStatements.length || changedPages.length) {
    const renumberToken = crypto.randomUUID();
    await db.batch([
      ...sectionStatements,
      ...serialChangedPages.map((page) => db.prepare("UPDATE pages SET serial = ? WHERE id = ?").bind(`__renumber__${renumberToken}__${page.id}`, page.id)),
      ...changedPages.map((page) => db.prepare("UPDATE pages SET serial = ?, position = ? WHERE id = ?").bind(pageSerials.get(page.id), pagePositions.get(page.id), page.id)),
    ]);
  }
}

function escapeHtml(value: unknown) {
  const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
  return String(value ?? "").replace(/[&<>"']/g, (character) => entities[character] ?? character);
}

function dayPlanRecord(row: JsonRecord) {
  return {
    id: row.id,
    chainId: row.chain_id,
    planDate: row.plan_date,
    category: row.category,
    title: row.title,
    notes: row.notes,
    plannedTime: row.planned_time,
    assigneeId: row.assignee_id,
    reminderRepeat: validReminderRepeat(row.reminder_repeat),
    reminderEndDate: row.reminder_end_date,
    reminderClosedAt: row.reminder_closed_at,
    status: row.status,
    carriedFromId: row.carried_from_id,
    carryCount: row.carry_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
    linkedPageId: row.linked_page_id,
  };
}

async function syncDayPlanJournal(chainId: string) {
  const db = getD1();
  const item = await db.prepare(`SELECT * FROM day_plan_items WHERE chain_id = ? AND linked_page_id IS NOT NULL
    ORDER BY CASE WHEN status = 'Active' THEN 0 ELSE 1 END, plan_date DESC, created_at DESC LIMIT 1`).bind(chainId).first<JsonRecord>();
  if (!item?.linked_page_id) return null;
  const pageId = String(item.linked_page_id);
  const page = await db.prepare("SELECT id FROM pages WHERE id = ?").bind(pageId).first<{ id: string }>();
  if (!page) return null;
  const details = (await db.prepare("SELECT * FROM day_plan_details WHERE chain_id = ? ORDER BY position").bind(chainId).all<JsonRecord>()).results;
  const detailText = details.filter((detail) => String(detail.text ?? "").trim()).map((detail) => `${escapeHtml(formatAppDate(String(detail.entry_date || plantDate())))} · ${escapeHtml(detail.text)}`).join("<br>");
  const text = `<strong>${escapeHtml(item.title)}</strong><br><small>My Day · ${escapeHtml(item.category)} · ${escapeHtml(formatAppDate(String(item.plan_date)))}</small>${detailText ? `<br>${detailText}` : ""}`;
  const outlineId = `my-day-link-${chainId}`;
  const existing = await db.prepare("SELECT page_id, position FROM outline_items WHERE id = ?").bind(outlineId).first<{ page_id: string; position: number }>();
  const position = existing?.page_id === pageId
    ? Number(existing.position)
    : Number((await db.prepare("SELECT MAX(position) AS value FROM outline_items WHERE page_id = ?").bind(pageId).first<{ value: number }>())?.value ?? -1) + 1;
  const completed = String(item.status) === "Completed" ? 1 : 0;
  if (existing) {
    await db.batch([
      db.prepare("UPDATE outline_items SET page_id = ?, level = 0, position = ?, text = ?, is_task = 1, completed = ?, entry_date = ? WHERE id = ?").bind(pageId, position, text, completed, plantDate(), outlineId),
      db.prepare("UPDATE pages SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(pageId),
    ]);
  } else {
    await db.batch([
      db.prepare("INSERT INTO outline_items (id, page_id, level, position, text, is_task, completed, entry_date) VALUES (?, ?, 0, ?, ?, 1, ?, ?)").bind(outlineId, pageId, position, text, completed, plantDate()),
      db.prepare("UPDATE pages SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(pageId),
    ]);
  }
  return { outlineId, pageId, text, entryDate: plantDate(), position };
}

let lastCarryForwardDate = "";
let carryForwardPromise: Promise<void> | null = null;

async function carryForwardDayPlans() {
  const db = getD1();
  const today = plantDate();
  if (lastCarryForwardDate === today) return;
  if (carryForwardPromise) return carryForwardPromise;
  carryForwardPromise = (async () => {
  const staleRows = await db.prepare(`SELECT * FROM day_plan_items
    WHERE status = 'Active' AND plan_date < ? ORDER BY plan_date, created_at`).bind(today).all<JsonRecord>();
  if (!staleRows.results.length) return;
  const latestByChain = new Map<string, JsonRecord>();
  for (const row of staleRows.results) latestByChain.set(String(row.chain_id), row);
  const statements: D1PreparedStatement[] = [];
  for (const [chainId, row] of latestByChain) {
    const existing = await db.prepare("SELECT id FROM day_plan_items WHERE chain_id = ? AND status = 'Active' AND plan_date >= ? LIMIT 1")
      .bind(chainId, today).first<{ id: string }>();
    statements.push(db.prepare(`UPDATE day_plan_items SET status = 'Carried Forward', reminder_closed_at = COALESCE(reminder_closed_at, CURRENT_TIMESTAMP), resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE chain_id = ? AND status = 'Active' AND plan_date < ?`).bind(chainId, today));
    if (!existing) {
      statements.push(db.prepare(`INSERT INTO day_plan_items
        (id, chain_id, plan_date, category, title, notes, planned_time, assignee_id, reminder_repeat, reminder_end_date, reminder_closed_at, status, carried_from_id, carry_count, linked_page_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'Active', ?, ?, ?)`).bind(
          id("day-plan"), chainId, today, row.category || "Task", row.title, row.notes, row.planned_time || null,
          row.assignee_id || null, validReminderRepeat(row.reminder_repeat), row.reminder_end_date || null,
          row.id, Number(row.carry_count ?? 0) + calendarDayDistance(String(row.plan_date), today), row.linked_page_id || null,
        ));
    }
  }
  await db.batch(statements);
  })();
  try {
    await carryForwardPromise;
    lastCarryForwardDate = today;
  } finally {
    carryForwardPromise = null;
  }
}

function outlineRecord(row: JsonRecord) {
  return {
    id: row.id,
    pageId: row.page_id,
    level: row.level,
    position: row.position,
    text: String(row.id).startsWith("my-day-link-") ? formatEmbeddedAppDates(row.text) : row.text,
    isTask: Boolean(row.is_task),
    completed: Boolean(row.completed),
    entryDate: row.entry_date,
    reminderDate: row.reminder_date,
    reminderRepeat: validReminderRepeat(row.reminder_repeat),
    reminderEndDate: row.reminder_end_date,
    reminderClosedAt: row.reminder_closed_at,
  };
}

function attachmentRecord(row: JsonRecord) {
  return {
    id: row.id,
    pageId: row.page_id,
    outlineId: row.outline_id,
    kind: row.kind,
    title: row.title,
    externalUrl: row.external_url,
    repository: row.repository,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  };
}

function meetingRecord(row: JsonRecord) {
  return {
    id: row.id,
    number: row.number,
    purpose: row.purpose,
    date: row.date,
    venue: row.venue,
    convener: row.convener,
    calledBy: row.called_by,
    participants: safeJson<string[]>(row.participants_json, []),
    discussion: row.discussion,
    updateText: row.update_text,
    updatedAt: row.updated_at,
  };
}

function agendaRecord(row: JsonRecord) {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    position: row.position,
    title: row.title,
    discussion: row.discussion,
    actionText: row.action_text,
    linkedPageId: row.linked_page_id,
  };
}

function dayPlanDetailRecord(row: JsonRecord) {
  return {
    id: row.id,
    chainId: row.chain_id,
    level: row.level,
    position: row.position,
    text: row.text,
    isTask: Boolean(row.is_task),
    completed: Boolean(row.completed),
    entryDate: row.entry_date,
  };
}

function dayPlanAttachmentRecord(row: JsonRecord) {
  return {
    id: row.id,
    chainId: row.chain_id,
    detailId: row.detail_id,
    kind: row.kind,
    title: row.title,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  };
}

async function readSecondaryState() {
  const db = getD1();
  await carryForwardDayPlans();
  const [meetingRows, agendaRows, dayPlanRows, dayPlanDetailRows, dayPlanAttachmentRows] = await Promise.all([
    db.prepare("SELECT * FROM meetings ORDER BY date DESC, number DESC").all<JsonRecord>(),
    db.prepare("SELECT * FROM agenda_items ORDER BY meeting_id, position").all<JsonRecord>(),
    db.prepare("SELECT * FROM day_plan_items ORDER BY plan_date, planned_time, created_at").all<JsonRecord>(),
    db.prepare("SELECT * FROM day_plan_details ORDER BY chain_id, position").all<JsonRecord>(),
    db.prepare("SELECT * FROM day_plan_attachments ORDER BY chain_id, detail_id, created_at").all<JsonRecord>(),
  ]);
  return {
    meetings: meetingRows.results.map(meetingRecord),
    agendaItems: agendaRows.results.map(agendaRecord),
    dayPlanItems: dayPlanRows.results.map(dayPlanRecord),
    dayPlanDetails: dayPlanDetailRows.results.map(dayPlanDetailRecord),
    dayPlanAttachments: dayPlanAttachmentRows.results.map(dayPlanAttachmentRecord),
  };
}

async function readPageContent(pageId: string) {
  const db = getD1();
  const page = await db.prepare("SELECT id FROM pages WHERE id = ?").bind(pageId).first<{ id: string }>();
  if (!page) throw new Error("Page not found.");
  const [outlineRows, attachmentRows] = await Promise.all([
    db.prepare("SELECT * FROM outline_items WHERE page_id = ? ORDER BY position").bind(pageId).all<JsonRecord>(),
    db.prepare("SELECT * FROM page_attachments WHERE page_id = ? ORDER BY created_at").bind(pageId).all<JsonRecord>(),
  ]);
  return {
    pageId,
    outlineItems: outlineRows.results.map(outlineRecord),
    attachments: attachmentRows.results.map(attachmentRecord),
  };
}

async function readState(pageId?: string | null) {
  const db = getD1();
  const [notebookRows, departmentRows, subsectionRows, peopleRows, pageRows, outlineRows, attachmentRows, focusRow, hierarchyRows, editorDictionaryRow] = await Promise.all([
    db.prepare("SELECT * FROM notebooks ORDER BY position, name").all(),
    db.prepare("SELECT * FROM departments ORDER BY position, name").all(),
    db.prepare("SELECT * FROM subsections ORDER BY department_id, position, name").all(),
    db.prepare("SELECT * FROM people ORDER BY name").all(),
    db.prepare("SELECT * FROM pages ORDER BY serial").all(),
    pageId
      ? db.prepare("SELECT * FROM outline_items WHERE page_id = ? ORDER BY position").bind(pageId).all()
      : Promise.resolve({ results: [] }),
    pageId
      ? db.prepare("SELECT * FROM page_attachments WHERE page_id = ? ORDER BY created_at").bind(pageId).all()
      : Promise.resolve({ results: [] }),
    db.prepare("SELECT value_json FROM journal_settings WHERE key = 'focus_order'").first<{ value_json: string }>(),
    db.prepare("SELECT key, value_json FROM journal_settings WHERE key LIKE 'hierarchy_state:%'").all<{ key: string; value_json: string }>(),
    db.prepare("SELECT value_json FROM journal_settings WHERE key = 'editor_dictionary'").first<{ value_json: string }>(),
  ]);

  return {
    notebooks: notebookRows.results.map((row: JsonRecord) => ({
      id: row.id,
      name: row.name,
      color: row.color,
      position: row.position,
    })),
    departments: departmentRows.results.map((row: JsonRecord) => ({
      id: row.id,
      notebookId: row.notebook_id,
      name: row.name,
      color: row.color,
      parentId: row.parent_id,
      serialPrefix: row.serial_prefix,
      position: row.position,
    })),
    subsections: subsectionRows.results.map((row: JsonRecord) => ({
      id: row.id,
      notebookId: row.notebook_id,
      departmentId: row.department_id,
      parentId: row.parent_id,
      name: row.name,
      serialPrefix: row.serial_prefix,
      position: row.position,
    })),
    people: peopleRows.results.map((row: JsonRecord) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      departmentId: row.department_id,
    })),
    pages: pageRows.results.map((row: JsonRecord) => ({
      id: row.id,
      serial: row.serial,
      parentId: row.parent_id,
      subsectionId: row.subsection_id,
      title: row.title,
      notes: row.notes,
      status: row.status,
      priority: row.priority,
      startDate: row.start_date,
      dueDate: row.due_date,
      completedDate: row.completed_date,
      position: row.position,
      ownerId: row.owner_id,
      supportingIds: safeJson<string[]>(row.supporting_json, []),
      sourceType: row.source_type,
      sourceId: row.source_id,
      sourceLabel: row.source_label,
      sourceAgenda: row.source_agenda,
      reminderDate: row.reminder_date,
      reminderRepeat: validReminderRepeat(row.reminder_repeat),
      reminderEndDate: row.reminder_end_date,
      reminderClosedAt: row.reminder_closed_at,
      updatedAt: row.updated_at,
    })).sort((a, b) => compareSerials(String(a.serial), String(b.serial))),
    outlineItems: outlineRows.results.map((row: JsonRecord) => outlineRecord(row)),
    attachments: attachmentRows.results.map((row: JsonRecord) => attachmentRecord(row)),
    focusOrder: normalizeFocusOrder(safeJson<unknown>(focusRow?.value_json, defaultFocusOrder)),
    editorDictionary: normalizeEditorDictionary(safeJson<unknown>(editorDictionaryRow?.value_json, [])),
    hierarchyStates: Object.fromEntries(hierarchyRows.results.map((row) => [
      row.key.slice("hierarchy_state:".length),
      normalizeHierarchyState(safeJson<unknown>(row.value_json, {})),
    ])),
  };
}

async function nextPageSerial(subsectionId: string, parentPageId?: string | null) {
  const db = getD1();
  let base = "";
  let rootPage = false;
  let rows: { serial: string }[] = [];

  if (parentPageId) {
    const parent = await db.prepare("SELECT serial, subsection_id FROM pages WHERE id = ?").bind(parentPageId).first<{ serial: string; subsection_id: string }>();
    if (!parent) throw new Error("Parent page not found");
    if (parent.subsection_id !== subsectionId) throw new Error("A subpage must stay in its parent page section");
    base = parent.serial;
    rows = (await db.prepare("SELECT serial FROM pages WHERE parent_id = ?").bind(parentPageId).all<{ serial: string }>()).results;
  } else {
    const section = await findSection(subsectionId);
    if (!section) throw new Error("Section not found");
    base = String(section.row.serial_prefix);
    rootPage = true;
    rows = (await db.prepare("SELECT serial FROM pages WHERE subsection_id = ? AND parent_id IS NULL").bind(subsectionId).all<{ serial: string }>()).results;
  }

  let largest = 0;
  const serialBase = rootPage ? `${base}-P` : `${base}.`;
  for (const row of rows) {
    const tail = row.serial.startsWith(serialBase) ? row.serial.slice(serialBase.length) : "";
    if (/^\d+$/.test(tail)) largest = Math.max(largest, Number(tail));
  }
  return rootPage ? `${base}-P${largest + 1}` : `${base}.${largest + 1}`;
}

async function findSection(sectionId: string) {
  const db = getD1();
  const department = await db.prepare("SELECT id, notebook_id, name, parent_id, serial_prefix FROM departments WHERE id = ?").bind(sectionId).first<JsonRecord>();
  if (department) return { kind: "department" as const, row: department };
  const subsection = await db.prepare("SELECT id, notebook_id, name, department_id, parent_id, serial_prefix FROM subsections WHERE id = ?").bind(sectionId).first<JsonRecord>();
  if (subsection) return { kind: "subsection" as const, row: subsection };
  return null;
}

async function nextSectionPrefix(parentId?: string | null, notebookId = "plant-operations") {
  const db = getD1();
  if (!parentId) {
    const [departments, promotedSubsections] = await Promise.all([
      db.prepare("SELECT serial_prefix FROM departments WHERE parent_id IS NULL AND notebook_id = ?").bind(notebookId).all<{ serial_prefix: string }>(),
      db.prepare("SELECT serial_prefix FROM subsections WHERE parent_id IS NULL AND department_id = id AND notebook_id = ?").bind(notebookId).all<{ serial_prefix: string }>(),
    ]);
    const largest = [...departments.results, ...promotedSubsections.results].reduce((max, row) => Math.max(max, Number(row.serial_prefix.split(".")[0]) || 0), 0);
    return { prefix: String(largest + 1), departmentId: "" };
  }

  const parent = await findSection(parentId);
  if (!parent) throw new Error("Parent section not found");
  const base = String(parent.row.serial_prefix);
  const [departments, subsections] = await Promise.all([
    db.prepare("SELECT serial_prefix FROM departments WHERE parent_id = ?").bind(parentId).all<{ serial_prefix: string }>(),
    db.prepare("SELECT serial_prefix FROM subsections WHERE parent_id = ?").bind(parentId).all<{ serial_prefix: string }>(),
  ]);
  const largest = [...departments.results, ...subsections.results].reduce((max, row) => {
    const tail = row.serial_prefix.slice(base.length + 1);
    return /^\d+$/.test(tail) ? Math.max(max, Number(tail)) : max;
  }, 0);
  const departmentId = parent.kind === "department" ? String(parent.row.id) : String(parent.row.department_id);
  return { prefix: `${base}.${largest + 1}`, departmentId };
}

async function nextSectionPosition(parentId: string | null, notebookId = "plant-operations") {
  const db = getD1();
  if (!parentId) {
    const row = await db.prepare(`SELECT MAX(position) AS value FROM (
      SELECT position FROM departments WHERE notebook_id = ? AND parent_id IS NULL
      UNION ALL
      SELECT position FROM subsections WHERE notebook_id = ? AND parent_id IS NULL AND department_id = id
    )`).bind(notebookId, notebookId).first<{ value: number }>();
    return Number(row?.value ?? 0) + 1;
  }
  const row = await db.prepare(`SELECT MAX(position) AS value FROM (
    SELECT position FROM departments WHERE parent_id = ?
    UNION ALL
    SELECT position FROM subsections WHERE parent_id = ?
  )`).bind(parentId, parentId).first<{ value: number }>();
  return Number(row?.value ?? 0) + 1;
}

async function rewriteSerialPrefix(oldPrefix: string, newPrefix: string, newDepartmentId?: string) {
  const db = getD1();
  const [departments, subsections, pages] = await Promise.all([
    db.prepare("SELECT id, serial_prefix FROM departments WHERE serial_prefix LIKE ?").bind(`${oldPrefix}.%`).all<{ id: string; serial_prefix: string }>(),
    db.prepare("SELECT id, serial_prefix FROM subsections WHERE serial_prefix LIKE ?").bind(`${oldPrefix}.%`).all<{ id: string; serial_prefix: string }>(),
    db.prepare("SELECT id, serial FROM pages WHERE serial LIKE ? OR serial LIKE ?")
      .bind(`${oldPrefix}.%`, `${oldPrefix}-P%`).all<{ id: string; serial: string }>(),
  ]);
  const statements: D1PreparedStatement[] = [];
  for (const row of departments.results) {
    statements.push(db.prepare("UPDATE departments SET serial_prefix = ? WHERE id = ?").bind(replacePrefix(row.serial_prefix, oldPrefix, newPrefix), row.id));
  }
  for (const row of subsections.results) {
    statements.push(db.prepare("UPDATE subsections SET serial_prefix = ?, department_id = COALESCE(?, department_id) WHERE id = ?")
      .bind(replacePrefix(row.serial_prefix, oldPrefix, newPrefix), newDepartmentId || null, row.id));
  }
  for (const row of pages.results) {
    statements.push(db.prepare("UPDATE pages SET serial = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(replacePrefix(row.serial, oldPrefix, newPrefix), row.id));
  }
  if (statements.length) await db.batch(statements);
}

async function pageTree(pageId: string) {
  const db = getD1();
  const rows = (await db.prepare("SELECT id, parent_id FROM pages").all<{ id: string; parent_id: string | null }>()).results;
  const found = new Set([pageId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (row.parent_id && found.has(row.parent_id) && !found.has(row.id)) {
        found.add(row.id);
        changed = true;
      }
    }
  }
  return [...found];
}

async function deletePages(pageIds: string[]) {
  if (!pageIds.length) return;
  const db = getD1();
  const placeholders = slots(pageIds);
  const attachments = await db.prepare(`SELECT object_key FROM page_attachments WHERE page_id IN (${placeholders}) AND object_key IS NOT NULL`)
    .bind(...pageIds).all<{ object_key: string }>();
  await db.batch([
    db.prepare(`UPDATE agenda_items SET linked_page_id = NULL WHERE linked_page_id IN (${placeholders})`).bind(...pageIds),
    db.prepare(`DELETE FROM outline_items WHERE page_id IN (${placeholders})`).bind(...pageIds),
    db.prepare(`DELETE FROM page_attachments WHERE page_id IN (${placeholders})`).bind(...pageIds),
    db.prepare(`DELETE FROM pages WHERE id IN (${placeholders})`).bind(...pageIds),
  ]);
  if (attachments.results.length) {
    try {
      const files = getFiles();
      await Promise.all(attachments.results.map((attachment) => files.delete(attachment.object_key)));
    } catch {
      // The page deletion remains valid even if an already-orphaned object cannot be removed.
    }
  }
}

export async function GET(request: Request) {
  try {
    await initializeDatabase();
    const url = new URL(request.url);
    const pageId = url.searchParams.get("pageId");
    if (url.searchParams.get("scope") === "page") {
      if (!pageId) throw new Error("Choose a page.");
      return Response.json(await readPageContent(pageId));
    }
    if (url.searchParams.get("scope") === "secondary") {
      return Response.json(await readSecondaryState());
    }
    return Response.json(await readState(pageId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to open the journal";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await initializeDatabase();
    const body = (await request.json()) as JsonRecord;
    const action = String(body.action ?? "");
    const db = getD1();

    if (action === "learnEditorWord" || action === "removeEditorWord") {
      const word = String(body.word ?? "").trim();
      if (!/^[\p{L}\p{N}][\p{L}\p{N}'’.-]{0,63}$/u.test(word)) throw new Error("Learn one word at a time. Letters, numbers, apostrophes, dots and hyphens are supported.");
      const row = await db.prepare("SELECT value_json FROM journal_settings WHERE key = 'editor_dictionary'").first<{ value_json: string }>();
      const current = normalizeEditorDictionary(safeJson<unknown>(row?.value_json, []));
      const key = word.toLocaleLowerCase("en-GB");
      const editorDictionary = action === "learnEditorWord"
        ? normalizeEditorDictionary([...current.filter((entry) => entry.toLocaleLowerCase("en-GB") !== key), word])
        : current.filter((entry) => entry.toLocaleLowerCase("en-GB") !== key);
      await db.prepare(`INSERT INTO journal_settings (key, value_json, updated_at)
        VALUES ('editor_dictionary', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP`)
        .bind(JSON.stringify(editorDictionary)).run();
      return Response.json({ ok: true, editorDictionary });
    }

    if (action === "saveFocusOrder") {
      const focusOrder = normalizeFocusOrder(body.focusOrder);
      await db.prepare(`INSERT INTO journal_settings (key, value_json, updated_at)
        VALUES ('focus_order', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP`)
        .bind(JSON.stringify(focusOrder)).run();
      return Response.json({ ok: true, focusOrder });
    }

    if (action === "saveHierarchyState") {
      const notebookId = String(body.notebookId ?? "");
      const notebook = await db.prepare("SELECT id FROM notebooks WHERE id = ?").bind(notebookId).first<{ id: string }>();
      if (!notebook) throw new Error("Notebook not found.");
      const sectionRows = await db.prepare(`SELECT id FROM departments WHERE notebook_id = ?
        UNION ALL SELECT id FROM subsections WHERE notebook_id = ?`).bind(notebookId, notebookId).all<{ id: string }>();
      const allowedIds = new Set(sectionRows.results.map((row) => row.id));
      const state = normalizeHierarchyState(body);
      state.collapsedSections = state.collapsedSections.filter((sectionId) => allowedIds.has(sectionId));
      const key = `hierarchy_state:${notebookId}`;
      await db.prepare(`INSERT INTO journal_settings (key, value_json, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP`)
        .bind(key, JSON.stringify(state)).run();
      return Response.json({ ok: true, hierarchyState: state });
    }

    if (action === "createNotebook") {
      const name = String(body.name ?? "").trim();
      if (!name) throw new Error("Name the new notebook.");
      const notebookId = id("notebook");
      const sectionId = id("section");
      const subsectionId = id("section");
      const position = Number((await db.prepare("SELECT MAX(position) AS value FROM notebooks").first<{ value: number }>())?.value ?? 0) + 1;
      await db.batch([
        db.prepare("INSERT INTO notebooks (id, name, color, position) VALUES (?, ?, '#6d4cc2', ?)").bind(notebookId, name, position),
        db.prepare("INSERT INTO departments (id, notebook_id, name, color, parent_id, serial_prefix, position) VALUES (?, ?, 'General', '#6d4cc2', NULL, '1', 1)").bind(sectionId, notebookId),
        db.prepare("INSERT INTO subsections (id, notebook_id, department_id, parent_id, name, serial_prefix, position) VALUES (?, ?, ?, ?, 'Notes & Tasks', '1.1', 1)").bind(subsectionId, notebookId, sectionId, sectionId),
      ]);
      return Response.json({ ok: true, notebookId, sectionId, subsectionId });
    }

    if (action === "createPerson") {
      const name = String(body.name ?? "").trim();
      if (!name) throw new Error("Write the team member's name.");
      const personId = id("person");
      await db.prepare("INSERT INTO people (id, name, role, department_id) VALUES (?, ?, ?, NULL)")
        .bind(personId, name, String(body.role ?? "").trim()).run();
      return Response.json({ ok: true, personId });
    }

    if (action === "updatePerson") {
      const personId = String(body.personId ?? "");
      const name = String(body.name ?? "").trim();
      const role = String(body.role ?? "").trim();
      if (!name) throw new Error("Write the team member's name.");
      const person = await db.prepare("SELECT id FROM people WHERE id = ?").bind(personId).first<{ id: string }>();
      if (!person) throw new Error("Team member not found.");
      await db.prepare("UPDATE people SET name = ?, role = ? WHERE id = ?").bind(name, role, personId).run();
      return Response.json({ ok: true });
    }

    if (action === "deletePerson") {
      const personId = String(body.personId ?? "");
      const person = await db.prepare("SELECT name FROM people WHERE id = ?").bind(personId).first<{ name: string }>();
      if (!person) throw new Error("Team member not found.");
      const pages = await db.prepare("SELECT id, supporting_json FROM pages WHERE owner_id = ? OR supporting_json LIKE ?")
        .bind(personId, `%${personId}%`).all<{ id: string; supporting_json: string }>();
      const statements: D1PreparedStatement[] = [
        db.prepare("UPDATE pages SET owner_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE owner_id = ?").bind(personId),
        db.prepare("UPDATE day_plan_items SET assignee_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE assignee_id = ?").bind(personId),
        db.prepare("DELETE FROM people WHERE id = ?").bind(personId),
      ];
      for (const page of pages.results) {
        const supporting = safeJson<string[]>(page.supporting_json, []).filter((value) => value !== personId);
        statements.push(db.prepare("UPDATE pages SET supporting_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(JSON.stringify(supporting), page.id));
      }
      await db.batch(statements);
      return Response.json({ ok: true });
    }

    if (action === "createDayPlan") {
      const title = String(body.title ?? "").trim();
      if (!title) throw new Error("Write the item you want to plan.");
      const planDate = validPlanDate(body.planDate);
      const category = String(body.category ?? "Task");
      if (!dayPlanCategories.has(category)) throw new Error("Choose Tasks, Calls, or Emails.");
      const dayPlanId = id("day-plan");
      const chainId = id("day-chain");
      const firstDetail = String(body.notes ?? "").trim();
      const requestedDetails = Array.isArray(body.details) ? body.details as JsonRecord[] : [];
      const detailRows = (requestedDetails.length ? requestedDetails : [{ text: firstDetail, level: 0, isTask: false, completed: false, entryDate: plantDate() }]).map((detail, position) => {
        const entryDateValue = String(detail.entryDate ?? "");
        return {
          id: id("day-detail"),
          chainId,
          level: Math.max(0, Math.min(3, Number(detail.level ?? 0))),
          position,
          text: String(detail.text ?? ""),
          isTask: detail.isTask === true,
          completed: detail.isTask === true && detail.completed === true,
          entryDate: /^\d{4}-\d{2}-\d{2}$/.test(entryDateValue) ? entryDateValue : plantDate(),
        };
      });
      await db.batch([
        db.prepare(`INSERT INTO day_plan_items
          (id, chain_id, plan_date, category, title, notes, planned_time, assignee_id, status)
          VALUES (?, ?, ?, ?, ?, '', ?, ?, 'Active')`).bind(
            dayPlanId, chainId, planDate, category, title, body.plannedTime || null, body.assigneeId || null,
          ),
        ...detailRows.map((detail) => db.prepare("INSERT INTO day_plan_details (id, chain_id, level, position, text, is_task, completed, entry_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(detail.id, detail.chainId, detail.level, detail.position, detail.text, detail.isTask ? 1 : 0, detail.completed ? 1 : 0, detail.entryDate)),
      ]);
      const created = await db.prepare("SELECT * FROM day_plan_items WHERE id = ?").bind(dayPlanId).first<JsonRecord>();
      return Response.json({ ok: true, dayPlanId, item: created ? dayPlanRecord(created) : null, details: detailRows });
    }

    if (action === "saveDayPlan") {
      const item = body.item as JsonRecord;
      const category = String(item.category ?? "Task");
      if (!dayPlanCategories.has(category)) throw new Error("Choose Tasks, Calls, or Emails.");
      const planDate = validPlanDate(item.planDate);
      await db.prepare(`UPDATE day_plan_items SET plan_date = ?, category = ?, title = ?, planned_time = ?, assignee_id = ?, reminder_repeat = ?, reminder_end_date = ?, reminder_closed_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`).bind(
          planDate, category, String(item.title ?? "").trim() || "Untitled item", item.plannedTime || null,
          item.assigneeId || null, validReminderRepeat(item.reminderRepeat), validReminderEndDate(item.reminderEndDate), item.reminderClosedAt || null, String(item.id ?? ""),
        ).run();
      await syncDayPlanJournal(String(item.chainId ?? ""));
      return Response.json({ ok: true });
    }

    if (action === "saveDayPlanDetails") {
      const chainId = String(body.chainId ?? "");
      const chain = await db.prepare("SELECT id FROM day_plan_items WHERE chain_id = ? LIMIT 1").bind(chainId).first<{ id: string }>();
      if (!chain) throw new Error("Planner item not found.");
      const details = Array.isArray(body.details) ? body.details as JsonRecord[] : [];
      const detailIds = details.map((detail) => String(detail.id ?? "")).filter(Boolean);
      const detachRemoved = detailIds.length
        ? db.prepare(`UPDATE day_plan_attachments SET detail_id = NULL WHERE chain_id = ? AND detail_id IS NOT NULL AND detail_id NOT IN (${slots(detailIds)})`).bind(chainId, ...detailIds)
        : db.prepare("UPDATE day_plan_attachments SET detail_id = NULL WHERE chain_id = ? AND detail_id IS NOT NULL").bind(chainId);
      const statements: D1PreparedStatement[] = [detachRemoved, db.prepare("DELETE FROM day_plan_details WHERE chain_id = ?").bind(chainId)];
      for (const [position, detail] of details.entries()) {
        const entryDateValue = String(detail.entryDate ?? "");
        const entryDate = /^\d{4}-\d{2}-\d{2}$/.test(entryDateValue) ? entryDateValue : plantDate();
        statements.push(db.prepare("INSERT INTO day_plan_details (id, chain_id, level, position, text, is_task, completed, entry_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(
          String(detail.id ?? id("day-detail")), chainId, Math.max(0, Math.min(3, Number(detail.level ?? 0))), position,
          String(detail.text ?? ""), detail.isTask ? 1 : 0, detail.isTask && detail.completed ? 1 : 0, entryDate,
        ));
      }
      await db.batch(statements);
      await syncDayPlanJournal(chainId);
      return Response.json({ ok: true });
    }

    if (action === "resolveDayPlan") {
      const status = String(body.status ?? "");
      if (!finalDayPlanStatuses.has(status)) throw new Error("Unknown My Day result.");
      await db.prepare(`UPDATE day_plan_items SET status = ?, reminder_closed_at = CASE WHEN reminder_repeat = 'daily-until-closed' THEN reminder_closed_at ELSE COALESCE(reminder_closed_at, CURRENT_TIMESTAMP) END, resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'Active'`).bind(status, String(body.dayPlanId ?? "")).run();
      return Response.json({ ok: true });
    }

    if (action === "postponeDayPlan") {
      const dayPlanId = String(body.dayPlanId ?? "");
      const nextDate = validPlanDate(body.nextDate);
      const current = await db.prepare("SELECT * FROM day_plan_items WHERE id = ? AND status = 'Active'").bind(dayPlanId).first<JsonRecord>();
      if (!current) throw new Error("This item is no longer active.");
      if (nextDate <= String(current.plan_date)) throw new Error("Postponement must move the item to a later date.");
      const newId = id("day-plan");
      await db.batch([
        db.prepare("UPDATE day_plan_items SET status = 'Postponed', reminder_closed_at = COALESCE(reminder_closed_at, CURRENT_TIMESTAMP), resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(dayPlanId),
        db.prepare(`INSERT INTO day_plan_items
          (id, chain_id, plan_date, category, title, notes, planned_time, assignee_id, reminder_repeat, reminder_end_date, reminder_closed_at, status, carried_from_id, carry_count, linked_page_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'Active', ?, ?, ?)`).bind(
            newId, current.chain_id, nextDate, current.category || "Task", current.title, current.notes, current.planned_time || null,
            current.assignee_id || null, validReminderRepeat(current.reminder_repeat), current.reminder_end_date || null,
            current.id, Number(current.carry_count ?? 0), current.linked_page_id || null,
          ),
      ]);
      await syncDayPlanJournal(String(current.chain_id));
      const created = await db.prepare("SELECT * FROM day_plan_items WHERE id = ?").bind(newId).first<JsonRecord>();
      return Response.json({ ok: true, dayPlanId: newId, item: created ? dayPlanRecord(created) : null });
    }

    if (action === "linkDayPlanToJournal") {
      const dayPlanId = String(body.dayPlanId ?? "");
      const pageId = String(body.pageId ?? "");
      const item = await db.prepare("SELECT chain_id FROM day_plan_items WHERE id = ?").bind(dayPlanId).first<{ chain_id: string }>();
      const page = await db.prepare("SELECT id FROM pages WHERE id = ?").bind(pageId).first<{ id: string }>();
      if (!item) throw new Error("Planner item not found.");
      if (!page) throw new Error("Choose a valid journal page.");
      await db.prepare("UPDATE day_plan_items SET linked_page_id = ?, updated_at = CURRENT_TIMESTAMP WHERE chain_id = ?").bind(pageId, item.chain_id).run();
      const outline = await syncDayPlanJournal(item.chain_id);
      return Response.json({ ok: true, chainId: item.chain_id, pageId, outline });
    }

    if (action === "savePage") {
      const page = body.page as JsonRecord;
      const status = String(page.status ?? "Not Started");
      const startDateValue = String(page.startDate ?? "");
      const dueDateValue = String(page.dueDate ?? "");
      const completedDateValue = String(page.completedDate ?? "");
      const startDate = /^\d{4}-\d{2}-\d{2}$/.test(startDateValue) ? startDateValue : null;
      const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(dueDateValue) ? dueDateValue : null;
      const completedDate = /^\d{4}-\d{2}-\d{2}$/.test(completedDateValue) ? completedDateValue : null;
      const reminderDate = validReminderDateTime(page.reminderDate);
      const reminderRepeat = validReminderRepeat(page.reminderRepeat);
      const reminderEndDate = validReminderEndDate(page.reminderEndDate);
      const reminderClosedAt = page.reminderClosedAt ? String(page.reminderClosedAt) : null;
      await db.prepare(`UPDATE pages SET
        title = ?, notes = ?, status = ?, priority = ?, start_date = ?, due_date = ?, completed_date = ?, owner_id = ?, supporting_json = ?,
        source_type = ?, source_id = ?, source_label = ?, source_agenda = ?, reminder_date = ?, reminder_repeat = ?, reminder_end_date = ?, reminder_closed_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`).bind(
          String(page.title ?? "Untitled page"),
          String(page.notes ?? ""),
          status,
          String(page.priority ?? "Medium"),
          startDate,
          dueDate,
          completedDate,
          page.ownerId || null,
          JSON.stringify(page.supportingIds ?? []),
          String(page.sourceType ?? "Direct"),
          page.sourceId || null,
          String(page.sourceLabel ?? "Journal entry"),
          page.sourceAgenda || null,
          reminderDate,
          reminderRepeat,
          reminderEndDate,
          reminderClosedAt,
          String(page.id),
        ).run();

      const sourceId = page.sourceId ? String(page.sourceId) : null;
      const sourceAgenda = Number(page.sourceAgenda ?? 0);
      if (String(page.sourceType) === "Meeting" && sourceId && sourceAgenda) {
        await db.prepare("UPDATE agenda_items SET action_text = ? WHERE meeting_id = ? AND position = ?")
          .bind(String(page.title ?? ""), sourceId, sourceAgenda)
          .run();
      }
      return Response.json({ ok: true, updatedAt: new Date().toISOString(), startDate, dueDate, completedDate, reminderDate, reminderRepeat, reminderEndDate, reminderClosedAt });
    }

    if (action === "saveOutline") {
      const pageId = String(body.pageId ?? "");
      const items = Array.isArray(body.items) ? (body.items as JsonRecord[]) : [];
      const normalizedItems = items.map((item, position) => ({
        id: String(item.id ?? id("outline")),
        pageId,
        level: Math.max(0, Math.min(9, Number(item.level ?? 0))),
        position,
        text: String(item.text ?? ""),
        isTask: item.isTask ? 1 : 0,
        completed: item.isTask && item.completed ? 1 : 0,
        entryDate: item.entryDate || plantDate(),
        reminderDate: validReminderDateTime(item.reminderDate),
        reminderRepeat: validReminderRepeat(item.reminderRepeat),
        reminderEndDate: validReminderEndDate(item.reminderEndDate),
        reminderClosedAt: item.reminderClosedAt || null,
      }));
      const currentRows = await db.prepare("SELECT * FROM outline_items WHERE page_id = ?").bind(pageId).all<JsonRecord>();
      const currentById = new Map(currentRows.results.map((row) => [String(row.id), row]));
      const nextIds = new Set(normalizedItems.map((item) => item.id));
      const removedIds = currentRows.results.map((row) => String(row.id)).filter((outlineId) => !nextIds.has(outlineId));
      const statements: D1PreparedStatement[] = [
        db.prepare("UPDATE pages SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(pageId),
      ];
      if (removedIds.length) {
        statements.push(
          db.prepare(`UPDATE page_attachments SET outline_id = NULL WHERE page_id = ? AND outline_id IN (${slots(removedIds)})`).bind(pageId, ...removedIds),
          db.prepare(`DELETE FROM outline_items WHERE page_id = ? AND id IN (${slots(removedIds)})`).bind(pageId, ...removedIds),
        );
      }
      for (const item of normalizedItems) {
        const current = currentById.get(item.id);
        const unchanged = current
          && String(current.page_id) === item.pageId
          && Number(current.level) === item.level
          && Number(current.position) === item.position
          && String(current.text ?? "") === item.text
          && Number(current.is_task) === item.isTask
          && Number(current.completed) === item.completed
          && String(current.entry_date ?? "") === String(item.entryDate ?? "")
          && String(current.reminder_date ?? "") === String(item.reminderDate ?? "")
          && validReminderRepeat(current.reminder_repeat) === item.reminderRepeat
          && String(current.reminder_end_date ?? "") === String(item.reminderEndDate ?? "")
          && String(current.reminder_closed_at ?? "") === String(item.reminderClosedAt ?? "");
        if (unchanged) continue;
        statements.push(db.prepare(`INSERT INTO outline_items (id, page_id, level, position, text, is_task, completed, entry_date, reminder_date, reminder_repeat, reminder_end_date, reminder_closed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET level = excluded.level, position = excluded.position, text = excluded.text,
            is_task = excluded.is_task, completed = excluded.completed, entry_date = excluded.entry_date,
            reminder_date = excluded.reminder_date, reminder_repeat = excluded.reminder_repeat,
            reminder_end_date = excluded.reminder_end_date, reminder_closed_at = excluded.reminder_closed_at
          WHERE outline_items.page_id = excluded.page_id`).bind(
            item.id, item.pageId, item.level, item.position, item.text, item.isTask, item.completed,
            item.entryDate, item.reminderDate, item.reminderRepeat, item.reminderEndDate, item.reminderClosedAt,
          ));
      }
      await db.batch(statements);
      return Response.json({ ok: true, updatedAt: new Date().toISOString() });
    }

    if (action === "createPage") {
      const subsectionId = String(body.subsectionId ?? "npk-solid");
      const parentPageId = body.parentPageId ? String(body.parentPageId) : null;
      const serial = await nextPageSerial(subsectionId, parentPageId);
      const pageId = id("page");
      const outlineId = id("outline");
      const entryDate = plantDate();
      const updatedAt = new Date().toISOString();
      const position = Number((await db.prepare("SELECT MAX(position) AS value FROM pages WHERE subsection_id = ? AND parent_id IS ?").bind(subsectionId, parentPageId).first<{ value: number }>())?.value ?? 0) + 1;
      await db.batch([
        db.prepare(`INSERT INTO pages
          (id, serial, parent_id, subsection_id, title, notes, status, priority, start_date, due_date, completed_date, position, owner_id, supporting_json, source_type, source_label)
          VALUES (?, ?, ?, ?, 'Untitled page', '', 'Not Started', 'Medium', NULL, NULL, NULL, ?, NULL, '[]', 'Direct', 'Journal entry')`)
          .bind(pageId, serial, parentPageId, subsectionId, position),
        db.prepare("INSERT INTO outline_items (id, page_id, level, position, text, is_task, completed, entry_date) VALUES (?, ?, 0, 0, '', 0, 0, ?)")
          .bind(outlineId, pageId, entryDate),
      ]);
      return Response.json({
        ok: true,
        pageId,
        serial,
        page: {
          id: pageId, serial, parentId: parentPageId, subsectionId, title: "Untitled page", notes: "", status: "Not Started", priority: "Medium",
          startDate: null, dueDate: null, completedDate: null, position, ownerId: null, supportingIds: [], sourceType: "Direct", sourceId: null,
          sourceLabel: "Journal entry", sourceAgenda: null, reminderDate: null, reminderRepeat: "none", reminderEndDate: null, reminderClosedAt: null, updatedAt,
        },
        outlineItem: {
          id: outlineId, pageId, level: 0, position: 0, text: "", isTask: false, completed: false, entryDate,
          reminderDate: null, reminderRepeat: "none", reminderEndDate: null, reminderClosedAt: null,
        },
      });
    }

    if (action === "duplicatePage") {
      const sourceId = String(body.pageId ?? "");
      const source = await db.prepare("SELECT * FROM pages WHERE id = ?").bind(sourceId).first<JsonRecord>();
      if (!source) throw new Error("Page not found");
      const pageId = id("page");
      const serial = await nextPageSerial(String(source.subsection_id), source.parent_id ? String(source.parent_id) : null);
      const position = Number((await db.prepare("SELECT MAX(position) AS value FROM pages WHERE subsection_id = ? AND parent_id IS ?").bind(source.subsection_id, source.parent_id || null).first<{ value: number }>())?.value ?? 0) + 1;
      await db.prepare(`INSERT INTO pages
        (id, serial, parent_id, subsection_id, title, notes, status, priority, start_date, due_date, completed_date, position, owner_id, supporting_json, source_type, source_label)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Direct', ?)`)
        .bind(pageId, serial, source.parent_id || null, source.subsection_id, `${String(source.title)} (copy)`, source.notes, source.status, source.priority, source.start_date || null, source.due_date || null, source.completed_date || null, position, source.owner_id || null, source.supporting_json, `Duplicated from ${source.serial}`)
        .run();
      const outlines = await db.prepare("SELECT * FROM outline_items WHERE page_id = ? ORDER BY position").bind(sourceId).all<JsonRecord>();
      const statements = outlines.results.map((item) => db.prepare("INSERT INTO outline_items (id, page_id, level, position, text, is_task, completed, entry_date, reminder_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id("outline"), pageId, item.level, item.position, item.text, item.is_task, item.completed, item.entry_date || plantDate(), item.reminder_date || null));
      if (!statements.length) statements.push(db.prepare("INSERT INTO outline_items (id, page_id, level, position, text, is_task, completed, entry_date) VALUES (?, ?, 0, 0, '', 0, 0, ?)").bind(id("outline"), pageId, plantDate()));
      await db.batch(statements);
      return Response.json({ ok: true, pageId, serial });
    }

    if (action === "movePage") {
      const pageId = String(body.pageId ?? "");
      const subsectionId = String(body.subsectionId ?? "");
      const parentPageId = body.parentPageId ? String(body.parentPageId) : null;
      const current = await db.prepare("SELECT serial FROM pages WHERE id = ?").bind(pageId).first<{ serial: string }>();
      if (!current) throw new Error("Page not found");
      const descendants = await pageTree(pageId);
      if (parentPageId && descendants.includes(parentPageId)) throw new Error("A page cannot be moved inside itself");
      const serial = await nextPageSerial(subsectionId, parentPageId);
      const position = Number((await db.prepare("SELECT MAX(position) AS value FROM pages WHERE subsection_id = ? AND parent_id IS ? AND id != ?").bind(subsectionId, parentPageId, pageId).first<{ value: number }>())?.value ?? 0) + 1;
      const rows = await db.prepare(`SELECT id, serial FROM pages WHERE id IN (${slots(descendants)})`).bind(...descendants).all<{ id: string; serial: string }>();
      const statements: D1PreparedStatement[] = [
        db.prepare("UPDATE pages SET serial = ?, parent_id = ?, subsection_id = ?, position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(serial, parentPageId, subsectionId, position, pageId),
      ];
      for (const row of rows.results) {
        if (row.id === pageId) continue;
        statements.push(db.prepare("UPDATE pages SET serial = ?, subsection_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(replacePrefix(row.serial, current.serial, serial), subsectionId, row.id));
      }
      await db.batch(statements);
      return Response.json({ ok: true, pageId, serial });
    }

    if (action === "reorderPage") {
      const pageId = String(body.pageId ?? "");
      const targetPageId = String(body.targetPageId ?? "");
      if (!pageId || !targetPageId || pageId === targetPageId) throw new Error("Choose another page position.");
      const [moving, target] = await Promise.all([
        db.prepare("SELECT id, subsection_id, parent_id FROM pages WHERE id = ?").bind(pageId).first<{ id: string; subsection_id: string; parent_id: string | null }>(),
        db.prepare("SELECT id, subsection_id, parent_id FROM pages WHERE id = ?").bind(targetPageId).first<{ id: string; subsection_id: string; parent_id: string | null }>(),
      ]);
      if (!moving || !target) throw new Error("Page not found.");
      const descendants = await pageTree(pageId);
      if (descendants.includes(targetPageId)) throw new Error("A page cannot be placed beside one of its own subpages.");
      const siblings = (await db.prepare("SELECT id, position, serial FROM pages WHERE subsection_id = ? AND parent_id IS ? ORDER BY position, serial")
        .bind(target.subsection_id, target.parent_id).all<{ id: string; position: number; serial: string }>()).results.filter((item) => item.id !== pageId);
      const targetIndex = siblings.findIndex((item) => item.id === targetPageId);
      siblings.splice(Math.max(0, targetIndex), 0, { id: pageId, position: 0, serial: "" });
      await db.batch([
        db.prepare("UPDATE pages SET subsection_id = ?, parent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(target.subsection_id, target.parent_id, pageId),
        ...siblings.map((item, index) => db.prepare("UPDATE pages SET position = ? WHERE id = ?").bind(index + 1, item.id)),
      ]);
      await normalizeSerialNumbers();
      return Response.json({ ok: true, pageId });
    }

    if (action === "deletePage") {
      const pageIds = await pageTree(String(body.pageId ?? ""));
      await deletePages(pageIds);
      return Response.json({ ok: true });
    }

    if (action === "createSection") {
      const name = String(body.name ?? "New section").trim() || "New section";
      const parentId = body.parentId ? String(body.parentId) : null;
      if (!parentId) {
        const notebookId = String(body.notebookId ?? "plant-operations");
        const root = await nextSectionPrefix(null, notebookId);
        const sectionId = id("section");
        const position = await nextSectionPosition(null, notebookId);
        await db.prepare("INSERT INTO departments (id, notebook_id, name, color, parent_id, serial_prefix, position) VALUES (?, ?, ?, '#6d4cc2', NULL, ?, ?)")
          .bind(sectionId, notebookId, name, root.prefix, position).run();
        return Response.json({
          ok: true,
          sectionId,
          sectionKind: "department",
          departmentId: sectionId,
          serialPrefix: root.prefix,
          section: { id: sectionId, notebookId, name, color: "#6d4cc2", parentId: null, serialPrefix: root.prefix, position },
        });
      }
      const next = await nextSectionPrefix(parentId);
      const parent = await findSection(parentId);
      if (!parent) throw new Error("Parent section not found.");
      const notebookId = String(parent.row.notebook_id ?? "plant-operations");
      const sectionId = id("section");
      const position = await nextSectionPosition(parentId, notebookId);
      await db.prepare("INSERT INTO subsections (id, notebook_id, department_id, parent_id, name, serial_prefix, position) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(sectionId, notebookId, next.departmentId, parentId, name, next.prefix, position).run();
      return Response.json({
        ok: true,
        sectionId,
        sectionKind: "subsection",
        departmentId: next.departmentId,
        serialPrefix: next.prefix,
        section: { id: sectionId, notebookId, departmentId: next.departmentId, parentId, name, serialPrefix: next.prefix, position },
      });
    }

    if (action === "renameSection") {
      const kind = String(body.sectionKind) as SectionKind;
      const table = kind === "department" ? "departments" : "subsections";
      await db.prepare(`UPDATE ${table} SET name = ? WHERE id = ?`).bind(String(body.name ?? "Untitled section"), String(body.sectionId ?? "")).run();
      return Response.json({ ok: true });
    }

    if (action === "reorderSection") {
      const sectionId = String(body.sectionId ?? "");
      const targetSectionId = String(body.targetSectionId ?? "");
      const placement = body.placement === "after" ? "after" : "before";
      if (!sectionId || !targetSectionId || sectionId === targetSectionId) throw new Error("Choose another section position.");
      const [moving, target] = await Promise.all([findSection(sectionId), findSection(targetSectionId)]);
      if (!moving || !target) throw new Error("Section not found.");
      if (String(moving.row.notebook_id) !== String(target.row.notebook_id)) throw new Error("Sections can only be reordered inside the same notebook.");
      const oldPrefix = String(moving.row.serial_prefix);
      if (String(target.row.serial_prefix).startsWith(`${oldPrefix}.`)) throw new Error("A section cannot be placed beside one of its own child sections.");

      const targetParentId = target.kind === "department"
        ? target.row.parent_id ? String(target.row.parent_id) : null
        : target.row.parent_id
          ? String(target.row.parent_id)
          : String(target.row.department_id) === targetSectionId ? null : String(target.row.department_id);
      const notebookId = String(target.row.notebook_id);
      const [departmentSiblings, subsectionSiblings] = targetParentId
        ? await Promise.all([
            db.prepare("SELECT id, position, serial_prefix FROM departments WHERE notebook_id = ? AND parent_id = ?").bind(notebookId, targetParentId).all<{ id: string; position: number; serial_prefix: string }>(),
            db.prepare("SELECT id, position, serial_prefix FROM subsections WHERE notebook_id = ? AND parent_id = ?").bind(notebookId, targetParentId).all<{ id: string; position: number; serial_prefix: string }>(),
          ])
        : await Promise.all([
            db.prepare("SELECT id, position, serial_prefix FROM departments WHERE notebook_id = ? AND parent_id IS NULL").bind(notebookId).all<{ id: string; position: number; serial_prefix: string }>(),
            db.prepare("SELECT id, position, serial_prefix FROM subsections WHERE notebook_id = ? AND parent_id IS NULL AND department_id = id").bind(notebookId).all<{ id: string; position: number; serial_prefix: string }>(),
          ]);
      const siblings = [
        ...departmentSiblings.results.map((row) => ({ ...row, kind: "department" as const })),
        ...subsectionSiblings.results.map((row) => ({ ...row, kind: "subsection" as const })),
      ].filter((row) => row.id !== sectionId).sort((a, b) => a.position - b.position || compareSerials(a.serial_prefix, b.serial_prefix) || a.id.localeCompare(b.id));
      const targetIndex = siblings.findIndex((row) => row.id === targetSectionId);
      if (targetIndex < 0) throw new Error("The target section is no longer in this location.");
      siblings.splice(targetIndex + (placement === "after" ? 1 : 0), 0, { id: sectionId, kind: moving.kind, position: 0, serial_prefix: oldPrefix });

      const statements: D1PreparedStatement[] = [];
      if (moving.kind === "department") {
        statements.push(db.prepare("UPDATE departments SET parent_id = ?, position = ? WHERE id = ?").bind(targetParentId, targetIndex + 1, sectionId));
      } else if (!targetParentId) {
        statements.push(db.prepare("UPDATE subsections SET parent_id = NULL, department_id = ?, position = ? WHERE id = ?").bind(sectionId, targetIndex + 1, sectionId));
      } else {
        const parent = await findSection(targetParentId);
        if (!parent) throw new Error("Parent section not found.");
        const departmentId = parent.kind === "department" ? String(parent.row.id) : String(parent.row.department_id);
        statements.push(db.prepare("UPDATE subsections SET parent_id = ?, department_id = ?, position = ? WHERE id = ?").bind(targetParentId, departmentId, targetIndex + 1, sectionId));
      }
      siblings.forEach((sibling, index) => {
        const table = sibling.kind === "department" ? "departments" : "subsections";
        statements.push(db.prepare(`UPDATE ${table} SET position = ? WHERE id = ?`).bind(index + 1, sibling.id));
      });
      await db.batch(statements);
      await normalizeSerialNumbers();
      return Response.json({ ok: true, sectionId });
    }

    if (action === "moveSection") {
      const sectionId = String(body.sectionId ?? "");
      const kind = String(body.sectionKind) as SectionKind;
      const targetId = body.targetId ? String(body.targetId) : null;
      const section = await findSection(sectionId);
      if (!section || section.kind !== kind) throw new Error("Section not found");
      if (targetId === sectionId) throw new Error("A section cannot be placed inside itself");
      const oldPrefix = String(section.row.serial_prefix);
      const next = await nextSectionPrefix(targetId, String(section.row.notebook_id ?? "plant-operations"));
      const position = await nextSectionPosition(targetId, String(section.row.notebook_id ?? "plant-operations"));
      if (targetId) {
        const target = await findSection(targetId);
        if (!target) throw new Error("Target section not found");
        if (String(target.row.serial_prefix).startsWith(`${oldPrefix}.`)) throw new Error("A section cannot be placed inside one of its children");
      }
      if (kind === "department") {
        await db.prepare("UPDATE departments SET parent_id = ?, serial_prefix = ?, position = ? WHERE id = ?").bind(targetId, next.prefix, position, sectionId).run();
        await rewriteSerialPrefix(oldPrefix, next.prefix);
      } else {
        if (!targetId) throw new Error("A subsection must have a parent section");
        await db.prepare("UPDATE subsections SET parent_id = ?, department_id = ?, serial_prefix = ?, position = ? WHERE id = ?")
          .bind(targetId, next.departmentId, next.prefix, position, sectionId).run();
        await rewriteSerialPrefix(oldPrefix, next.prefix, next.departmentId);
      }
      await normalizeSerialNumbers();
      return Response.json({ ok: true });
    }

    if (action === "promoteSection") {
      const sectionId = String(body.sectionId ?? "");
      const section = await findSection(sectionId);
      if (!section || section.kind !== "subsection") throw new Error("Only a subsection can be promoted.");
      const currentParentId = section.row.parent_id
        ? String(section.row.parent_id)
        : String(section.row.department_id) === sectionId ? null : String(section.row.department_id);
      if (!currentParentId) throw new Error("This section is already at the main level.");
      const currentParent = await findSection(currentParentId);
      if (!currentParent) throw new Error("Parent section not found.");
      const targetId = currentParent.kind === "department"
        ? currentParent.row.parent_id ? String(currentParent.row.parent_id) : null
        : currentParent.row.parent_id
          ? String(currentParent.row.parent_id)
          : String(currentParent.row.department_id) === String(currentParent.row.id)
            ? null
            : String(currentParent.row.department_id);
      const oldPrefix = String(section.row.serial_prefix);
      const next = await nextSectionPrefix(targetId, String(section.row.notebook_id ?? "plant-operations"));
      const position = await nextSectionPosition(targetId, String(section.row.notebook_id ?? "plant-operations"));
      if (targetId) {
        await db.prepare("UPDATE subsections SET parent_id = ?, department_id = ?, serial_prefix = ?, position = ? WHERE id = ?")
          .bind(targetId, next.departmentId, next.prefix, position, sectionId).run();
        await rewriteSerialPrefix(oldPrefix, next.prefix, next.departmentId);
        await normalizeSerialNumbers();
        return Response.json({ ok: true, sectionId, departmentId: next.departmentId });
      }
      await db.prepare("UPDATE subsections SET parent_id = NULL, department_id = ?, serial_prefix = ?, position = ? WHERE id = ?")
        .bind(sectionId, next.prefix, position, sectionId).run();
      await rewriteSerialPrefix(oldPrefix, next.prefix, sectionId);
      await normalizeSerialNumbers();
      return Response.json({ ok: true, sectionId, departmentId: sectionId });
    }

    if (action === "deleteSection") {
      const sectionId = String(body.sectionId ?? "");
      const departments = (await db.prepare("SELECT id, parent_id FROM departments").all<{ id: string; parent_id: string | null }>()).results;
      const subsections = (await db.prepare("SELECT id, parent_id, department_id FROM subsections").all<{ id: string; parent_id: string | null; department_id: string }>()).results;
      const found = new Set([sectionId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const row of departments) {
          if (row.parent_id && found.has(row.parent_id) && !found.has(row.id)) { found.add(row.id); changed = true; }
        }
        for (const row of subsections) {
          if ((row.parent_id && found.has(row.parent_id)) || found.has(row.department_id)) {
            if (!found.has(row.id)) { found.add(row.id); changed = true; }
          }
        }
      }
      const departmentIds = departments.filter((row) => found.has(row.id)).map((row) => row.id);
      const subsectionIds = subsections.filter((row) => found.has(row.id)).map((row) => row.id);
      const pageSectionIds = [...departmentIds, ...subsectionIds];
      let pageIds: string[] = [];
      if (pageSectionIds.length) {
        pageIds = (await db.prepare(`SELECT id FROM pages WHERE subsection_id IN (${slots(pageSectionIds)})`).bind(...pageSectionIds).all<{ id: string }>()).results.map((row) => row.id);
      }
      await deletePages(pageIds);
      const statements: D1PreparedStatement[] = [];
      if (subsectionIds.length) statements.push(db.prepare(`DELETE FROM subsections WHERE id IN (${slots(subsectionIds)})`).bind(...subsectionIds));
      if (departmentIds.length) statements.push(db.prepare(`DELETE FROM departments WHERE id IN (${slots(departmentIds)})`).bind(...departmentIds));
      if (statements.length) await db.batch(statements);
      return Response.json({ ok: true });
    }

    if (action === "createMeeting") {
      const rows = await db.prepare("SELECT number FROM meetings").all<{ number: string }>();
      const next = rows.results.reduce((max: number, row: { number: string }) => Math.max(max, Number(row.number.replace(/\D/g, "")) || 0), 0) + 1;
      const meetingId = id("meeting");
      const number = `M-${String(next).padStart(3, "0")}`;
      const today = plantDate();
      await db.prepare(`INSERT INTO meetings
        (id, number, purpose, date, venue, convener, called_by, participants_json)
        VALUES (?, ?, 'New meeting', ?, '', 'Fahim Asghar', 'Plant Operations', '[]')`)
        .bind(meetingId, number, today)
        .run();
      const agendaStatements = Array.from({ length: 10 }, (_, index) =>
        db.prepare("INSERT INTO agenda_items (id, meeting_id, position, title, discussion, action_text) VALUES (?, ?, ?, '', '', '')")
          .bind(id("agenda"), meetingId, index + 1),
      );
      await db.batch(agendaStatements);
      return Response.json({ ok: true, meetingId, number });
    }

    if (action === "saveMeeting") {
      const meeting = body.meeting as JsonRecord;
      const meetingId = String(meeting.id ?? "");
      await db.prepare(`UPDATE meetings SET
        purpose = ?, date = ?, venue = ?, convener = ?, called_by = ?, participants_json = ?, discussion = ?, update_text = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`).bind(
          String(meeting.purpose ?? ""), String(meeting.date ?? ""), String(meeting.venue ?? ""),
          String(meeting.convener ?? ""), String(meeting.calledBy ?? ""), JSON.stringify(meeting.participants ?? []),
          String(meeting.discussion ?? ""), String(meeting.updateText ?? ""), meetingId,
        ).run();

      const agendas = Array.isArray(body.agendas) ? (body.agendas as JsonRecord[]) : [];
      const statements: D1PreparedStatement[] = [];
      for (const [index, agenda] of agendas.entries()) {
        statements.push(db.prepare(`INSERT INTO agenda_items
          (id, meeting_id, position, title, discussion, action_text, linked_page_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET title = excluded.title, discussion = excluded.discussion,
          action_text = excluded.action_text, linked_page_id = excluded.linked_page_id`).bind(
            String(agenda.id ?? id("agenda")), meetingId, index + 1, String(agenda.title ?? ""),
            String(agenda.discussion ?? ""), String(agenda.actionText ?? ""), agenda.linkedPageId || null,
          ));
        if (agenda.linkedPageId) {
          statements.push(db.prepare("UPDATE pages SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(String(agenda.actionText || agenda.title || "Meeting action"), String(agenda.linkedPageId)));
        }
      }
      if (statements.length) await db.batch(statements);
      return Response.json({ ok: true });
    }

    if (action === "linkAgenda") {
      const meetingId = String(body.meetingId ?? "");
      const agendaId = String(body.agendaId ?? "");
      const subsectionId = String(body.subsectionId ?? "npk-solid");
      const agenda = await db.prepare("SELECT * FROM agenda_items WHERE id = ?").bind(agendaId).first<JsonRecord>();
      const meeting = await db.prepare("SELECT number FROM meetings WHERE id = ?").bind(meetingId).first<{ number: string }>();
      if (!agenda || !meeting) throw new Error("Meeting action not found");
      const serial = await nextPageSerial(subsectionId);
      const pageId = id("page");
      const position = Number((await db.prepare("SELECT MAX(position) AS value FROM pages WHERE subsection_id = ? AND parent_id IS NULL").bind(subsectionId).first<{ value: number }>())?.value ?? 0) + 1;
      const title = String(agenda.action_text || agenda.title || "Meeting action");
      const sourceLabel = `${meeting.number} · Agenda ${agenda.position}`;
      await db.batch([
        db.prepare(`INSERT INTO pages
          (id, serial, subsection_id, title, notes, status, priority, start_date, due_date, completed_date, position, owner_id, supporting_json, source_type, source_id, source_label, source_agenda)
          VALUES (?, ?, ?, ?, ?, 'Not Started', 'Medium', NULL, ?, NULL, ?, ?, '[]', 'Meeting', ?, ?, ?)`)
          .bind(pageId, serial, subsectionId, title, String(agenda.discussion ?? ""), body.dueDate || null, position, body.ownerId || null, meetingId, sourceLabel, agenda.position),
        db.prepare("UPDATE agenda_items SET linked_page_id = ? WHERE id = ?").bind(pageId, agendaId),
        db.prepare("INSERT INTO outline_items (id, page_id, level, position, text, completed, entry_date) VALUES (?, ?, 0, 0, ?, 0, ?)")
          .bind(id("outline"), pageId, String(agenda.action_text ?? ""), plantDate()),
      ]);
      return Response.json({ ok: true, pageId, serial });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save the change";
    return Response.json({ error: message }, { status: 500 });
  }
}
