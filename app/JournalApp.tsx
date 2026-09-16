"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatAppDate } from "@/lib/date-format";

type Notebook = { id: string; name: string; color: string; position: number };
type Department = { id: string; notebookId: string; name: string; color: string; parentId: string | null; serialPrefix: string; position: number };
type Subsection = { id: string; notebookId: string; departmentId: string; parentId: string | null; name: string; serialPrefix: string; position: number };
type Person = { id: string; name: string; role: string; departmentId: string | null };
type ReminderRepeat = "none" | "daily-until-closed" | "daily" | "weekdays" | "weekly" | "monthly";
type Page = {
  id: string;
  serial: string;
  parentId: string | null;
  subsectionId: string;
  title: string;
  notes: string;
  status: string;
  priority: string;
  startDate: string | null;
  dueDate: string | null;
  completedDate: string | null;
  position: number;
  ownerId: string | null;
  supportingIds: string[];
  sourceType: string;
  sourceId: string | null;
  sourceLabel: string | null;
  sourceAgenda: number | null;
  reminderDate?: string | null;
  reminderRepeat?: ReminderRepeat;
  reminderEndDate?: string | null;
  reminderClosedAt?: string | null;
  updatedAt: string;
};
type OutlineItem = { id: string; pageId: string; level: number; position: number; text: string; isTask: boolean; completed: boolean; entryDate: string | null; reminderDate: string | null; reminderRepeat: ReminderRepeat; reminderEndDate: string | null; reminderClosedAt: string | null };
type AttachmentBase = {
  id: string;
  kind: "photo" | "document" | "audio" | "link";
  title: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
};
type PageAttachment = AttachmentBase & {
  pageId: string;
  outlineId: string | null;
  externalUrl: string | null;
  repository: string | null;
};
type DayPlanItem = {
  id: string;
  chainId: string;
  planDate: string;
  category: "Task" | "Call" | "Email";
  title: string;
  notes: string;
  plannedTime: string | null;
  assigneeId: string | null;
  reminderRepeat: ReminderRepeat;
  reminderEndDate: string | null;
  reminderClosedAt: string | null;
  status: "Active" | "Completed" | "Abandoned" | "Cancelled" | "Postponed" | "Carried Forward";
  carriedFromId: string | null;
  carryCount: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  linkedPageId: string | null;
};
type DayPlanDetail = { id: string; chainId: string; level: number; position: number; text: string; isTask: boolean; completed: boolean; entryDate: string | null };
type DayPlanAttachment = AttachmentBase & {
  chainId: string;
  detailId: string | null;
  kind: "photo" | "document" | "audio";
};
type Meeting = {
  id: string;
  number: string;
  purpose: string;
  date: string;
  venue: string;
  convener: string;
  calledBy: string;
  participants: string[];
  discussion: string;
  updateText: string;
  updatedAt: string;
};
type AgendaItem = {
  id: string;
  meetingId: string;
  position: number;
  title: string;
  discussion: string;
  actionText: string;
  linkedPageId: string | null;
};
type HierarchyState = { collapsedSections: string[]; focusCollapsed: boolean };
type EditorIssue = {
  id: string;
  targetId: "page-title" | string;
  targetLabel: string;
  sourceText: string;
  start: number;
  end: number;
  problem: string;
  message: string;
  kind: string;
  suggestions: string[];
};
type AppData = {
  notebooks: Notebook[];
  departments: Department[];
  subsections: Subsection[];
  people: Person[];
  pages: Page[];
  outlineItems: OutlineItem[];
  meetings: Meeting[];
  agendaItems: AgendaItem[];
  attachments: PageAttachment[];
  dayPlanItems: DayPlanItem[];
  dayPlanDetails: DayPlanDetail[];
  dayPlanAttachments: DayPlanAttachment[];
  editorDictionary: string[];
  focusOrder: string[];
  hierarchyStates: Record<string, HierarchyState>;
};

type ViewName = "dashboard" | "my-day" | "journal" | "tasks" | "meetings" | "people";
type MobileJournalPane = "sections" | "pages" | "page";
type NavigationSnapshot = {
  activeView: ViewName;
  mobileJournalPane: MobileJournalPane;
  selectedNotebookId: string;
  selectedDepartmentId: string;
  selectedSubsectionId: string;
  selectedPageId: string;
  selectedMeetingId: string;
  selectedPersonId: string;
  journalFilter: string;
  scrollPositions?: Record<string, number>;
};
const appThemes = ["paper", "lavender", "sage", "slate", "ocean", "indigo", "fuchsia", "teal", "sky", "sand"] as const;
type AppTheme = typeof appThemes[number];
type DisplayMode = "day" | "night" | "auto";
type PushStatus = "checking" | "enabled" | "off" | "denied" | "unsupported" | "error";
type SectionKind = "department" | "subsection";
type SectionNode = {
  id: string;
  kind: SectionKind;
  name: string;
  parentId: string | null;
  departmentId: string;
  serialPrefix: string;
  color: string;
  children: SectionNode[];
};
type MenuAnchor = { x: number; y: number; top: number };
type ActionMenu = ({ kind: "page"; id: string } | { kind: "section"; id: string; sectionKind: SectionKind }) & MenuAnchor;
type MoveDialog = { kind: "page"; id: string; subsectionId: string; parentPageId: string } | { kind: "section"; id: string; sectionKind: SectionKind; targetId: string };
type DragItem = { kind: "page"; id: string } | { kind: "section"; id: string; sectionKind: SectionKind };
type SectionDragItem = Extract<DragItem, { kind: "section" }>;

const appFonts = ["Calibri", "Arial", "Times New Roman", "Beirut"] as const;
type AppFont = typeof appFonts[number];

function appFontFamily(font: AppFont) {
  if (font === "Times New Roman") return '"Times New Roman", Times, serif';
  if (font === "Beirut") return 'Beirut, Calibri, Arial, sans-serif';
  if (font === "Arial") return 'Arial, Helvetica, sans-serif';
  return 'Calibri, "Segoe UI", Arial, sans-serif';
}

const emptyData: AppData = {
  notebooks: [],
  departments: [],
  subsections: [],
  people: [],
  pages: [],
  outlineItems: [],
  meetings: [],
  agendaItems: [],
  attachments: [],
  dayPlanItems: [],
  dayPlanDetails: [],
  dayPlanAttachments: [],
  editorDictionary: [],
  focusOrder: ["all", "today", "reminders", "attention", "in-progress", "not-started", "completed"],
  hierarchyStates: {},
};

type PrivateEditorLinter = import("harper.js").Linter;

async function createPrivateEditorLinter() {
  const [harper, binaryModule] = await Promise.all([import("harper.js"), import("harper.js/binary")]);
  const linter = new harper.WorkerLinter({ binary: binaryModule.binary, dialect: harper.Dialect.British });
  await linter.setup();
  return linter;
}

async function requestWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error("The connection took too long. Please try again.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function unicodeOffsetToUtf16(text: string, offset: number) {
  return [...text].slice(0, Math.max(0, offset)).join("").length;
}

function replaceEditableTextRange(root: HTMLElement, start: number, end: number, replacement: string) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  let cursor = 0;
  let startNode: Text | null = null;
  let endNode: Text | null = null;
  let startOffset = 0;
  let endOffset = 0;
  while (node) {
    const next = cursor + node.data.length;
    if (!startNode && start >= cursor && start <= next) {
      startNode = node;
      startOffset = start - cursor;
    }
    if (end >= cursor && end <= next) {
      endNode = node;
      endOffset = end - cursor;
      break;
    }
    cursor = next;
    node = walker.nextNode() as Text | null;
  }
  if (!startNode || !endNode) return null;
  const range = document.createRange();
  range.setStart(startNode, Math.min(startOffset, startNode.data.length));
  range.setEnd(endNode, Math.min(endOffset, endNode.data.length));
  range.deleteContents();
  range.insertNode(document.createTextNode(replacement));
  root.normalize();
  return root.innerHTML;
}

function localDate(value = new Date()) {
  const shifted = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 10);
}

function localDateTime(value = new Date()) {
  const shifted = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function compactLineDate(value: string | null) {
  return value ? formatAppDate(value) : "Set date";
}

function menuAnchor(event: React.MouseEvent) {
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: rect.right, y: rect.bottom, top: rect.top };
}

function actionMenuStyle(menu: ActionMenu): React.CSSProperties {
  const edge = 8;
  const gap = 6;
  const width = Math.min(214, window.innerWidth - edge * 2);
  const estimatedHeight = menu.kind === "page" ? 292 : 220;
  const left = Math.min(Math.max(edge, menu.x - width), window.innerWidth - width - edge);
  const below = menu.y + gap;
  const top = below + estimatedHeight <= window.innerHeight - edge
    ? below
    : Math.max(edge, menu.top - gap - estimatedHeight);
  return { left, top, width, maxHeight: window.innerHeight - edge * 2 };
}

function reminderDatePart(value: string) {
  return value.slice(0, 10);
}

function reminderIsDue(value: string, now = new Date()) {
  if (!value) return false;
  if (value.length === 10) return value <= localDate(now);
  const reminder = new Date(value);
  return !Number.isNaN(reminder.getTime()) && reminder.getTime() <= now.getTime();
}

function repeatMatchesDate(startDate: string, candidateDate: string, repeat: ReminderRepeat) {
  if (repeat === "daily" || repeat === "daily-until-closed") return true;
  const start = dayDate(startDate);
  const candidate = dayDate(candidateDate);
  if (repeat === "weekdays") return candidate.getDay() > 0 && candidate.getDay() < 6;
  if (repeat === "weekly") return start.getDay() === candidate.getDay();
  if (repeat === "monthly") return start.getDate() === candidate.getDate();
  return startDate === candidateDate;
}

function reminderOccurrence(dateTime: string | null, repeat: ReminderRepeat, endDate: string | null, closedAt: string | null, completed: boolean, now = new Date()) {
  if (!dateTime || closedAt || (completed && repeat !== "daily-until-closed")) return null;
  const normalized = dateTime.length === 10 ? `${dateTime}T09:00` : dateTime;
  if (repeat === "none") return reminderIsDue(normalized, now) ? normalized : null;
  const startDate = normalized.slice(0, 10);
  const candidateDate = localDate(now);
  if (candidateDate < startDate || (endDate && candidateDate > endDate) || !repeatMatchesDate(startDate, candidateDate, repeat)) return null;
  const occurrence = `${candidateDate}T${normalized.slice(11, 16) || "09:00"}`;
  return reminderIsDue(occurrence, now) ? occurrence : null;
}

function pageReminderOccurrence(page: Page, now = new Date()) {
  return reminderOccurrence(page.reminderDate ?? null, page.reminderRepeat ?? "none", page.reminderEndDate ?? null, page.reminderClosedAt ?? null, page.status === "Completed", now);
}

function dayPlanReminderDate(item: DayPlanItem, now = new Date()) {
  if (!item.plannedTime) return null;
  const completed = item.status !== "Active";
  return reminderOccurrence(`${item.planDate}T${item.plannedTime}`, item.reminderRepeat ?? "none", item.reminderEndDate, item.reminderClosedAt, completed, now);
}

function reminderRepeatLabel(repeat: ReminderRepeat) {
  const labels: Record<ReminderRepeat, string> = {
    none: "Never",
    "daily-until-closed": "Daily until closed",
    daily: "Daily",
    weekdays: "Weekdays",
    weekly: "Weekly",
    monthly: "Monthly",
  };
  return labels[repeat] ?? "Never";
}

function dayDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function shiftDay(value: string, days: number) {
  const date = dayDate(value);
  date.setDate(date.getDate() + days);
  return localDate(date);
}

function dayHeading(value: string) {
  if (value === localDate()) return "Today";
  if (value === shiftDay(localDate(), 1)) return "Tomorrow";
  if (value === shiftDay(localDate(), -1)) return "Yesterday";
  return new Intl.DateTimeFormat("en", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(dayDate(value));
}

function ordinalDay(day: number) {
  const remainder = day % 100;
  if (remainder >= 11 && remainder <= 13) return `${day}th`;
  if (day % 10 === 1) return `${day}st`;
  if (day % 10 === 2) return `${day}nd`;
  if (day % 10 === 3) return `${day}rd`;
  return `${day}th`;
}

function fullPlannerDate(value: string) {
  const date = dayDate(value);
  const weekday = new Intl.DateTimeFormat("en", { weekday: "long" }).format(date);
  const monthYear = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(date);
  return `${weekday} ${ordinalDay(date.getDate())} ${monthYear}`;
}

function monthHeading(value: string) {
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(dayDate(`${value}-01`));
}

function shiftMonth(value: string, amount: number) {
  const date = dayDate(`${value}-01`);
  date.setMonth(date.getMonth() + amount);
  return localDate(date).slice(0, 7);
}

const shortWeekdaysMondayFirst = ["M", "T", "W", "T", "F", "S", "S"];
const fullWeekdaysMondayFirst = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function mondayFirstDayIndex(date: Date) {
  return (date.getDay() + 6) % 7;
}

function calendarDates(month: string) {
  const first = dayDate(`${month}-01`);
  const start = new Date(first);
  start.setDate(first.getDate() - mondayFirstDayIndex(first));
  return Array.from({ length: 42 }, (_, index) => shiftDay(localDate(start), index));
}

function weekDates(value: string) {
  const selected = dayDate(value);
  const start = new Date(selected);
  start.setDate(selected.getDate() - mondayFirstDayIndex(selected));
  return Array.from({ length: 7 }, (_, index) => shiftDay(localDate(start), index));
}

function friendlyDate(value: string | null) {
  if (!value) return "No due date";
  value = reminderDatePart(value);
  const today = localDate();
  if (value === today) return "Today";
  const date = new Date(`${value}T12:00:00`);
  const diff = Math.round((date.getTime() - new Date(`${today}T12:00:00`).getTime()) / 86_400_000);
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(date);
}

function friendlyReminderLabel(value: string) {
  const dateLabel = friendlyDate(value);
  if (value.length <= 10) return dateLabel;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return dateLabel;
  const time = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", hour12: true }).format(date);
  return `${dateLabel} · ${time}`;
}

function formatAppTime(value: string | null | undefined) {
  const match = /^(\d{1,2}):(\d{2})/.exec(value ?? "");
  if (!match) return "";
  const hour = Number(match[1]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return "";
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? "PM" : "AM"}`;
}

function decodeApplicationServerKey(value: string) {
  const padded = value + "=".repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded.replace(/-/g, "+").replace(/_/g, "/")), (character) => character.charCodeAt(0));
}

function pushSubscriptionUsesKey(subscription: PushSubscription, expected: Uint8Array) {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === expected.length && bytes.every((byte, index) => byte === expected[index]);
}

function journalTimestamp(value: string) {
  if (!value) return new Date(0);
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function lastEditedLabel(value: string, detailed = false) {
  const date = journalTimestamp(value);
  if (!date.getTime()) return "Not edited yet";
  if (detailed) {
    return `Last edited ${new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(date)}`;
  }
  const elapsedDays = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (elapsedDays <= 0) return "Edited today";
  if (elapsedDays === 1) return "Edited yesterday";
  if (elapsedDays < 31) return `Edited ${elapsedDays}d ago`;
  return `Edited ${new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(date)}`;
}

function addedTimeLabel(value: string) {
  const date = journalTimestamp(value);
  if (!date.getTime()) return "Added automatically";
  return `Added ${new Intl.DateTimeFormat("en", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(date)}`;
}

function journalFilterLabel(filter: string) {
  const labels: Record<string, string> = {
    all: "All pages",
    today: "Due today",
    attention: "Requires attention",
    reminders: "Reminders",
    "in-progress": "In progress",
    "not-started": "Not started",
    completed: "Completed",
    overdue: "Overdue",
    waiting: "Waiting",
    "untouched-7": "Not checked in 7 days",
    "untouched-15": "Not checked in 15 days",
    "untouched-30": "Not checked in 30 days",
  };
  return labels[filter] ?? "Pages";
}

function pageHasReminder(page: Page, _data: AppData) {
  return Boolean(page.reminderDate && !page.reminderClosedAt && (page.status !== "Completed" || page.reminderRepeat === "daily-until-closed"));
}

function pageFirstReminderDate(page: Page, _data: AppData) {
  return page.reminderDate && !page.reminderClosedAt && (page.status !== "Completed" || page.reminderRepeat === "daily-until-closed") ? page.reminderDate : undefined;
}

function statusTone(status: string) {
  if (status === "Completed") return "green";
  if (status === "Requires Attention") return "red";
  if (status === "Waiting") return "amber";
  if (status === "In Progress") return "purple";
  return "gray";
}

function priorityTone(priority: string) {
  if (priority === "High") return "red";
  if (priority === "Medium") return "amber";
  return "gray";
}

function isOpen(page: Page) {
  return page.status !== "Completed";
}

function isOverdue(page: Page) {
  return Boolean(page.dueDate && page.dueDate < localDate() && isOpen(page));
}

function pageMatchesFilter(page: Page, filter: string) {
  const today = localDate();
  if (filter === "today") return page.dueDate === today && isOpen(page);
  if (filter === "attention") return page.status === "Requires Attention" || isOverdue(page);
  if (filter === "week") {
    if (!page.dueDate || !isOpen(page)) return false;
    const end = new Date();
    end.setDate(end.getDate() + 7);
    return page.dueDate >= today && page.dueDate <= localDate(end);
  }
  if (filter === "overdue") return isOverdue(page);
  if (filter === "high") return page.priority === "High" && isOpen(page);
  if (filter === "meetings") return page.sourceType === "Meeting";
  if (filter === "in-progress") return page.status === "In Progress";
  if (filter === "not-started") return page.status === "Not Started";
  if (filter === "completed") return page.status === "Completed";
  if (filter === "waiting") return page.status === "Waiting";
  if (filter.startsWith("untouched-")) {
    const days = Number(filter.slice("untouched-".length));
    return Number.isFinite(days) && Date.now() - journalTimestamp(page.updatedAt).getTime() >= days * 86_400_000;
  }
  return true;
}

function computeOutlineSerials(base: string, items: Array<{ level: number }>) {
  const counters: number[] = [];
  return items.map((item, index) => {
    const previousLevel = index === 0 ? 0 : items[index - 1].level;
    const level = Math.max(0, Math.min(item.level, index === 0 ? 0 : previousLevel + 1));
    if (index === 0) {
      counters.splice(0, counters.length, 1);
    } else if (level > previousLevel) {
      while (counters.length < level + 1) counters.push(1);
    } else {
      counters.splice(level + 1);
      counters[level] = (counters[level] ?? 0) + 1;
    }
    const [updateNumber, ...childNumbers] = counters;
    return `${base}-U${updateNumber}${childNumbers.length ? `.${childNumbers.join(".")}` : ""}`;
  });
}

function richTextIsEmpty(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]*>/g, "")
    .trim() === "";
}

function richTextPlainText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(?:div|p|li|h[1-6])>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanPastedText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+$/g, ""))
    .join("\n")
    .replace(/^\n+|\n+$/g, "")
    .replace(/\n{3,}/g, "\n\n");
}

function trimRichTextEmptyEdges(value: string) {
  if (typeof document === "undefined" || !value) return value.trim();
  const container = document.createElement("div");
  container.innerHTML = value;
  const isEmpty = (node: ChildNode) => {
    if (node.nodeType === Node.TEXT_NODE) return !(node.textContent ?? "").replace(/\u00a0/g, " ").trim();
    if (!(node instanceof HTMLElement)) return true;
    if (node.matches("img, audio, video, iframe")) return false;
    return !(node.textContent ?? "").replace(/\u00a0/g, " ").trim()
      && !node.querySelector("img, audio, video, iframe");
  };
  while (container.firstChild && isEmpty(container.firstChild)) container.firstChild.remove();
  while (container.lastChild && isEmpty(container.lastChild)) container.lastChild.remove();
  const lastElement = container.lastElementChild;
  if (lastElement) {
    while (lastElement.lastChild instanceof HTMLBRElement) lastElement.lastChild.remove();
    if (isEmpty(lastElement)) lastElement.remove();
  } else {
    while (container.lastChild instanceof HTMLBRElement) container.lastChild.remove();
  }
  return container.innerHTML.trim();
}

function RichTextField({
  value,
  className,
  placeholder,
  ariaLabel,
  outlineId,
  editorRef,
  onChange,
  onBlur,
  onFocus,
  onKeyDown,
}: {
  value: string;
  className: string;
  placeholder: string;
  ariaLabel: string;
  outlineId?: string;
  editorRef?: (node: HTMLDivElement | null) => void;
  onChange: (value: string) => void;
  onBlur: (value: string) => void;
  onFocus?: () => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
}) {
  const fieldRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const field = fieldRef.current;
    if (field && document.activeElement !== field && field.innerHTML !== value) field.innerHTML = value;
  }, [value]);

  return (
    <div
      ref={(node) => {
        fieldRef.current = node;
        editorRef?.(node);
      }}
      className={className}
      contentEditable
      spellCheck
      lang="en-GB"
      suppressContentEditableWarning
      role="textbox"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-multiline="true"
      data-rich-editor="true"
      data-outline-id={outlineId}
      data-placeholder={placeholder}
      onInput={(event) => onChange(event.currentTarget.innerHTML)}
      onBlur={(event) => {
        const cleaned = trimRichTextEmptyEdges(event.currentTarget.innerHTML);
        if (cleaned !== event.currentTarget.innerHTML) event.currentTarget.innerHTML = cleaned;
        onBlur(cleaned);
      }}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      onPaste={(event) => {
        event.preventDefault();
        const pasted = cleanPastedText(event.clipboardData.getData("text/plain"));
        if (!pasted) return;
        document.execCommand("insertText", false, pasted);
        window.requestAnimationFrame(() => {
          const field = fieldRef.current;
          if (!field) return;
          const cleaned = trimRichTextEmptyEdges(field.innerHTML);
          if (cleaned !== field.innerHTML) field.innerHTML = cleaned;
          onChange(cleaned);
        });
      }}
    />
  );
}

function AutoGrowTextarea({ value, className, placeholder, ariaLabel, onChange, onBlur, singleParagraph = false }: {
  value: string;
  className: string;
  placeholder?: string;
  ariaLabel: string;
  onChange: (value: string) => void;
  onBlur: (value: string) => void;
  singleParagraph?: boolean;
}) {
  const fit = (field: HTMLTextAreaElement | null) => {
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
  };
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => { fit(fieldRef.current); }, [value]);
  return <textarea
    ref={(node) => { fieldRef.current = node; fit(node); }}
    rows={1}
    className={className}
    value={value}
    placeholder={placeholder}
    aria-label={ariaLabel}
    onChange={(event) => { fit(event.currentTarget); onChange(event.target.value); }}
    onBlur={(event) => onBlur(event.currentTarget.value)}
    onKeyDown={(event) => { if (singleParagraph && event.key === "Enter") event.preventDefault(); }}
  />;
}

function AppDateControl({ value, wrapperClassName = "", inputClassName = "", ariaLabel, disabled = false, required = false, min, emptyLabel = "Choose date", onChange }: {
  value: string | null;
  wrapperClassName?: string;
  inputClassName?: string;
  ariaLabel: string;
  disabled?: boolean;
  required?: boolean;
  min?: string;
  emptyLabel?: string;
  onChange: (value: string) => void;
}) {
  const controlRef = useRef<HTMLSpanElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMobile, setPickerMobile] = useState(false);
  const [pickerMonth, setPickerMonth] = useState((value || localDate()).slice(0, 7));
  const [pickerPosition, setPickerPosition] = useState({ top: 0, left: 0 });
  const [pickerAccent, setPickerAccent] = useState("#68655e");

  function positionPicker() {
    const control = controlRef.current;
    if (!control) return;
    const rect = control.getBoundingClientRect();
    const width = Math.min(292, window.innerWidth - 16);
    const estimatedHeight = 338;
    const gap = 6;
    const roomBelow = window.innerHeight - rect.bottom;
    const top = roomBelow >= estimatedHeight || roomBelow >= rect.top
      ? Math.min(window.innerHeight - estimatedHeight - 8, rect.bottom + gap)
      : Math.max(8, rect.top - estimatedHeight - gap);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    setPickerPosition({ top: Math.max(8, top), left });
  }

  function openDatePicker(event: React.PointerEvent<HTMLInputElement>) {
    if (disabled) return;
    event.preventDefault();
    const mobile = window.matchMedia("(max-width: 768px)").matches;
    setPickerMobile(mobile);
    setPickerMonth((value || localDate()).slice(0, 7));
    const accent = window.getComputedStyle(controlRef.current!).getPropertyValue("--theme-accent").trim();
    setPickerAccent(accent || "#68655e");
    if (!mobile) positionPicker();
    setPickerOpen(true);
  }

  useEffect(() => {
    if (!pickerOpen) return;
    const closeOutside = (event: Event) => {
      const target = event.target as Node;
      if (!controlRef.current?.contains(target) && !popoverRef.current?.contains(target)) setPickerOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setPickerOpen(false); };
    const closeOnViewportChange = () => setPickerOpen(false);
    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("mousedown", closeOutside, true);
    document.addEventListener("touchstart", closeOutside, true);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      document.removeEventListener("mousedown", closeOutside, true);
      document.removeEventListener("touchstart", closeOutside, true);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [pickerOpen]);

  const monthDates = calendarDates(pickerMonth);
  return <>
    <span ref={controlRef} className={`app-date-control ${wrapperClassName}`}>
      <span className="app-date-control-value" aria-hidden="true">{value ? <strong>{formatAppDate(value)}</strong> : <em>{emptyLabel}</em>}</span>
      <input
        type="date"
        className={inputClassName}
        value={value ?? ""}
        min={min}
        disabled={disabled}
        required={required}
        aria-label={ariaLabel}
        readOnly
        onPointerDown={openDatePicker}
        onClick={(event) => event.preventDefault()}
        onChange={(event) => { onChange(event.target.value); event.currentTarget.blur(); setPickerOpen(false); }}
      />
    </span>
    {pickerOpen && typeof document !== "undefined" && createPortal(pickerMobile ? <div className="app-date-mobile-backdrop" role="presentation" onPointerDown={(event) => { if (event.currentTarget === event.target) setPickerOpen(false); }}><div ref={popoverRef} className="app-date-popover mobile" role="dialog" aria-modal="true" aria-label={ariaLabel} style={{ "--theme-accent": pickerAccent } as React.CSSProperties}>
      <header><button type="button" aria-label="Previous month" onClick={() => setPickerMonth((month) => shiftMonth(month, -1))}>‹</button><strong>{monthHeading(pickerMonth)}</strong><button type="button" aria-label="Next month" onClick={() => setPickerMonth((month) => shiftMonth(month, 1))}>›</button></header>
      <div className="app-date-weekdays" aria-hidden="true">{shortWeekdaysMondayFirst.map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
      <div className="app-date-grid">{monthDates.map((date) => date.slice(0, 7) === pickerMonth ? <button
          type="button"
          className={`${date === value ? "selected" : ""} ${date === localDate() ? "today" : ""}`}
          disabled={Boolean(min && date < min)}
          onClick={() => { onChange(date); setPickerOpen(false); }}
          key={date}
        >{dayDate(date).getDate()}</button> : <span aria-hidden="true" key={date} />)}</div>
      <footer><button type="button" onClick={() => { onChange(localDate()); setPickerOpen(false); }}>Today</button>{!required && <button type="button" onClick={() => { onChange(""); setPickerOpen(false); }}>Clear</button>}</footer>
    </div></div> : <div ref={popoverRef} className="app-date-popover" role="dialog" aria-modal="false" aria-label={ariaLabel} style={{ top: pickerPosition.top, left: pickerPosition.left, "--theme-accent": pickerAccent } as React.CSSProperties}>
      <header><button type="button" aria-label="Previous month" onClick={() => setPickerMonth((month) => shiftMonth(month, -1))}>‹</button><strong>{monthHeading(pickerMonth)}</strong><button type="button" aria-label="Next month" onClick={() => setPickerMonth((month) => shiftMonth(month, 1))}>›</button></header>
      <div className="app-date-weekdays" aria-hidden="true">{shortWeekdaysMondayFirst.map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
      <div className="app-date-grid">{monthDates.map((date) => date.slice(0, 7) === pickerMonth ? <button type="button" className={`${date === value ? "selected" : ""} ${date === localDate() ? "today" : ""}`} disabled={Boolean(min && date < min)} onClick={() => { onChange(date); setPickerOpen(false); }} key={date}>{dayDate(date).getDate()}</button> : <span aria-hidden="true" key={date} />)}</div>
      <footer><button type="button" onClick={() => { onChange(localDate()); setPickerOpen(false); }}>Today</button>{!required && <button type="button" onClick={() => { onChange(""); setPickerOpen(false); }}>Clear</button>}</footer>
    </div>, document.body)}
  </>;
}

function CompactDateInput({ value, className, wrapperClassName, disabled = false, ariaLabel, onChange }: {
  value: string | null;
  className: string;
  wrapperClassName: string;
  disabled?: boolean;
  ariaLabel: string;
  onChange: (value: string) => void;
}) {
  return <AppDateControl value={value} wrapperClassName={`compact-date-control ${wrapperClassName}`} inputClassName={className} disabled={disabled} ariaLabel={ariaLabel} emptyLabel={compactLineDate(value)} onChange={onChange} />;
}

function AppTimeControl({ value, className = "", ariaLabel, onChange }: {
  value: string | null;
  className?: string;
  ariaLabel: string;
  onChange: (value: string) => void;
}) {
  const match = /^(\d{2}):(\d{2})$/.exec(value ?? "");
  const hour24 = match ? Number(match[1]) : 9;
  const selectedHour = match ? String(hour24 % 12 || 12) : "";
  const selectedMinute = match ? match[2] : "";
  const selectedPeriod = match ? (hour24 >= 12 ? "PM" : "AM") : "";

  function update(hour = selectedHour || "9", minute = selectedMinute || "00", period = selectedPeriod || "AM") {
    const hour12 = Math.max(1, Math.min(12, Number(hour) || 9));
    const nextHour = (hour12 % 12) + (period === "PM" ? 12 : 0);
    onChange(`${String(nextHour).padStart(2, "0")}:${minute}`);
  }

  return <span className={`app-time-control ${className}`} role="group" aria-label={ariaLabel}>
    <select value={selectedHour} aria-label={`${ariaLabel} hour`} onChange={(event) => event.target.value ? update(event.target.value) : onChange("")}>
      <option value="">Hour</option>{Array.from({ length: 12 }, (_, index) => <option value={String(index + 1)} key={index + 1}>{index + 1}</option>)}
    </select>
    <span aria-hidden="true">:</span>
    <select value={selectedMinute} aria-label={`${ariaLabel} minute`} onChange={(event) => event.target.value ? update(undefined, event.target.value) : onChange("")}>
      <option value="">Min</option>{Array.from({ length: 60 }, (_, minute) => <option value={String(minute).padStart(2, "0")} key={minute}>{String(minute).padStart(2, "0")}</option>)}
    </select>
    <select value={selectedPeriod} aria-label={`${ariaLabel} AM or PM`} onChange={(event) => event.target.value ? update(undefined, undefined, event.target.value) : onChange("")}>
      <option value="">AM/PM</option><option value="AM">AM</option><option value="PM">PM</option>
    </select>
  </span>;
}

function OptionalDateField({ label, value, onChange }: { label: string; value: string | null; onChange: (value: string | null) => void }) {
  const [draftDate, setDraftDate] = useState(value ?? "");
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  useEffect(() => { if (!confirmationOpen) setDraftDate(value ?? ""); }, [confirmationOpen, value]);

  function stageDate(nextDate: string) {
    if (!nextDate) return;
    if (window.matchMedia("(min-width: 761px)").matches) {
      onChange(nextDate);
      setConfirmationOpen(false);
      return;
    }
    setDraftDate(nextDate);
    setConfirmationOpen(true);
  }

  return <div className="date-fact">
    <span>{label}</span>
    {value ? <div className="date-current-row">
      <AppDateControl value={value} wrapperClassName="date-value-button page-date-desktop-control" ariaLabel={`Choose ${label.toLowerCase()}`} onChange={stageDate} />
      <AppDateControl value={value} wrapperClassName="date-value-button page-date-mobile-control" ariaLabel={`Choose ${label.toLowerCase()}`} onChange={stageDate} />
      <button type="button" className="clear-date-button" onClick={() => onChange(null)}>Clear</button>
    </div> : <><AppDateControl value={null} wrapperClassName="optional-date-button page-date-desktop-control" ariaLabel={`Choose ${label.toLowerCase()}`} emptyLabel="CHOOSE DATE" onChange={stageDate} /><AppDateControl value={null} wrapperClassName="optional-date-button page-date-mobile-control" ariaLabel={`Choose ${label.toLowerCase()}`} emptyLabel="CHOOSE DATE" onChange={stageDate} /></>}
    {confirmationOpen && typeof document !== "undefined" && createPortal(<div className="modal-backdrop date-confirmation-overlay" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setConfirmationOpen(false); }}>
      <section className="date-confirmation-card" role="dialog" aria-modal="true" aria-label={`Confirm ${label.toLowerCase()}`}>
        <span>{label}</span>
        <h2>Set this date?</h2>
        <AppDateControl value={draftDate} wrapperClassName="date-confirmation-date-control" ariaLabel={label} onChange={setDraftDate} />
        <div><button type="button" onClick={() => setConfirmationOpen(false)}>Cancel</button><button type="button" className="primary-button" disabled={!draftDate} onClick={() => { onChange(draftDate || null); setConfirmationOpen(false); }}>Set date</button></div>
      </section>
    </div>, document.body)}
  </div>;
}

function ReminderSettingsModal({ title, dateTime, repeat, endDate, closedAt, onCancel, onSave, onCloseReminder }: {
  title: string;
  dateTime: string | null;
  repeat: ReminderRepeat;
  endDate: string | null;
  closedAt: string | null;
  onCancel: () => void;
  onSave: (value: { dateTime: string; repeat: ReminderRepeat; endDate: string | null; closedAt: null }) => void;
  onCloseReminder: () => void;
}) {
  const [draftDateTime, setDraftDateTime] = useState(dateTime?.length === 10 ? `${dateTime}T09:00` : dateTime ?? `${shiftDay(localDate(), 1)}T09:00`);
  const [draftRepeat, setDraftRepeat] = useState<ReminderRepeat>(repeat ?? "none");
  const [draftEndDate, setDraftEndDate] = useState(endDate ?? "");
  const draftDate = draftDateTime.slice(0, 10);
  const draftTime = draftDateTime.slice(11, 16);
  const repeatOptions: Array<{ id: ReminderRepeat; label: string; detail: string }> = [
    { id: "none", label: "Never", detail: "One notification at the chosen time" },
    { id: "daily-until-closed", label: "Daily until closed", detail: "Keeps reminding even after the task is completed" },
    { id: "daily", label: "Daily", detail: "Stops when the task is completed" },
    { id: "weekdays", label: "Weekdays", detail: "Monday through Friday" },
    { id: "weekly", label: "Weekly", detail: "On the same weekday" },
    { id: "monthly", label: "Monthly", detail: "On the same date each month" },
  ];

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onCancel(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onCancel]);

  return createPortal(<div className="ios-reminder-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onCancel(); }}>
    <section className="ios-reminder-sheet" role="dialog" aria-modal="true" aria-label="Reminder settings">
      <header className="ios-reminder-header"><button type="button" onClick={onCancel}>Cancel</button><strong>Reminder</strong><button type="button" disabled={!draftDateTime} onClick={() => draftDateTime && onSave({ dateTime: draftDateTime, repeat: draftRepeat, endDate: draftRepeat === "none" ? null : draftEndDate || null, closedAt: null })}>Done</button></header>
      <div className="ios-reminder-scroll">
        <div className="ios-reminder-title"><span aria-hidden="true">◷</span><div><strong>{title || "Untitled reminder"}</strong><small>{closedAt ? "This reminder cycle is closed" : "Reminder details"}</small></div></div>
        <section className="ios-settings-group">
          <div className="ios-settings-date"><span><b>Date &amp; Time</b><small>Choose when the first reminder should arrive</small></span><span className="ios-reminder-desktop-datetime"><AppDateControl value={draftDate} wrapperClassName="ios-reminder-date-control" required ariaLabel="Reminder date" onChange={(date) => setDraftDateTime(`${date}T${draftTime || "09:00"}`)} /><AppTimeControl value={draftTime} className="ios-reminder-time-control" ariaLabel="Reminder time" onChange={(time) => { if (time) setDraftDateTime(`${draftDate || localDate()}T${time}`); }} /></span></div>
          <div className="ios-quick-row"><button type="button" onClick={() => setDraftDateTime(`${localDate()}T16:00`)}>Today 4:00 PM</button><button type="button" onClick={() => setDraftDateTime(`${shiftDay(localDate(), 1)}T09:00`)}>Tomorrow 9:00 AM</button></div>
        </section>
        <h3 className="ios-settings-label">Repeat</h3>
        <section className="ios-settings-group ios-repeat-list">
          {repeatOptions.map((option) => <button type="button" className={draftRepeat === option.id ? "selected" : ""} onClick={() => setDraftRepeat(option.id)} key={option.id}><span><b>{option.label}</b><small>{option.detail}</small></span><i aria-hidden="true">{draftRepeat === option.id ? "✓" : ""}</i></button>)}
        </section>
        {draftRepeat !== "none" && <><h3 className="ios-settings-label">End Repeat</h3><section className="ios-settings-group"><div className="ios-end-repeat-row"><span><b>End Repeat</b><small>{draftEndDate ? "On date" : "Never"}</small></span><AppDateControl value={draftEndDate} wrapperClassName="ios-end-date-control" min={draftDateTime.slice(0, 10)} ariaLabel="End repeat date" emptyLabel="Never" onChange={setDraftEndDate} /></div>{draftEndDate && <button type="button" className="ios-clear-end" onClick={() => setDraftEndDate("")}>Repeat indefinitely</button>}</section></>}
        {draftRepeat === "daily-until-closed" && <aside className="ios-reminder-explainer"><span>↻</span><p><strong>Completion and closure are separate.</strong> Marking the task completed records the work as done, but the daily reminder continues until you choose <b>Close reminder cycle</b>.</p></aside>}
        {dateTime && !closedAt && <section className="ios-settings-group ios-danger-group"><button type="button" onClick={onCloseReminder}>Close reminder cycle</button></section>}
      </div>
    </section>
  </div>, document.body);
}

function FormattingToolbar({ enabled, appFont, onAppFont, onTodo, onImportant }: { enabled: boolean; appFont: AppFont; onAppFont: (font: AppFont) => void; onTodo: (outlineId?: string) => void; onImportant: () => void }) {
  const activeField = useRef<HTMLElement | null>(null);
  const savedRange = useRef<Range | null>(null);
  const [hasTarget, setHasTarget] = useState(false);

  useEffect(() => {
    function rememberSelection() {
      const selection = window.getSelection();
      if (!selection?.rangeCount) return;
      const range = selection.getRangeAt(0);
      const node = range.commonAncestorContainer;
      const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
      const editor = element?.closest<HTMLElement>("[data-rich-editor='true']");
      if (!editor) return;
      activeField.current = editor;
      savedRange.current = range.cloneRange();
      setHasTarget(true);
    }
    function rememberFocus(event: FocusEvent) {
      const target = event.target;
      const editor = target instanceof Element ? target.closest<HTMLElement>("[data-rich-editor='true']") : null;
      if (editor) {
        activeField.current = editor;
        setHasTarget(true);
      }
    }
    document.addEventListener("selectionchange", rememberSelection);
    document.addEventListener("focusin", rememberFocus);
    return () => {
      document.removeEventListener("selectionchange", rememberSelection);
      document.removeEventListener("focusin", rememberFocus);
    };
  }, []);

  function restoreSelection() {
    const field = activeField.current;
    if (!field || !enabled) return false;
    field.focus();
    if (savedRange.current) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(savedRange.current);
    }
    return true;
  }

  function command(name: string, value?: string) {
    if (!restoreSelection()) return;
    document.execCommand(name, false, value);
    activeField.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }

  async function pasteText() {
    if (!restoreSelection()) return;
    try {
      const text = await navigator.clipboard.readText();
      command("insertText", text);
    } catch {
      activeField.current?.focus();
    }
  }

  const unavailable = !enabled;
  const button = (label: string, mark: React.ReactNode, action: () => void, className = "") => (
    <button
      type="button"
      className={className}
      title={label}
      aria-label={label}
      disabled={unavailable}
      onMouseDown={(event) => event.preventDefault()}
      onClick={action}
    >{mark}</button>
  );

  return (
    <section className={`formatting-ribbon ${enabled ? "enabled" : "disabled"}`} aria-label="Writing and formatting tools">
      <div className="ribbon-group clipboard-group">
        {button("Paste plain text", <><span className="paste-icon">▣</span><small>Paste</small></>, () => void pasteText(), "paste-button")}
        <div className="ribbon-stack">
          {button("Cut", <><span>✂</span><small>Cut</small></>, () => command("cut"))}
          {button("Copy", <><span>▱</span><small>Copy</small></>, () => command("copy"))}
        </div>
      </div>
      <div className="ribbon-group font-group">
        <div className="ribbon-selects">
          <select aria-label="Application and writing font" value={appFont} onChange={(event) => { const font = event.target.value as AppFont; onAppFont(font); if (enabled && hasTarget) command("fontName", font); }}>
            {appFonts.map((font) => <option key={font}>{font}</option>)}
          </select>
          <select aria-label="Font size" defaultValue="3" disabled={unavailable} onChange={(event) => command("fontSize", event.target.value)}>
            <option value="2">12</option><option value="3">14</option><option value="4">18</option><option value="5">24</option><option value="6">32</option>
          </select>
        </div>
        <div className="ribbon-button-row">
          {button("Bold", <b>B</b>, () => command("bold"))}
          {button("Italic", <i>I</i>, () => command("italic"))}
          {button("Underline", <u>U</u>, () => command("underline"))}
          {button("Strikethrough", <s>S</s>, () => command("strikeThrough"))}
          {button("Highlight", <span className="highlight-mark">ab</span>, () => command("hiliteColor", "#fff19a"))}
          <label className="color-tool" title="Text color">
            <span>A</span>
            <input type="color" aria-label="Text color" defaultValue="#302b36" disabled={unavailable} onChange={(event) => command("foreColor", event.target.value)} />
          </label>
        </div>
      </div>
      <div className="ribbon-group paragraph-group">
        <div className="ribbon-button-row">
          {button("Bulleted list", <span>•☰</span>, () => command("insertUnorderedList"))}
          {button("Numbered list", <span>1☰</span>, () => command("insertOrderedList"))}
          {button("Decrease indent", <span>←☰</span>, () => command("outdent"))}
          {button("Increase indent", <span>☰→</span>, () => command("indent"))}
        </div>
        <div className="ribbon-button-row">
          {button("Align left", <span>≡</span>, () => command("justifyLeft"))}
          {button("Align center", <span>≣</span>, () => command("justifyCenter"))}
          {button("Align right", <span>≡</span>, () => command("justifyRight"), "align-right")}
          {button("Clear formatting", <span className="clear-format">A×</span>, () => command("removeFormat"))}
        </div>
      </div>
      <div className="ribbon-group style-group">
        <select aria-label="Text style" defaultValue="p" disabled={unavailable} onChange={(event) => command("formatBlock", event.target.value)}>
          <option value="p">Body text</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option><option value="blockquote">Quote</option>
        </select>
      </div>
      <div className="ribbon-group tag-group">
        {button("To Do", <><span className="todo-tag">✓</span><small>To Do</small></>, () => onTodo(activeField.current?.dataset.outlineId), "tag-button")}
        {button("Mark page important", <><span className="important-tag">★</span><small>Important</small></>, onImportant, "tag-button")}
      </div>
      <div className="ribbon-group history-group">
        {button("Undo", <span>↶</span>, () => command("undo"))}
        {button("Redo", <span>↷</span>, () => command("redo"))}
      </div>
    </section>
  );
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function sectionTree(data: AppData, notebookId: string) {
  const nodes: SectionNode[] = [
    ...data.departments.filter((department) => department.notebookId === notebookId).map((department) => ({
      id: department.id,
      kind: "department" as const,
      name: department.name,
      parentId: department.parentId,
      departmentId: department.id,
      serialPrefix: department.serialPrefix,
      color: department.color,
      children: [],
    })),
    ...data.subsections.filter((subsection) => subsection.notebookId === notebookId).map((subsection) => ({
      id: subsection.id,
      kind: "subsection" as const,
      name: subsection.name,
      parentId: subsection.parentId ?? (subsection.departmentId === subsection.id ? null : subsection.departmentId),
      departmentId: subsection.departmentId,
      serialPrefix: subsection.serialPrefix,
      color: data.departments.find((department) => department.id === subsection.departmentId)?.color ?? "#6d4cc2",
      children: [],
    })),
  ];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const roots: SectionNode[] = [];
  for (const node of nodes) {
    const parent = node.parentId ? byId.get(node.parentId) : null;
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  }
  const sortNodes = (items: SectionNode[]) => {
    items.sort((a, b) => a.serialPrefix.localeCompare(b.serialPrefix, undefined, { numeric: true }) || a.name.localeCompare(b.name));
    items.forEach((item) => sortNodes(item.children));
  };
  sortNodes(roots);
  return roots;
}

function journalSection(data: AppData, sectionId: string) {
  return data.subsections.find((section) => section.id === sectionId)
    ?? data.departments.find((section) => section.id === sectionId);
}

function journalSectionName(data: AppData, sectionId: string) {
  return journalSection(data, sectionId)?.name ?? "Section";
}

function notebookSectionIds(data: AppData, notebookId: string) {
  return new Set([
    ...data.departments.filter((section) => section.notebookId === notebookId).map((section) => section.id),
    ...data.subsections.filter((section) => section.notebookId === notebookId).map((section) => section.id),
  ]);
}

function pageDepth(page: Page, pages: Page[]) {
  let depth = 0;
  let current = page;
  const visited = new Set([page.id]);
  while (current.parentId) {
    const parent = pages.find((item) => item.id === current.parentId);
    if (!parent || visited.has(parent.id)) break;
    visited.add(parent.id);
    current = parent;
    depth += 1;
  }
  return depth;
}

function pageHierarchyNames(data: AppData, page: Page) {
  const sectionNames: string[] = [];
  let section = journalSection(data, page.subsectionId);
  const visitedSections = new Set<string>();
  while (section && !visitedSections.has(section.id)) {
    visitedSections.add(section.id);
    if (section.name) sectionNames.unshift(section.name);
    section = section.parentId ? journalSection(data, section.parentId) : undefined;
  }
  const parentPageNames: string[] = [];
  let current: Page | undefined = page.parentId ? data.pages.find((item) => item.id === page.parentId) : undefined;
  const visitedPages = new Set<string>();
  while (current && !visitedPages.has(current.id)) {
    visitedPages.add(current.id);
    parentPageNames.unshift(current.title);
    const parentId: string | null = current.parentId;
    current = parentId ? data.pages.find((item) => item.id === parentId) : undefined;
  }
  return [...sectionNames, ...parentPageNames].filter((name, index, values) => index === 0 || name !== values[index - 1]).join(" › ");
}

function Icon({ name }: { name: string }) {
  const marks: Record<string, string> = {
    dashboard: "▦",
    journal: "▤",
    tasks: "✓",
    meetings: "◫",
    "my-day": "□",
    people: "◎",
    search: "⌕",
    plus: "+",
    chevron: "›",
    calendar: "□",
    link: "↗",
    warning: "!",
    dots: "⋮",
  };
  return <span className="icon" aria-hidden="true">{marks[name] ?? "•"}</span>;
}

function LiveClock({ className = "app-live-clock" }: { className?: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const time = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true }).format(now);
  return <div className={className}><small>LOCAL TIME</small><time dateTime={now.toISOString()}>{time}</time></div>;
}

function attachmentSize(value: number | null) {
  if (!value) return "";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentList<T extends AttachmentBase>({ attachments, urlFor, onRename, onDelete, compact = false }: {
  attachments: T[];
  urlFor: (attachment: T) => string;
  onRename: (attachment: T) => Promise<void>;
  onDelete: (attachment: T) => Promise<void>;
  compact?: boolean;
}) {
  if (!attachments.length) return null;
  return <div className={`inline-attachment-list ${compact ? "compact" : ""}`}>
    {attachments.map((attachment) => <div className={`inline-attachment-chip ${attachment.kind}`} key={attachment.id}>
      {attachment.kind === "photo" ? <a href={urlFor(attachment)} target="_blank" rel="noreferrer"><span className="inline-media-mark">▧</span><strong>{attachment.title}</strong></a>
        : attachment.kind === "audio" ? <><span className="inline-media-mark audio">●</span><div><strong>{attachment.title}</strong><audio controls preload="none" src={urlFor(attachment)}><track kind="captions" src="data:text/vtt,WEBVTT" srcLang="en" label="No transcript available" /></audio></div></>
        : <a href={urlFor(attachment)} target="_blank" rel="noreferrer"><span className="inline-media-mark">▤</span><span><strong>{attachment.title}</strong><small>{attachmentSize(attachment.sizeBytes) || "Open attachment"}</small></span></a>}
      <span className="inline-attachment-actions"><button type="button" title="Rename" aria-label={`Rename ${attachment.title}`} onClick={() => void onRename(attachment)}>✎</button><button type="button" title="Remove" aria-label={`Remove ${attachment.title}`} onClick={() => void onDelete(attachment)}>×</button></span>
    </div>)}
  </div>;
}

type InlineMenuAction = { icon: string; label: string; detail: string; active?: boolean; disabled?: boolean; onSelect: () => void };

function anchoredInlineMenuPosition(trigger: DOMRect, height: number): React.CSSProperties {
  const edge = 8;
  const gap = 6;
  const width = Math.min(260, window.innerWidth - edge * 2);
  const measuredHeight = Math.min(height, window.innerHeight - edge * 2);
  const left = Math.min(Math.max(edge, trigger.right - width), window.innerWidth - width - edge);
  const below = trigger.bottom + gap;
  const top = below + measuredHeight <= window.innerHeight - edge
    ? below
    : Math.max(edge, trigger.top - gap - measuredHeight);
  return { position: "fixed", top, left, width, maxHeight: window.innerHeight - edge * 2, visibility: "visible" };
}

function anchoredMobileMenuPosition(trigger: DOMRect, height: number): React.CSSProperties {
  const edge = 8;
  const gap = 6;
  const viewport = window.visualViewport;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportLeft = viewport?.offsetLeft ?? 0;
  const viewportWidth = viewport?.width ?? window.innerWidth;
  const viewportHeight = viewport?.height ?? window.innerHeight;
  const viewportRight = viewportLeft + viewportWidth;
  const viewportBottom = viewportTop + viewportHeight;
  const width = Math.min(260, viewportWidth - edge * 2);
  const measuredHeight = Math.min(height, viewportHeight - edge * 2);
  const left = Math.min(Math.max(viewportLeft + edge, trigger.right - width), viewportRight - width - edge);
  const below = trigger.bottom + gap;
  const top = below + measuredHeight <= viewportBottom - edge
    ? below
    : Math.max(viewportTop + edge, trigger.top - gap - measuredHeight);
  return { position: "fixed", top, left, width, maxHeight: viewportHeight - edge * 2, visibility: "visible" };
}

function anchoredMenuPosition(trigger: DOMRect, height: number): React.CSSProperties {
  return window.matchMedia("(max-width: 768px)").matches
    ? anchoredMobileMenuPosition(trigger, height)
    : anchoredInlineMenuPosition(trigger, height);
}

function InlineAttachmentTools({ onUpload, compact = false, menuActions = [], actionsOnly = false, menuLabel }: {
  onUpload: (kind: "photo" | "document" | "audio", file: File) => Promise<void>;
  compact?: boolean;
  menuActions?: InlineMenuAction[];
  actionsOnly?: boolean;
  menuLabel?: string;
}) {
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const documentInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<React.CSSProperties>({ position: "fixed", visibility: "hidden" });
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useLayoutEffect(() => {
    if (!menuOpen) return;

    const body = document.body;
    const root = document.documentElement;
    const scrollY = window.scrollY;
    const previousBody = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    };
    const previousRootOverflow = root.style.overflow;

    const positionMenu = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      const rect = trigger.getBoundingClientRect();
      setMenuPosition(anchoredMenuPosition(rect, menu.scrollHeight || 280));
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    positionMenu();
    body.classList.add("inline-menu-open");
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    root.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(positionMenu);
    const mobile = window.matchMedia("(max-width: 768px)").matches;
    window.addEventListener("resize", positionMenu);
    window.addEventListener("orientationchange", positionMenu);
    if (mobile) {
      window.visualViewport?.addEventListener("resize", positionMenu);
      window.visualViewport?.addEventListener("scroll", positionMenu);
    }
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("orientationchange", positionMenu);
      if (mobile) {
        window.visualViewport?.removeEventListener("resize", positionMenu);
        window.visualViewport?.removeEventListener("scroll", positionMenu);
      }
      document.removeEventListener("keydown", closeOnEscape);
      body.classList.remove("inline-menu-open");
      body.style.overflow = previousBody.overflow;
      body.style.position = previousBody.position;
      body.style.top = previousBody.top;
      body.style.width = previousBody.width;
      root.style.overflow = previousRootOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [menuOpen]);

  async function fromInput(kind: "photo" | "document", input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = "";
    setMenuOpen(false);
    if (file) await onUpload(kind, file);
  }

  async function toggleRecording() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
      setRecording(false);
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("Audio recording is not supported in this browser.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorderStreamRef.current = stream;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || chunksRef.current[0]?.type || "audio/webm";
        const extension = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const stamp = new Date();
        const name = `Audio note ${stamp.toLocaleDateString("en-CA")} ${stamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }).replace(":", "-")}.${extension}`;
        stream.getTracks().forEach((track) => track.stop());
        recorderStreamRef.current = null;
        recorderRef.current = null;
        if (blob.size) void onUpload("audio", new File([blob], name, { type: mimeType }));
      };
      recorder.start();
      setRecording(true);
      setSeconds(0);
      const started = Date.now();
      timerRef.current = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    } catch (error) {
      recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
      window.alert(error instanceof Error ? error.message : "The audio note could not be started.");
    }
  }

  const triggerLabel = menuLabel ?? (compact ? "Line options" : "Add attachment");

  return <div className={`inline-media-tools ${compact ? "compact" : ""} ${actionsOnly ? "actions-only" : ""}`}>
    <div className="inline-attach-wrap">
      <button ref={triggerRef} type="button" className={`inline-media-button ${recording ? "recording" : ""}`} title={triggerLabel} aria-label={triggerLabel} aria-haspopup="menu" aria-expanded={menuOpen} onClick={(event) => {
        if (menuOpen) {
          setMenuOpen(false);
          return;
        }
        const estimatedRows = menuActions.length + (actionsOnly ? 0 : 3);
        if (window.matchMedia("(max-width: 768px)").matches) {
          setMenuPosition(anchoredMobileMenuPosition(event.currentTarget.getBoundingClientRect(), Math.max(72, estimatedRows * 54 + 12)));
        } else {
          setMenuPosition(anchoredInlineMenuPosition(event.currentTarget.getBoundingClientRect(), Math.max(72, estimatedRows * 54 + 12)));
        }
        setMenuOpen(true);
      }}><span>{compact ? recording ? "●" : "⋮" : "📎"}</span>{!compact && "Attachment"}</button>
      {menuOpen && typeof document !== "undefined" && createPortal(<>
        <button type="button" className="inline-menu-backdrop" aria-label="Close line menu" onClick={() => setMenuOpen(false)} />
        <div ref={menuRef} className="inline-media-menu" role="menu" style={menuPosition}>
          {menuActions.map((action) => <button type="button" role="menuitem" disabled={action.disabled} className={action.active ? "active" : ""} key={action.label} onClick={() => { setMenuOpen(false); action.onSelect(); }}><span>{action.icon}</span><div><strong>{action.label}</strong><small>{action.detail}</small></div></button>)}
          {!actionsOnly && <>
            {menuActions.length > 0 && <hr />}
            <button type="button" role="menuitem" onClick={() => photoInputRef.current?.click()}><span>▧</span><div><strong>Attach photo</strong><small>Add an image to this line</small></div></button>
            <button type="button" role="menuitem" onClick={() => documentInputRef.current?.click()}><span>📎</span><div><strong>Attach document</strong><small>PDF, Word, Excel or another file</small></div></button>
            {compact && <button type="button" role="menuitem" className={recording ? "active" : ""} onClick={() => { setMenuOpen(false); void toggleRecording(); }}><span>●</span><div><strong>{recording ? "Stop audio note" : "Record audio note"}</strong><small>{recording ? `Recording ${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}` : "Record directly against this line"}</small></div></button>}
          </>}
        </div>
      </>, document.body)}
      <input ref={photoInputRef} className="hidden-file-input" type="file" accept="image/*" onChange={(event) => void fromInput("photo", event.currentTarget)} />
      <input ref={documentInputRef} className="hidden-file-input" type="file" onChange={(event) => void fromInput("document", event.currentTarget)} />
    </div>
    {!compact && <button type="button" className={`inline-media-button audio ${recording ? "recording" : ""}`} title={recording ? "Stop audio note" : "Record audio note"} aria-label={recording ? "Stop audio note" : "Record audio note"} onClick={() => void toggleRecording()}><span>●</span>{recording ? `Stop ${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}` : "Audio note"}</button>}
  </div>;
}

function PageCard({ page, selected, depth, hierarchy, reminderDate, dropActive, hasChildren, collapsed, onToggle, onClick, onMenu, onDragStart, onDragEnd, onDragOver, onDrop }: {
  page: Page;
  selected: boolean;
  depth: number;
  hierarchy?: string;
  reminderDate?: string;
  dropActive: boolean;
  hasChildren: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onClick: () => void;
  onMenu: (event: React.MouseEvent) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className={`page-card-wrap ${depth ? "subpage" : "main-page"} ${dropActive ? "drop-target" : ""}`}
      style={{ "--page-depth": Math.min(depth, 6) } as React.CSSProperties}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {hasChildren && <button className={`page-collapse-button ${collapsed ? "collapsed" : ""}`} aria-label={collapsed ? `Expand subpages of ${page.title}` : `Collapse subpages of ${page.title}`} onClick={(event) => { event.stopPropagation(); onToggle(); }}>›</button>}
      <button className={`page-card ${selected ? "selected" : ""} ${hierarchy ? "has-hierarchy" : ""}`} onClick={onClick}>
        {hierarchy ? <span className="page-card-hierarchy">{hierarchy}</span> : <div className="page-card-top"><span className="serial">{page.serial}</span></div>}
        <strong>{page.title}</strong>
        {reminderDate && <span className={`page-card-reminder ${reminderIsDue(reminderDate) ? "due" : ""}`}>◷ Reminder {friendlyReminderLabel(reminderDate)}</span>}
        <span className="page-card-edited">{lastEditedLabel(page.updatedAt)}</span>
        <div className="page-card-bottom">
          <span className={`status-text ${statusTone(page.status)}`}>{page.status}</span>
          <span className="page-card-due">
            {isOverdue(page) ? <span className="overdue-word">Overdue</span> : <span className={`priority-dot ${priorityTone(page.priority)}`} />}
            <span>{friendlyDate(page.dueDate)}</span>
          </span>
        </div>
      </button>
      <button className="item-menu-button page-menu-button" aria-label={`Page settings for ${page.title}`} onClick={onMenu}><Icon name="dots" /></button>
    </div>
  );
}

type PageEditorProps = {
  page: Page;
  data: AppData;
  compact?: boolean;
  onPageChange: (next: Page, save?: boolean) => void;
  onOutlineChange: (pageId: string, next: OutlineItem[], save?: boolean) => void;
  onUploadAttachment?: (pageId: string, kind: "photo" | "document" | "audio", file: File, outlineId?: string) => Promise<void>;
  onAddLink?: (pageId: string, title: string, url: string, repository: string) => Promise<void>;
  onRenameAttachment?: (attachment: PageAttachment) => Promise<void>;
  onDeleteAttachment?: (attachment: PageAttachment) => Promise<void>;
  onOpenSource: (page: Page) => void;
  onOpenPerson: (personId: string) => void;
  onManagePeople: () => void;
  onReminderPermission?: () => Promise<void>;
  onLearnDictionaryWord?: (word: string) => Promise<void>;
  onRemoveDictionaryWord?: (word: string) => Promise<void>;
};

function PageEditor({ page, data, compact = false, onPageChange, onOutlineChange, onUploadAttachment, onAddLink, onRenameAttachment, onDeleteAttachment, onOpenSource, onOpenPerson, onManagePeople, onReminderPermission, onLearnDictionaryWord, onRemoveDictionaryWord }: PageEditorProps) {
  const subsection = data.subsections.find((item) => item.id === page.subsectionId);
  const directDepartment = data.departments.find((item) => item.id === page.subsectionId);
  const department = directDepartment ?? data.departments.find((item) => item.id === subsection?.departmentId);
  const owner = data.people.find((item) => item.id === page.ownerId);
  const items = data.outlineItems.filter((item) => item.pageId === page.id).sort((a, b) => a.position - b.position);
  const progressItems = items.filter((item) => item.isTask && !richTextIsEmpty(item.text));
  const completedProgressItems = progressItems.filter((item) => item.completed).length;
  const progressPercent = progressItems.length ? Math.round((completedProgressItems / progressItems.length) * 100) : 0;
  const attachments = data.attachments.filter((item) => item.pageId === page.id);
  const pageAttachments = attachments.filter((item) => !item.outlineId);
  const serials = computeOutlineSerials(page.serial, items);
  const inputRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const documentInputRef = useRef<HTMLInputElement | null>(null);
  const pageAttachmentTriggerRef = useRef<HTMLButtonElement | null>(null);
  const pageAttachmentMenuRef = useRef<HTMLDivElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const editorLinterRef = useRef<Promise<PrivateEditorLinter> | null>(null);
  const recorderStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [pageAttachmentMenuPosition, setPageAttachmentMenuPosition] = useState<React.CSSProperties>({ position: "fixed", visibility: "hidden" });
  const [linkFormOpen, setLinkFormOpen] = useState(false);
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkRepository, setLinkRepository] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [pageReminderOpen, setPageReminderOpen] = useState(false);
  const [supportingPickerOpen, setSupportingPickerOpen] = useState(false);
  const [editorPanelOpen, setEditorPanelOpen] = useState(false);
  const [editorPanelTab, setEditorPanelTab] = useState<"review" | "dictionary">("review");
  const [editorScope, setEditorScope] = useState<"page" | "line">("page");
  const [editorIssues, setEditorIssues] = useState<EditorIssue[]>([]);
  const [editorChecking, setEditorChecking] = useState(false);
  const [editorChecked, setEditorChecked] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [activeOutlineId, setActiveOutlineId] = useState("");
  const [ignoredEditorWords, setIgnoredEditorWords] = useState<Set<string>>(new Set());
  const [newDictionaryWord, setNewDictionaryWord] = useState("");

  useEffect(() => () => {
    if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, [page.id]);

  useEffect(() => () => {
    const pendingLinter = editorLinterRef.current;
    editorLinterRef.current = null;
    if (pendingLinter) void pendingLinter.then((linter) => linter.dispose()).catch(() => {});
  }, [page.id]);

  useEffect(() => {
    if (!attachmentMenuOpen) return;
    const closeAttachmentMenuOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!pageAttachmentTriggerRef.current?.contains(target) && !pageAttachmentMenuRef.current?.contains(target)) setAttachmentMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeAttachmentMenuOutside, true);
    return () => document.removeEventListener("pointerdown", closeAttachmentMenuOutside, true);
  }, [attachmentMenuOpen]);

  useEffect(() => {
    setEditorIssues([]);
    setEditorChecked(false);
    setEditorError("");
    setActiveOutlineId("");
  }, [page.id]);

  useEffect(() => {
    if (!supportingPickerOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
    };
  }, [supportingPickerOpen]);

  useLayoutEffect(() => {
    if (!attachmentMenuOpen || !window.matchMedia("(max-width: 768px)").matches) return;
    const body = document.body;
    const root = document.documentElement;
    const scrollY = window.scrollY;
    const previousBody = { overflow: body.style.overflow, position: body.style.position, top: body.style.top, width: body.style.width };
    const previousRootOverflow = root.style.overflow;

    const positionMenu = () => {
      const trigger = pageAttachmentTriggerRef.current;
      const menu = pageAttachmentMenuRef.current;
      if (!trigger || !menu) return;
      setPageAttachmentMenuPosition(anchoredMobileMenuPosition(trigger.getBoundingClientRect(), menu.scrollHeight || 180));
    };

    positionMenu();
    body.classList.add("inline-menu-open");
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    root.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(positionMenu);
    window.addEventListener("resize", positionMenu);
    window.addEventListener("orientationchange", positionMenu);
    window.visualViewport?.addEventListener("resize", positionMenu);
    window.visualViewport?.addEventListener("scroll", positionMenu);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("orientationchange", positionMenu);
      window.visualViewport?.removeEventListener("resize", positionMenu);
      window.visualViewport?.removeEventListener("scroll", positionMenu);
      body.classList.remove("inline-menu-open");
      body.style.overflow = previousBody.overflow;
      body.style.position = previousBody.position;
      body.style.top = previousBody.top;
      body.style.width = previousBody.width;
      root.style.overflow = previousRootOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [attachmentMenuOpen]);

  useEffect(() => {
    if (!editorPanelOpen || !window.matchMedia("(max-width: 768px)").matches) return;
    const editorSurface = document.querySelector<HTMLElement>('[data-nav-scroll="journal-page"]');
    if (!editorSurface) return;
    const previousOverflow = editorSurface.style.overflow;
    const previousOverscroll = editorSurface.style.overscrollBehavior;
    editorSurface.style.overflow = "hidden";
    editorSurface.style.overscrollBehavior = "none";
    return () => {
      editorSurface.style.overflow = previousOverflow;
      editorSurface.style.overscrollBehavior = previousOverscroll;
    };
  }, [editorPanelOpen]);

  function attachmentUrl(attachment: PageAttachment) {
    return `/api/attachments?id=${encodeURIComponent(attachment.id)}`;
  }

  function attachmentSize(value: number | null) {
    if (!value) return "";
    if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function uploadFromInput(kind: "photo" | "document", input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = "";
    setAttachmentMenuOpen(false);
    if (file && onUploadAttachment) await onUploadAttachment(page.id, kind, file);
  }

  async function submitLink(event: React.FormEvent) {
    event.preventDefault();
    if (!onAddLink) return;
    try {
      await onAddLink(page.id, linkTitle, linkUrl, linkRepository);
    } catch {
      return;
    }
    setLinkTitle("");
    setLinkUrl("");
    setLinkRepository("");
    setLinkFormOpen(false);
  }

  async function toggleAudioRecording() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
      setRecording(false);
      if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
      return;
    }
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("Audio recording is not supported in this browser.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorderStreamRef.current = stream;
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) audioChunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || audioChunksRef.current[0]?.type || "audio/webm";
        const extension = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const timestamp = new Date();
        const name = `Audio note ${timestamp.toLocaleDateString("en-CA")} ${timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }).replace(":", "-")}.${extension}`;
        stream.getTracks().forEach((track) => track.stop());
        recorderStreamRef.current = null;
        recorderRef.current = null;
        if (blob.size && onUploadAttachment) void onUploadAttachment(page.id, "audio", new File([blob], name, { type: mimeType }));
      };
      recorder.start();
      setRecording(true);
      setRecordingSeconds(0);
      const startedAt = Date.now();
      recordingTimerRef.current = window.setInterval(() => setRecordingSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    } catch (error) {
      recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
      window.alert(error instanceof Error ? error.message : "The audio note could not be started.");
    }
  }

  function replaceItem(itemId: string, changes: Partial<OutlineItem>, save = false) {
    const next = items.map((item) => item.id === itemId ? { ...item, ...changes } : item);
    onOutlineChange(page.id, next, save);
  }

  function plainOutlineText(item: OutlineItem) {
    const editor = inputRefs.current[item.id];
    if (editor) return editor.textContent ?? "";
    const temporary = document.createElement("div");
    temporary.innerHTML = item.text;
    return temporary.textContent ?? "";
  }

  async function runEditorCheck(scope = editorScope) {
    setEditorPanelOpen(true);
    setEditorPanelTab("review");
    setEditorChecking(true);
    setEditorError("");
    try {
      editorLinterRef.current ??= createPrivateEditorLinter();
      const linter = await editorLinterRef.current;
      await linter.clearWords();
      if (data.editorDictionary.length) await linter.importWords(data.editorDictionary);
      const targetItems = scope === "line"
        ? items.filter((item) => item.id === activeOutlineId)
        : items;
      if (scope === "line" && !targetItems.length) {
        setEditorIssues([]);
        setEditorChecked(true);
        setEditorError("Click inside an update line, then choose Check selected line.");
        return;
      }
      const targets = [
        ...(scope === "page" ? [{ id: "page-title", label: "Page title", text: page.title }] : []),
        ...targetItems.map((item) => ({ id: item.id, label: serials[items.findIndex((entry) => entry.id === item.id)] ?? "Update line", text: plainOutlineText(item) })),
      ].filter((target) => target.text.trim());
      const checked = await Promise.all(targets.map(async (target) => {
        const lints = await linter.lint(target.text, { language: "plaintext" });
        return lints.map((lint) => {
          const span = lint.span();
          const suggestions = lint.suggestions();
          const start = unicodeOffsetToUtf16(target.text, span.start);
          const end = unicodeOffsetToUtf16(target.text, span.end);
          span.free();
          const problem = target.text.slice(start, end) || lint.get_problem_text();
          const issue: EditorIssue = {
            id: `${target.id}:${start}:${end}:${lint.message()}:${problem}`,
            targetId: target.id,
            targetLabel: target.label,
            sourceText: target.text,
            start,
            end,
            problem,
            message: lint.message(),
            kind: lint.lint_kind_pretty() || lint.lint_kind(),
            suggestions: suggestions.map((suggestion) => suggestion.get_replacement_text()).filter((value, index, list) => list.indexOf(value) === index).slice(0, 5),
          };
          suggestions.forEach((suggestion) => suggestion.free());
          lint.free();
          return issue;
        });
      }));
      setEditorIssues(checked.flat().filter((issue) => !ignoredEditorWords.has(issue.problem.toLocaleLowerCase("en-GB"))));
      setEditorChecked(true);
    } catch (error) {
      setEditorIssues([]);
      setEditorChecked(true);
      setEditorError(error instanceof Error ? error.message : "The private editor could not check this page.");
    } finally {
      setEditorChecking(false);
    }
  }

  function focusEditorIssue(issue: EditorIssue) {
    const target = issue.targetId === "page-title"
      ? document.querySelector<HTMLTextAreaElement>(`.page-editor .page-title-input`)
      : inputRefs.current[issue.targetId];
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => target?.focus(), 220);
  }

  function applyEditorSuggestion(issue: EditorIssue, replacement: string) {
    if (issue.targetId === "page-title") {
      if (page.title !== issue.sourceText) {
        void runEditorCheck();
        return;
      }
      onPageChange({ ...page, title: `${page.title.slice(0, issue.start)}${replacement}${page.title.slice(issue.end)}` }, true);
    } else {
      const editor = inputRefs.current[issue.targetId];
      if (!editor || (editor.textContent ?? "") !== issue.sourceText) {
        void runEditorCheck();
        return;
      }
      const html = replaceEditableTextRange(editor, issue.start, issue.end, replacement);
      if (html === null) {
        void runEditorCheck();
        return;
      }
      replaceItem(issue.targetId, { text: html }, true);
    }
    setEditorIssues((current) => current.filter((entry) => entry.id !== issue.id));
  }

  function applyEditorSuggestionEverywhere(issue: EditorIssue, replacement: string) {
    const matching = editorIssues.filter((entry) => entry.problem.toLocaleLowerCase("en-GB") === issue.problem.toLocaleLowerCase("en-GB"));
    let nextTitle = page.title;
    const changedOutline = new Map<string, string>();
    const byTarget = new Map<string, EditorIssue[]>();
    for (const entry of matching) byTarget.set(entry.targetId, [...(byTarget.get(entry.targetId) ?? []), entry]);
    for (const [targetId, targetIssues] of byTarget) {
      const sorted = [...targetIssues].sort((left, right) => right.start - left.start);
      if (targetId === "page-title") {
        if (nextTitle !== sorted[0].sourceText) continue;
        for (const entry of sorted) nextTitle = `${nextTitle.slice(0, entry.start)}${replacement}${nextTitle.slice(entry.end)}`;
      } else {
        const editor = inputRefs.current[targetId];
        if (!editor || (editor.textContent ?? "") !== sorted[0].sourceText) continue;
        for (const entry of sorted) replaceEditableTextRange(editor, entry.start, entry.end, replacement);
        changedOutline.set(targetId, editor.innerHTML);
      }
    }
    if (nextTitle !== page.title) onPageChange({ ...page, title: nextTitle }, true);
    if (changedOutline.size) onOutlineChange(page.id, items.map((item) => changedOutline.has(item.id) ? { ...item, text: changedOutline.get(item.id) as string } : item), true);
    setEditorIssues((current) => current.filter((entry) => entry.problem.toLocaleLowerCase("en-GB") !== issue.problem.toLocaleLowerCase("en-GB")));
  }

  async function learnEditorWord(word: string) {
    const clean = word.trim();
    if (!clean || !onLearnDictionaryWord) return;
    try {
      setEditorError("");
      await onLearnDictionaryWord(clean);
      setEditorIssues((current) => current.filter((entry) => entry.problem.toLocaleLowerCase("en-GB") !== clean.toLocaleLowerCase("en-GB")));
      setNewDictionaryWord("");
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "The word could not be learned.");
    }
  }

  function handleOutlineKey(event: React.KeyboardEvent<HTMLDivElement>, item: OutlineItem, index: number) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Tab") {
      event.preventDefault();
      document.execCommand("insertText", false, "\t");
      return;
    }
    if ((event.metaKey || event.ctrlKey) && (event.key === "]" || event.key === "[")) {
      event.preventDefault();
      const priorLevel = index === 0 ? 0 : items[index - 1].level;
      const nextLevel = event.key === "[" ? Math.max(0, item.level - 1) : Math.min(priorLevel + 1, item.level + 1);
      replaceItem(item.id, { level: nextLevel }, true);
      return;
    }
    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      document.execCommand("insertLineBreak", false);
      replaceItem(item.id, { text: event.currentTarget.innerHTML });
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const newItem: OutlineItem = {
        id: `outline-${crypto.randomUUID()}`,
        pageId: page.id,
        level: item.level,
        position: index + 1,
        text: "",
        isTask: false,
        completed: false,
        entryDate: localDate(),
        reminderDate: null,
        reminderRepeat: "none",
        reminderEndDate: null,
        reminderClosedAt: null,
      };
      const next = [...items.slice(0, index + 1), newItem, ...items.slice(index + 1)].map((entry, position) => ({ ...entry, position }));
      onOutlineChange(page.id, next, true);
      window.setTimeout(() => inputRefs.current[newItem.id]?.focus(), 30);
      return;
    }
    if (event.key === "Backspace" && richTextIsEmpty(item.text) && items.length > 1) {
      event.preventDefault();
      const next = items.filter((entry) => entry.id !== item.id).map((entry, position) => ({ ...entry, position }));
      onOutlineChange(page.id, next, true);
      const previous = items[index - 1];
      window.setTimeout(() => previous && inputRefs.current[previous.id]?.focus(), 30);
    }
  }

  function renderPageAttachmentMenu(mobile = false) {
    return <div ref={pageAttachmentMenuRef} className={`attachment-menu ${mobile ? "mobile-anchored-attachment-menu" : ""}`} style={mobile ? pageAttachmentMenuPosition : undefined}>
      <button onClick={() => photoInputRef.current?.click()}><span>▧</span><div><strong>Attach photo</strong><small>Image from your computer</small></div></button>
      <button onClick={() => documentInputRef.current?.click()}><span>📎</span><div><strong>Attach document</strong><small>PDF, Word, Excel or another file</small></div></button>
      <button onClick={() => { setAttachmentMenuOpen(false); setLinkFormOpen(true); }}><span>↗</span><div><strong>Attach link</strong><small>Record its repository or location</small></div></button>
    </div>;
  }

  return (
    <article className={`page-editor ${compact ? "compact" : ""}`} data-nav-scroll="journal-page">
      <div className="page-frozen-pane">
      <div className="editor-topline">
        <div className="breadcrumbs">
          <span>{department?.name ?? "Department"}</span>{subsection && <><Icon name="chevron" /><span>{subsection.name}</span></>}<Icon name="chevron" /><span>{page.serial}</span>
        </div>
        <div className="editor-top-actions"><span className="last-edited"><span aria-hidden="true">◷</span>{lastEditedLabel(page.updatedAt, true)}</span><button type="button" className="print-page-button" onClick={() => window.print()}><span aria-hidden="true">▤</span>Print page</button></div>
      </div>

      <div className="page-heading-row">
        <div className="title-field-wrap">
          <span className="page-serial-label">{page.serial}</span>
          <AutoGrowTextarea
            className="page-title-input"
            value={page.title}
            ariaLabel="Page title"
            singleParagraph
            onChange={(title) => onPageChange({ ...page, title })}
            onBlur={(title) => onPageChange({ ...page, title }, true)}
          />
        </div>
        <div className="heading-controls">
          <label className={`select-box ${statusTone(page.status)}`}>
            <span>Status</span>
            <select value={page.status} onChange={(event) => {
              const status = event.target.value;
              onPageChange({ ...page, status }, true);
            }}>
              <option>Not Started</option><option>In Progress</option><option>Waiting</option><option>Requires Attention</option><option>Completed</option>
            </select>
          </label>
          <label className={`select-box ${priorityTone(page.priority)}`}>
            <span>Urgency / Priority</span>
            <select value={page.priority} onChange={(event) => onPageChange({ ...page, priority: event.target.value }, true)}>
              <option>High</option><option>Medium</option><option>Low</option>
            </select>
          </label>
        </div>
      </div>
      <header className="print-page-heading"><small>{page.serial} · {department?.name ?? "Department"}{subsection ? ` / ${subsection.name}` : ""}</small><h1>{page.title}</h1></header>

      <div className="task-facts">
        <OptionalDateField label="Start date" value={page.startDate} onChange={(startDate) => onPageChange({ ...page, startDate }, true)} />
        <OptionalDateField label="Due date" value={page.dueDate} onChange={(dueDate) => onPageChange({ ...page, dueDate }, true)} />
        <OptionalDateField label="Completion date" value={page.completedDate} onChange={(completedDate) => onPageChange({ ...page, completedDate }, true)} />
        <label className="owner-fact">
          <span>Owner</span>
          <div className="fact-select-control">
            <select value={page.ownerId ?? ""} onChange={(event) => onPageChange({ ...page, ownerId: event.target.value || null }, true)}>
              <option value="">Unassigned</option>
              {data.people.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}
            </select>
            <i className="fact-select-chevron" aria-hidden="true" />
          </div>
          <button type="button" className="manage-team-link" onClick={onManagePeople}>Manage team</button>
        </label>
        <div className="fact-block supporting-fact">
          <span>Team members</span>
          <button type="button" className="supporting-picker-button" onClick={() => setSupportingPickerOpen(true)}>
            <span className="avatar-row">
              {page.supportingIds.length ? page.supportingIds.map((personId) => {
                const person = data.people.find((entry) => entry.id === personId);
                return person ? <i title={person.name} className="mini-avatar" key={person.id}>{initials(person.name)}</i> : null;
              }) : <><em className="supporting-none-desktop">None</em><em className="supporting-unassigned-mobile">Unassigned</em></>}
            </span>
            <b className="supporting-action-desktop">▾</b><i className="fact-select-chevron supporting-action-mobile" aria-hidden="true" />
          </button>
        </div>
        <div className="fact-block source-fact">
          <span>Task source</span>
          <div className="source-editor-row">
            <select value={page.sourceType} onChange={(event) => {
              const sourceType = event.target.value;
              onPageChange({ ...page, sourceType, sourceId: null, sourceAgenda: null, sourceLabel: sourceType === "Direct" ? "Journal entry" : "" }, true);
            }}>
              <option>Direct</option><option>Meeting</option><option>Inspection</option><option>Phone</option><option>Email</option><option>Other</option>
            </select>
            {page.sourceType === "Meeting" ? <select value={page.sourceId ?? ""} onChange={(event) => {
              const meeting = data.meetings.find((item) => item.id === event.target.value);
              onPageChange({ ...page, sourceId: meeting?.id ?? null, sourceLabel: meeting ? `${meeting.number} · ${meeting.purpose}` : "", sourceAgenda: null }, true);
            }}><option value="">Choose the source meeting…</option>{data.meetings.map((meeting) => <option value={meeting.id} key={meeting.id}>{meeting.number} · {meeting.date} · {meeting.purpose}</option>)}</select>
              : <AutoGrowTextarea className="source-detail-field" value={page.sourceLabel ?? ""} placeholder="Source detail" ariaLabel="Task source detail" onChange={(sourceLabel) => onPageChange({ ...page, sourceLabel })} onBlur={(sourceLabel) => onPageChange({ ...page, sourceLabel }, true)} />}
          </div>
          {page.sourceType === "Meeting" && page.sourceId && <button className="source-link" onClick={() => onOpenSource(page)}><Icon name="link" />Open original meeting</button>}
        </div>
      </div>

      <div className="page-progress" aria-label={`Task progress ${progressPercent}%`}>
        <div><span>Task progress</span><small>{progressItems.length ? `${completedProgressItems} of ${progressItems.length} task lines completed` : "No task lines selected yet"}</small></div>
        <div className="page-progress-track"><i style={{ width: `${progressPercent}%` }} /></div><strong>{progressPercent}%</strong>
      </div>

      <section className="page-print-summary" aria-hidden="true">
        <div><span>Owner</span><strong>{owner?.name ?? "Unassigned"}</strong></div>
        <div><span>Team members</span><strong>{page.supportingIds.map((personId) => data.people.find((person) => person.id === personId)?.name).filter(Boolean).join(", ") || "None"}</strong></div>
        <div><span>Start date</span><strong>{page.startDate ? formatAppDate(page.startDate) : "Not set"}</strong></div>
        <div><span>Due date</span><strong>{page.dueDate ? formatAppDate(page.dueDate) : "Not set"}</strong></div>
        <div><span>Completion date</span><strong>{page.completedDate ? formatAppDate(page.completedDate) : "Not completed"}</strong></div>
        <div><span>Status</span><strong>{page.status}</strong></div>
      </section>

      <section className="updates-section">
        <div className="updates-compact-toolbar">
          <div className="updates-fixed-actions">
            <span className="autosave-label">Saved automatically</span>
            <button
              type="button"
              className={`page-reminder-button ${page.reminderDate && !page.reminderClosedAt ? "active" : ""}`}
              onClick={() => setPageReminderOpen(true)}
              title={page.reminderDate && !page.reminderClosedAt ? `Page reminder: ${friendlyReminderLabel(page.reminderDate)}` : "Set a reminder for this page"}
            >
              <span aria-hidden="true">◷</span>
              <b>{page.reminderDate && !page.reminderClosedAt ? friendlyReminderLabel(page.reminderDate) : "Page reminder"}</b>
            </button>
            <div className="page-media-actions">
              <div className="attachment-control">
                <button ref={pageAttachmentTriggerRef} className="page-tool-button" onClick={(event) => {
                  if (attachmentMenuOpen) {
                    setAttachmentMenuOpen(false);
                    return;
                  }
                  if (window.matchMedia("(max-width: 768px)").matches) setPageAttachmentMenuPosition(anchoredMobileMenuPosition(event.currentTarget.getBoundingClientRect(), 180));
                  setAttachmentMenuOpen(true);
                }} aria-expanded={attachmentMenuOpen}><span aria-hidden="true">📎</span> Attachment <b>⌄</b></button>
                {attachmentMenuOpen && (typeof document !== "undefined" && window.matchMedia("(max-width: 768px)").matches
                  ? createPortal(<><button type="button" className="inline-menu-backdrop" aria-label="Close attachment menu" onClick={() => setAttachmentMenuOpen(false)} />{renderPageAttachmentMenu(true)}</>, document.body)
                  : renderPageAttachmentMenu())}
                <input ref={photoInputRef} className="hidden-file-input" type="file" accept="image/*" onChange={(event) => void uploadFromInput("photo", event.currentTarget)} />
                <input ref={documentInputRef} className="hidden-file-input" type="file" onChange={(event) => void uploadFromInput("document", event.currentTarget)} />
              </div>
              <button className={`page-tool-button audio-tool-button ${recording ? "recording" : ""}`} onClick={() => void toggleAudioRecording()}>
                <span aria-hidden="true">●</span>{recording ? `Stop ${String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:${String(recordingSeconds % 60).padStart(2, "0")}` : "Audio note"}
              </button>
              {!compact && <button className={`page-tool-button editor-tool-button ${editorPanelOpen ? "active" : ""}`} onClick={() => { if (editorPanelOpen) setEditorPanelOpen(false); else void runEditorCheck(); }}>
                <span aria-hidden="true">✓</span>Editor{editorChecked && editorIssues.length > 0 ? <b>{editorIssues.length}</b> : null}
              </button>}
            </div>
          </div>
        </div>
        {linkFormOpen && <form className="attachment-link-form" onSubmit={(event) => void submitLink(event)}>
          <label><span>Link title</span><input value={linkTitle} onChange={(event) => setLinkTitle(event.target.value)} placeholder="e.g. Crusher trial report" /></label>
          <label className="link-url-field"><span>Web link</span><input type="url" required value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://…" /></label>
          <label><span>Repository / location</span><input value={linkRepository} onChange={(event) => setLinkRepository(event.target.value)} placeholder="e.g. SharePoint · Production" /></label>
          <button type="button" onClick={() => setLinkFormOpen(false)}>Cancel</button><button className="primary-button" type="submit">Save link</button>
        </form>}
        {pageAttachments.length > 0 && <div className="attachment-shelf" aria-label="Page attachments">
          {pageAttachments.map((attachment) => <div className={`attachment-chip ${attachment.kind}`} key={attachment.id}>
            {attachment.kind === "photo" ? <a href={attachmentUrl(attachment)} target="_blank" rel="noreferrer"><img src={attachmentUrl(attachment)} alt={attachment.title} /><span>{attachment.title}</span></a>
              : attachment.kind === "audio" ? <><span className="attachment-kind-mark">●</span><div><strong>{attachment.title}</strong><audio controls preload="none" src={attachmentUrl(attachment)}><track kind="captions" src="data:text/vtt,WEBVTT" srcLang="en" label="No transcript available" /></audio></div></>
              : <a href={attachment.kind === "link" ? attachment.externalUrl ?? "#" : attachmentUrl(attachment)} target="_blank" rel="noreferrer"><span className="attachment-kind-mark">{attachment.kind === "link" ? "↗" : "▤"}</span><span><strong>{attachment.title}</strong><small>{attachment.repository || attachmentSize(attachment.sizeBytes) || "Open attachment"}</small></span></a>}
            <div className="attachment-chip-actions">
              {onRenameAttachment && <button aria-label={`Rename ${attachment.title}`} title="Rename attachment" onClick={() => void onRenameAttachment(attachment)}>✎</button>}
              {onDeleteAttachment && <button aria-label={`Remove ${attachment.title}`} title="Remove attachment" onClick={() => void onDeleteAttachment(attachment)}>×</button>}
            </div>
          </div>)}
        </div>}
        {pageReminderOpen && typeof document !== "undefined" && <ReminderSettingsModal
          title={page.title}
          dateTime={page.reminderDate ?? null}
          repeat={page.reminderRepeat ?? "none"}
          endDate={page.reminderEndDate ?? null}
          closedAt={page.reminderClosedAt ?? null}
          onCancel={() => setPageReminderOpen(false)}
          onSave={(value) => {
            onPageChange({ ...page, reminderDate: value.dateTime, reminderRepeat: value.repeat, reminderEndDate: value.endDate, reminderClosedAt: null }, true);
            setPageReminderOpen(false);
            void onReminderPermission?.();
          }}
          onCloseReminder={() => {
            onPageChange({ ...page, reminderClosedAt: localDateTime() }, true);
            setPageReminderOpen(false);
          }}
        />}
      </section>
      </div>
      <div className="updates-scroll-pane" data-nav-scroll="journal-page-updates">
        <div className="outline-list">
          {items.map((item, index) => (
            <div className={`outline-row ${item.isTask ? "task-line" : "update-line"} ${item.level === 0 && (items[index + 1]?.level ?? 0) > item.level ? "outline-parent-heading" : ""} level-${Math.min(item.level, 3)} desktop-level-${Math.min(item.level, 10)}`} key={item.id}>
              <div className="outline-hierarchy-tools">
                <InlineAttachmentTools
                  compact
                  actionsOnly
                  menuLabel={`Change hierarchy for ${serials[index]}`}
                  menuActions={[
                    {
                      icon: "⇥",
                      label: "Indent right",
                      detail: index === 0 || item.level >= (items[index - 1]?.level ?? -1) + 1 ? "No deeper level is available here" : "Move one level under the line above",
                      disabled: index === 0 || item.level >= (items[index - 1]?.level ?? -1) + 1,
                      onSelect: () => replaceItem(item.id, { level: Math.min((items[index - 1]?.level ?? -1) + 1, item.level + 1) }, true),
                    },
                    {
                      icon: "⇤",
                      label: "Indent left",
                      detail: item.level === 0 ? "This line is already at the main level" : "Move one level back",
                      disabled: item.level === 0,
                      onSelect: () => replaceItem(item.id, { level: Math.max(0, item.level - 1) }, true),
                    },
                  ]}
                  onUpload={async () => undefined}
                />
              </div>
              {item.isTask ? <button
                className={`outline-check ${item.completed ? "done" : ""}`}
                aria-label={item.completed ? "Mark not completed" : "Mark completed"}
                onClick={() => {
                  const completed = !item.completed;
                  replaceItem(item.id, { completed }, true);
                }}
              >{item.completed ? "✓" : ""}</button> : <span className="outline-update-mark" title="Ordinary update line" aria-label="Ordinary update line">·</span>}
              <CompactDateInput className="outline-date" wrapperClassName="outline-date-control" value={item.entryDate} ariaLabel={`Date for ${serials[index]}`} onChange={(entryDate) => replaceItem(item.id, { entryDate: entryDate || localDate() }, true)} />
              <span className="outline-serial">{serials[index]}</span>
              <RichTextField
                editorRef={(node) => { inputRefs.current[item.id] = node; }}
                className={item.completed ? "completed-text" : ""}
                value={item.text}
                placeholder={index === 0 ? "Start writing your update…" : "Next update…"}
                ariaLabel={`Update ${serials[index]}`}
                outlineId={item.id}
                onChange={(text) => replaceItem(item.id, { text })}
                onBlur={(text) => replaceItem(item.id, { text }, true)}
                onFocus={() => setActiveOutlineId(item.id)}
                onKeyDown={(event) => handleOutlineKey(event, item, index)}
              />
              <div className="outline-inline-tools">
                {onUploadAttachment && <InlineAttachmentTools compact menuActions={[
                  {
                    icon: item.isTask ? "↩" : "✓",
                    label: item.isTask ? "Change to ordinary update" : "Make this a task",
                    detail: item.isTask ? "Remove it from task progress" : "Include it in task progress",
                    active: item.isTask,
                    onSelect: () => replaceItem(item.id, { isTask: !item.isTask, completed: false }, true),
                  },
                ]} onUpload={(kind, file) => onUploadAttachment(page.id, kind, file, item.id)} />}
              </div>
              {onRenameAttachment && onDeleteAttachment && <AttachmentList compact attachments={attachments.filter((attachment) => attachment.outlineId === item.id)} urlFor={attachmentUrl} onRename={onRenameAttachment} onDelete={onDeleteAttachment} />}
            </div>
          ))}
        </div>

      {page.sourceType === "Meeting" && page.sourceId && (
        <aside className="source-note">
          <div className="source-mark">M</div>
          <div><strong>This task came from {page.sourceLabel}</strong><p>Edit the task here or in its meeting. Both places use the same record.</p></div>
          <button onClick={() => onOpenSource(page)}>Open source meeting <Icon name="link" /></button>
        </aside>
      )}

      </div>
      {editorPanelOpen && <aside className="private-editor-panel" aria-label="Spelling and grammar editor">
        <div className="private-editor-heading">
          <div><span className="private-editor-mark">✓</span><div><h2>Editor</h2><p>UK English · private review</p></div></div>
          <button type="button" aria-label="Close editor" onClick={() => setEditorPanelOpen(false)}>×</button>
        </div>
        <div className="private-editor-tabs">
          <button className={editorPanelTab === "review" ? "active" : ""} onClick={() => setEditorPanelTab("review")}>Review{editorChecked ? ` ${editorIssues.length}` : ""}</button>
          <button className={editorPanelTab === "dictionary" ? "active" : ""} onClick={() => setEditorPanelTab("dictionary")}>Dictionary {data.editorDictionary.length}</button>
        </div>
        {editorPanelTab === "review" ? <>
          <div className="private-editor-scope">
            <button className={editorScope === "page" ? "active" : ""} onClick={() => { setEditorScope("page"); void runEditorCheck("page"); }}>Whole page</button>
            <button className={editorScope === "line" ? "active" : ""} onClick={() => { setEditorScope("line"); void runEditorCheck("line"); }}>Selected line</button>
            <button className="private-editor-refresh" aria-label="Check again" title="Check again" onClick={() => void runEditorCheck()}>↻</button>
          </div>
          {editorChecking && <div className="private-editor-state"><span className="editor-spinner" />Checking this writing on your device…</div>}
          {!editorChecking && editorError && <div className="private-editor-state error"><strong>Editor needs your attention</strong><span>{editorError}</span></div>}
          {!editorChecking && !editorError && editorChecked && editorIssues.length === 0 && <div className="private-editor-state clear"><span>✓</span><strong>All clear</strong><p>No spelling or grammar suggestions in this {editorScope === "line" ? "line" : "page"}.</p></div>}
          {!editorChecking && !editorError && !editorChecked && <div className="private-editor-state"><strong>Review your writing</strong><span>Check the whole page or click an update line and review only that line.</span></div>}
          {!editorChecking && editorIssues.length > 0 && <div className="private-editor-results">{editorIssues.map((issue) => {
            const spelling = /spell|typo/i.test(issue.kind);
            const sameCount = editorIssues.filter((entry) => entry.problem.toLocaleLowerCase("en-GB") === issue.problem.toLocaleLowerCase("en-GB")).length;
            const before = issue.sourceText.slice(Math.max(0, issue.start - 34), issue.start);
            const after = issue.sourceText.slice(issue.end, Math.min(issue.sourceText.length, issue.end + 34));
            return <section className={`private-editor-card ${spelling ? "spelling" : "grammar"}`} key={issue.id}>
              <button className="private-editor-location" onClick={() => focusEditorIssue(issue)}><span>{spelling ? "Spelling" : "Grammar"}</span><b>{issue.targetLabel}</b><i>↗</i></button>
              <p className="private-editor-context">{issue.start > 34 ? "…" : ""}{before}<mark>{issue.problem || "space"}</mark>{after}{issue.end + 34 < issue.sourceText.length ? "…" : ""}</p>
              <p className="private-editor-message">{issue.message}</p>
              {issue.suggestions.length > 0 && <div className="private-editor-suggestions">{issue.suggestions.map((suggestion, suggestionIndex) => <button className={suggestionIndex === 0 ? "preferred" : ""} key={`${issue.id}:${suggestion}`} onClick={() => applyEditorSuggestion(issue, suggestion)}>{suggestion || "Remove"}</button>)}</div>}
              <div className="private-editor-actions">
                {issue.suggestions[0] !== undefined && sameCount > 1 && <button onClick={() => applyEditorSuggestionEverywhere(issue, issue.suggestions[0])}>Change all ({sameCount})</button>}
                <button onClick={() => setEditorIssues((current) => current.filter((entry) => entry.id !== issue.id))}>Ignore once</button>
                <button onClick={() => { const key = issue.problem.toLocaleLowerCase("en-GB"); setIgnoredEditorWords((current) => new Set(current).add(key)); setEditorIssues((current) => current.filter((entry) => entry.problem.toLocaleLowerCase("en-GB") !== key)); }}>Ignore all</button>
                {spelling && issue.problem && onLearnDictionaryWord && <button className="learn-word-button" onClick={() => void learnEditorWord(issue.problem)}>Learn “{issue.problem}”</button>}
              </div>
            </section>;
          })}</div>}
        </> : <div className="private-editor-dictionary">
          <p>Plant names, chemicals, equipment and people added here will no longer be marked as spelling errors.</p>
          <form onSubmit={(event) => { event.preventDefault(); void learnEditorWord(newDictionaryWord); }}>
            <input value={newDictionaryWord} onChange={(event) => setNewDictionaryWord(event.target.value)} placeholder="Add a word, e.g. NPK" aria-label="Word to learn" />
            <button type="submit" disabled={!newDictionaryWord.trim() || !onLearnDictionaryWord}>Learn</button>
          </form>
          {editorError && <div className="dictionary-error">{editorError}</div>}
          <div className="dictionary-word-list">{data.editorDictionary.length ? data.editorDictionary.map((word) => <div key={word}><span>{word}</span><button type="button" disabled={!onRemoveDictionaryWord} aria-label={`Remove ${word} from dictionary`} onClick={() => void onRemoveDictionaryWord?.(word)}>×</button></div>) : <div className="dictionary-empty">No personal words yet.</div>}</div>
        </div>}
        <footer><span>⌁</span><strong>Checked locally on this device</strong><small>Your page text is not sent to an outside grammar service.</small></footer>
      </aside>}
      {supportingPickerOpen && typeof document !== "undefined" && createPortal(<div className="modal-backdrop supporting-overlay" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setSupportingPickerOpen(false); }} onTouchMove={(event) => { if (event.currentTarget === event.target) event.preventDefault(); }}>
        <section className="supporting-people-modal">
          <div className="modal-heading"><div className="modal-icon">◎</div><div><h2>Team members</h2><p>Select every team member supporting this task.</p></div><button type="button" className="close-button" onClick={() => setSupportingPickerOpen(false)}>×</button></div>
          <div className="supporting-people-list">{data.people.map((person) => <label key={person.id}>
            <input type="checkbox" checked={page.supportingIds.includes(person.id)} onChange={(event) => {
              const supportingIds = event.target.checked ? [...page.supportingIds, person.id] : page.supportingIds.filter((id) => id !== person.id);
              onPageChange({ ...page, supportingIds }, true);
            }} />
            <span className="person-avatar">{initials(person.name)}</span><span><strong>{person.name}</strong><small>{person.role || "Role not entered"}</small></span>
          </label>)}</div>
          <div className="modal-actions"><button type="button" onClick={() => { setSupportingPickerOpen(false); onManagePeople(); }}>Manage team members</button><button type="button" className="primary-button" onClick={() => setSupportingPickerOpen(false)}>Done</button></div>
        </section>
      </div>, document.body)}
    </article>
  );
}

export default function JournalApp() {
  const [data, setData] = useState<AppData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeView, setActiveView] = useState<ViewName>("journal");
  const [mobileJournalPane, setMobileJournalPane] = useState<MobileJournalPane>("page");
  const [selectedNotebookId, setSelectedNotebookId] = useState("plant-operations");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("production");
  const [selectedSubsectionId, setSelectedSubsectionId] = useState("npk-solid");
  const [selectedPageId, setSelectedPageId] = useState("page-crusher");
  const [selectedMeetingId, setSelectedMeetingId] = useState("meeting-026");
  const [selectedAgendaPosition, setSelectedAgendaPosition] = useState(4);
  const [selectedPersonId, setSelectedPersonId] = useState("himayat");
  const [selectedDayDate, setSelectedDayDate] = useState(localDate());
  const [calendarMonth, setCalendarMonth] = useState(localDate().slice(0, 7));
  const [journalFilter, setJournalFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [desktopSearchActive, setDesktopSearchActive] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileProfileOpen, setMobileProfileOpen] = useState(false);
  const [actionMenu, setActionMenu] = useState<ActionMenu | null>(null);
  const [moveDialog, setMoveDialog] = useState<MoveDialog | null>(null);
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dragOverKey, setDragOverKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [collapsedPages, setCollapsedPages] = useState<Set<string>>(new Set());
  const [peopleManagerOpen, setPeopleManagerOpen] = useState(false);
  const [journalPaneWidths, setJournalPaneWidths] = useState<[number, number]>([242, 292]);
  const [appFont, setAppFont] = useState<AppFont>("Calibri");
  const [appTheme, setAppTheme] = useState<AppTheme>("paper");
  const [displayMode, setDisplayMode] = useState<DisplayMode>(() => {
    if (typeof window === "undefined") return "auto";
    const saved = window.localStorage.getItem("journal-mobile-display-mode");
    return saved === "day" || saved === "night" || saved === "auto" ? saved : "auto";
  });
  const [systemDarkDisplay, setSystemDarkDisplay] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const [zoomLocked, setZoomLocked] = useState(true);
  const [pushStatus, setPushStatus] = useState<PushStatus>("checking");
  const [reminderClock, setReminderClock] = useState(() => Date.now());
  const [sectionExpansionRequest, setSectionExpansionRequest] = useState({ id: "", request: 0 });
  const [navigationRestoreVersion, setNavigationRestoreVersion] = useState(0);
  const saveTimers = useRef<Record<string, number>>({});
  const desktopSearchRef = useRef<HTMLDivElement | null>(null);
  const loadSequence = useRef(0);
  const backgroundLoadInFlight = useRef(false);
  const stateSnapshot = useRef("");
  const loadedPageIds = useRef<Set<string>>(new Set());
  const pageContentLoads = useRef<Map<string, Promise<void>>>(new Map());
  const pendingPageWriteCounts = useRef<Map<string, number>>(new Map());
  const secondaryStateLoaded = useRef(false);
  const secondaryStateLoad = useRef<Promise<void> | null>(null);
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());
  const lastFullRefreshAt = useRef(0);
  const localDataVersion = useRef(0);
  const activeDataWrites = useRef(0);
  const dragItemRef = useRef<DragItem | null>(null);
  const sectionMouseCleanupRef = useRef<(() => void) | null>(null);
  const notifiedReminderIds = useRef<Set<string>>(new Set());
  const locationRestored = useRef(false);
  const browserNavigationReady = useRef(false);
  const restoringBrowserNavigation = useRef(false);
  const pendingNavigationScroll = useRef<Record<string, number> | null>(null);
  const navigationScrollTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!mobileNavOpen && !mobileProfileOpen) return;
    const closeMenus = (event?: KeyboardEvent) => {
      if (event && event.key !== "Escape") return;
      setMobileNavOpen(false);
      setMobileProfileOpen(false);
    };
    const closeOnDesktop = () => {
      if (window.innerWidth > 480) closeMenus();
    };
    window.addEventListener("keydown", closeMenus);
    window.addEventListener("resize", closeOnDesktop);
    return () => {
      window.removeEventListener("keydown", closeMenus);
      window.removeEventListener("resize", closeOnDesktop);
    };
  }, [mobileNavOpen, mobileProfileOpen]);

  async function loadSecondaryState(force = false) {
    if (!force && secondaryStateLoaded.current) return;
    if (secondaryStateLoad.current) return secondaryStateLoad.current;
    const pending = (async () => {
      const response = await requestWithTimeout("/api/state?scope=secondary", { cache: "no-store" }, 20_000);
      const result = await response.json() as Partial<AppData> & { error?: string };
      if (!response.ok) throw new Error(result.error || "Supporting journal data could not be loaded.");
      setData((current) => ({ ...current, ...result }));
      secondaryStateLoaded.current = true;
    })().finally(() => { secondaryStateLoad.current = null; });
    secondaryStateLoad.current = pending;
    return pending;
  }

  async function loadPageContent(pageId: string, force = false) {
    if (!pageId || (!force && loadedPageIds.current.has(pageId))) return;
    let pending = pageContentLoads.current.get(pageId);
    if (!pending) {
      pending = (async () => {
        if ((pendingPageWriteCounts.current.get(pageId) ?? 0) > 0) await writeQueue.current.catch(() => {});
        const response = await requestWithTimeout(`/api/state?scope=page&pageId=${encodeURIComponent(pageId)}`, { cache: "no-store" }, 15_000);
        const result = await response.json() as { pageId?: string; outlineItems?: OutlineItem[]; attachments?: PageAttachment[]; error?: string };
        if (!response.ok) throw new Error(result.error || "This page could not be opened.");
        const loadedPageId = result.pageId || pageId;
        setData((current) => ({
          ...current,
          outlineItems: [...current.outlineItems.filter((item) => item.pageId !== loadedPageId), ...(result.outlineItems ?? [])],
          attachments: [...current.attachments.filter((item) => item.pageId !== loadedPageId), ...(result.attachments ?? [])],
        }));
        loadedPageIds.current.add(loadedPageId);
      })().finally(() => pageContentLoads.current.delete(pageId));
      pageContentLoads.current.set(pageId, pending);
    }
    return pending;
  }

  async function loadState(selection?: { pageId?: string; meetingId?: string }, background = false) {
    if (background && backgroundLoadInFlight.current) return;
    if (background) backgroundLoadInFlight.current = true;
    const requestNumber = ++loadSequence.current;
    const dataVersion = localDataVersion.current;
    try {
      let requestedPageId = selection?.pageId || selectedPageId;
      if (!locationRestored.current && !selection?.pageId) {
        try {
          const stored = JSON.parse(window.localStorage.getItem("journal-last-location") ?? "{}") as { pageId?: string };
          requestedPageId = new URLSearchParams(window.location.search).get("pushPage") || stored.pageId || requestedPageId;
        } catch {
          // Device-local navigation preferences are optional.
        }
      }
      const stateUrl = requestedPageId ? `/api/state?pageId=${encodeURIComponent(requestedPageId)}` : "/api/state";
      let response: Response | null = null;
      const attempts = background ? 2 : 3;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
          response = await requestWithTimeout(stateUrl, { cache: "no-store" }, 15_000);
          if (response.ok) break;
        } catch {
          response = null;
        }
        if (attempt < attempts - 1) await new Promise((resolve) => window.setTimeout(resolve, 350 * (attempt + 1)));
      }
      if (!response?.ok) throw new Error("The journal could not be opened.");
      const snapshot = await response.text();
      if (requestNumber !== loadSequence.current || dataVersion !== localDataVersion.current) return;
      if (background && snapshot === stateSnapshot.current) return;
      const statePatch = JSON.parse(snapshot) as Partial<AppData>;
      const state = { ...emptyData, ...statePatch } as AppData;
      const firstLoad = !locationRestored.current;
      stateSnapshot.current = snapshot;
      lastFullRefreshAt.current = Date.now();
      loadedPageIds.current.clear();
      if (requestedPageId && state.pages.some((page) => page.id === requestedPageId)) loadedPageIds.current.add(requestedPageId);
      setData((current) => firstLoad ? state : { ...current, ...statePatch });
      if (!locationRestored.current) {
        locationRestored.current = true;
        let stored: { activeView?: string; notebookId?: string; departmentId?: string; sectionId?: string; pageId?: string } = {};
        try {
          stored = JSON.parse(window.localStorage.getItem("journal-last-location") ?? "{}");
        } catch {
          // A damaged device-local preference must never prevent the journal from opening.
        }
        const pushParams = new URLSearchParams(window.location.search);
        const pushedPage = state.pages.find((item) => item.id === pushParams.get("pushPage"));
        const pushedDay = pushParams.get("pushDay");
        if (pushedPage) {
          const pushedSection = journalSection(state, pushedPage.subsectionId);
          stored = {
            ...stored,
            activeView: "journal",
            notebookId: pushedSection?.notebookId,
            sectionId: pushedPage.subsectionId,
            pageId: pushedPage.id,
          };
        } else if (pushedDay && /^\d{4}-\d{2}-\d{2}$/.test(pushedDay)) {
          stored = { ...stored, activeView: "my-day" };
          setSelectedDayDate(pushedDay);
          setCalendarMonth(pushedDay.slice(0, 7));
        }
        const notebook = state.notebooks.find((item) => item.id === stored.notebookId) ?? state.notebooks[0];
        const notebookId = notebook?.id ?? "plant-operations";
        const validSectionIds = notebookSectionIds(state, notebookId);
        const storedPage = state.pages.find((item) => item.id === stored.pageId && validSectionIds.has(item.subsectionId));
        const preferredSectionId = storedPage?.subsectionId
          ?? (stored.sectionId && validSectionIds.has(stored.sectionId) ? stored.sectionId : "")
          ?? "";
        const fallbackSection = state.subsections.find((item) => item.notebookId === notebookId)
          ?? state.departments.find((item) => item.notebookId === notebookId);
        const sectionId = preferredSectionId || fallbackSection?.id || "";
        const section = journalSection(state, sectionId);
        const departmentId = state.subsections.find((item) => item.id === sectionId)?.departmentId
          ?? state.departments.find((item) => item.id === sectionId)?.id
          ?? (stored.departmentId && state.departments.some((item) => item.id === stored.departmentId && item.notebookId === notebookId) ? stored.departmentId : "")
          ?? "";
        const page = storedPage?.subsectionId === sectionId
          ? storedPage
          : state.pages.find((item) => item.subsectionId === sectionId);
        const allowedViews: ViewName[] = ["dashboard", "my-day", "journal", "meetings", "people"];
        setSelectedNotebookId(notebookId);
        setSelectedDepartmentId(departmentId || (section && "departmentId" in section ? section.departmentId : section?.id) || "");
        setSelectedSubsectionId(sectionId);
        setSelectedPageId(page?.id ?? "");
        if (stored.activeView && allowedViews.includes(stored.activeView as ViewName)) setActiveView(stored.activeView as ViewName);
        if (pushParams.size) window.history.replaceState({}, "", window.location.pathname);
      } else if (!state.notebooks.some((notebook) => notebook.id === selectedNotebookId)) {
        setSelectedNotebookId(state.notebooks[0]?.id ?? "plant-operations");
      }
      if (selection?.pageId) setSelectedPageId(selection.pageId);
      if (selection?.meetingId) setSelectedMeetingId(selection.meetingId);
      if (selection?.meetingId) await loadSecondaryState(true);
      else if (background && secondaryStateLoaded.current) void loadSecondaryState(true).catch(() => {});
      setLoadError("");
    } catch (error) {
      if (requestNumber !== loadSequence.current) return;
      if (!background) setLoadError(error instanceof Error ? error.message : "The journal could not be opened.");
    } finally {
      if (background) backgroundLoadInFlight.current = false;
      if (!background && requestNumber === loadSequence.current) setLoading(false);
    }
  }

  useEffect(() => { void loadState(); }, []);

  useEffect(() => {
    if (loading || !selectedPageId || loadedPageIds.current.has(selectedPageId)) return;
    void loadPageContent(selectedPageId).catch((error) => console.error("[page-content]", error));
  }, [loading, selectedPageId]);

  useEffect(() => {
    if (loading) return;
    const delay = activeView === "my-day" || activeView === "meetings" ? 0 : 250;
    const timer = window.setTimeout(() => {
      void loadSecondaryState().catch((error) => console.error("[secondary-state]", error));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [activeView, loading]);

  useEffect(() => {
    if (!desktopSearchActive) return;
    const closeSearchOutside = (event: PointerEvent) => {
      if (!desktopSearchRef.current?.contains(event.target as Node)) setDesktopSearchActive(false);
    };
    const closeSearchOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDesktopSearchActive(false);
    };
    document.addEventListener("pointerdown", closeSearchOutside, true);
    document.addEventListener("keydown", closeSearchOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeSearchOutside, true);
      document.removeEventListener("keydown", closeSearchOnEscape);
    };
  }, [desktopSearchActive]);

  useEffect(() => {
    if (!mobileSearchOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeSearchOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileSearchOpen(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeSearchOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeSearchOnEscape);
    };
  }, [mobileSearchOpen]);

  useEffect(() => {
    if (loading) return;
    const refreshWhenIdle = () => {
      if (document.visibilityState !== "visible" || activeDataWrites.current > 0) return;
      if (Date.now() - lastFullRefreshAt.current < 30_000) return;
      if (Object.keys(saveTimers.current).length > 0) return;
      const active = document.activeElement as HTMLElement | null;
      if (active?.matches("input, textarea, select")) return;
      if (document.querySelector(".modal-backdrop, .ios-reminder-backdrop, .inline-media-menu, .context-menu")) return;
      void loadState(undefined, true);
    };
    const onVisibilityChange = () => { if (document.visibilityState === "visible") refreshWhenIdle(); };
    window.addEventListener("focus", refreshWhenIdle);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", refreshWhenIdle);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [loading, selectedPageId]);

  useEffect(() => {
    let cancelled = false;
    async function restorePushSubscription() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") {
        if (!cancelled) setPushStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setPushStatus("denied");
        return;
      }
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
        await registration.update();
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          if (!cancelled) setPushStatus("off");
          return;
        }
        const keyResponse = await requestWithTimeout("/api/push", { cache: "no-store" }, 15_000);
        const keyResult = await keyResponse.json() as { publicKey?: string; configured?: boolean };
        if (!keyResponse.ok || !keyResult.configured || !keyResult.publicKey) throw new Error("Notifications are not configured.");
        if (!pushSubscriptionUsesKey(subscription, decodeApplicationServerKey(keyResult.publicKey))) {
          await requestWithTimeout("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "unsubscribe", subscription: subscription.toJSON() }) }, 15_000);
          await subscription.unsubscribe();
          subscription = null;
          if (!cancelled) setPushStatus("off");
          return;
        }
        const syncResponse = await requestWithTimeout("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "subscribe", subscription: subscription.toJSON() }) }, 15_000);
        if (!syncResponse.ok) throw new Error("Notification subscription could not be synchronized.");
        if (!cancelled) setPushStatus("enabled");
      } catch {
        if (!cancelled) setPushStatus("error");
      }
    }
    void restorePushSubscription();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (loading || !locationRestored.current) return;
    window.localStorage.setItem("journal-last-location", JSON.stringify({
      activeView,
      notebookId: selectedNotebookId,
      departmentId: selectedDepartmentId,
      sectionId: selectedSubsectionId,
      pageId: selectedPageId,
    }));
  }, [activeView, loading, selectedDepartmentId, selectedNotebookId, selectedPageId, selectedSubsectionId]);

  useEffect(() => {
    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";

    const rememberScrollPosition = (event: Event) => {
      const scroller = event.target instanceof HTMLElement && event.target.matches("[data-nav-scroll]")
        ? event.target
        : null;
      if (!scroller?.dataset.navScroll || !browserNavigationReady.current) return;
      const scrollKey = scroller.dataset.navScroll;
      const scrollTop = scroller.scrollTop;
      if (navigationScrollTimer.current !== null) window.clearTimeout(navigationScrollTimer.current);
      navigationScrollTimer.current = window.setTimeout(() => {
        navigationScrollTimer.current = null;
        const state = window.history.state && typeof window.history.state === "object" ? window.history.state : {};
        const snapshot = state.plantJournalNavigation as NavigationSnapshot | undefined;
        if (!snapshot) return;
        try {
          window.history.replaceState({
            ...state,
            plantJournalNavigation: {
              ...snapshot,
              scrollPositions: {
                ...(snapshot.scrollPositions ?? {}),
                [scrollKey]: scrollTop,
              },
            },
          }, "");
        } catch (error) {
          console.warn("[navigation-scroll] Browser history could not be updated.", error);
        }
      }, 500);
    };

    document.addEventListener("scroll", rememberScrollPosition, true);
    return () => {
      document.removeEventListener("scroll", rememberScrollPosition, true);
      if (navigationScrollTimer.current !== null) window.clearTimeout(navigationScrollTimer.current);
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);

  useEffect(() => {
    const restoreNavigation = (event: PopStateEvent) => {
      const snapshot = event.state?.plantJournalNavigation as NavigationSnapshot | undefined;
      if (!snapshot) return;
      restoringBrowserNavigation.current = true;
      pendingNavigationScroll.current = snapshot.scrollPositions ?? {};
      setActiveView(snapshot.activeView);
      setMobileJournalPane(snapshot.mobileJournalPane);
      setSelectedNotebookId(snapshot.selectedNotebookId);
      setSelectedDepartmentId(snapshot.selectedDepartmentId);
      setSelectedSubsectionId(snapshot.selectedSubsectionId);
      setSelectedPageId(snapshot.selectedPageId);
      setSelectedMeetingId(snapshot.selectedMeetingId);
      setSelectedPersonId(snapshot.selectedPersonId);
      setJournalFilter(snapshot.journalFilter);
      setNavigationRestoreVersion((current) => current + 1);
    };
    window.addEventListener("popstate", restoreNavigation);
    return () => window.removeEventListener("popstate", restoreNavigation);
  }, []);

  useLayoutEffect(() => {
    const positions = pendingNavigationScroll.current;
    if (!positions) return;
    const restore = () => {
      document.querySelectorAll<HTMLElement>("[data-nav-scroll]").forEach((scroller) => {
        const key = scroller.dataset.navScroll;
        if (key && Object.prototype.hasOwnProperty.call(positions, key)) scroller.scrollTop = positions[key];
      });
    };
    restore();
    const frame = window.requestAnimationFrame(() => {
      restore();
      pendingNavigationScroll.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeView, mobileJournalPane, navigationRestoreVersion, selectedMeetingId, selectedPageId, selectedPersonId, selectedSubsectionId]);

  useEffect(() => {
    if (loading || !locationRestored.current) return;
    const snapshot: NavigationSnapshot = {
      activeView,
      mobileJournalPane,
      selectedNotebookId,
      selectedDepartmentId,
      selectedSubsectionId,
      selectedPageId,
      selectedMeetingId,
      selectedPersonId,
      journalFilter,
    };
    const state = window.history.state && typeof window.history.state === "object" ? window.history.state : {};
    if (!browserNavigationReady.current) {
      browserNavigationReady.current = true;
      window.history.replaceState({ ...state, plantJournalNavigation: snapshot }, "");
      return;
    }
    if (restoringBrowserNavigation.current) {
      restoringBrowserNavigation.current = false;
      return;
    }
    const current = state.plantJournalNavigation as NavigationSnapshot | undefined;
    if (current && JSON.stringify(current) === JSON.stringify(snapshot)) return;
    window.history.pushState({ ...state, plantJournalNavigation: snapshot }, "");
  }, [activeView, journalFilter, loading, mobileJournalPane, selectedDepartmentId, selectedMeetingId, selectedNotebookId, selectedPageId, selectedPersonId, selectedSubsectionId]);

  useEffect(() => {
    const stored = window.localStorage.getItem("journal-pane-widths");
    if (!stored) return;
    try {
      const widths = JSON.parse(stored) as number[];
      if (widths.length === 2 && widths.every(Number.isFinite)) setJournalPaneWidths([Math.max(190, Math.min(430, widths[0])), Math.max(220, Math.min(520, widths[1]))]);
    } catch {
      // Invalid device-local layout preferences can safely fall back to the defaults.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("journal-pane-widths", JSON.stringify(journalPaneWidths));
  }, [journalPaneWidths]);

  useEffect(() => {
    const savedFont = window.localStorage.getItem("journal-app-font") as AppFont | null;
    const savedTheme = window.localStorage.getItem("journal-app-theme") as AppTheme | null;
    if (savedFont && appFonts.includes(savedFont)) setAppFont(savedFont);
    if (savedTheme && appThemes.includes(savedTheme)) setAppTheme(savedTheme);
  }, []);

  useEffect(() => { window.localStorage.setItem("journal-app-font", appFont); }, [appFont]);
  useEffect(() => {
    const themeClasses = appThemes.map((theme) => `theme-${theme}`);
    window.localStorage.setItem("journal-app-theme", appTheme);
    document.body.classList.remove(...themeClasses);
    document.body.classList.add(`theme-${appTheme}`);
    return () => document.body.classList.remove(`theme-${appTheme}`);
  }, [appTheme]);

  useEffect(() => {
    const savedDisplayMode = window.localStorage.getItem("journal-mobile-display-mode") as DisplayMode | null;
    if (savedDisplayMode && ["day", "night", "auto"].includes(savedDisplayMode)) setDisplayMode(savedDisplayMode);
    const systemPreference = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDarkDisplay(systemPreference.matches);
    const handlePreferenceChange = (event: MediaQueryListEvent) => setSystemDarkDisplay(event.matches);
    systemPreference.addEventListener("change", handlePreferenceChange);
    return () => systemPreference.removeEventListener("change", handlePreferenceChange);
  }, []);

  const currentHour = new Date(reminderClock).getHours();
  const eveningDisplay = currentHour >= 18 || currentHour < 6;
  const darkDisplay = displayMode === "night" || (displayMode === "auto" && (systemDarkDisplay || eveningDisplay));

  useEffect(() => {
    window.localStorage.setItem("journal-mobile-display-mode", displayMode);
    const applyDisplay = () => {
      document.body.classList.toggle("journal-mobile-dark", darkDisplay);
      document.documentElement.classList.toggle("journal-mobile-dark-preload", darkDisplay);
    };
    applyDisplay();
    return () => {
      document.body.classList.remove("journal-mobile-dark");
      document.documentElement.classList.remove("journal-mobile-dark-preload");
    };
  }, [darkDisplay, displayMode]);

  useEffect(() => {
    const locked = window.localStorage.getItem("journal-mobile-zoom") !== "allowed";
    setZoomLocked(locked);
    const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    viewport?.setAttribute("content", locked
      ? "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
      : "width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes, viewport-fit=cover");
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setReminderClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (pushStatus !== "unsupported") return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const now = new Date(reminderClock);
    for (const page of data.pages) {
      const occurrence = pageReminderOccurrence(page, now);
      const notificationKey = `page:${page.id}:${occurrence ?? ""}`;
      if (!occurrence || notifiedReminderIds.current.has(notificationKey)) continue;
      notifiedReminderIds.current.add(notificationKey);
      const notification = new Notification("Journal page reminder", { body: `${page.serial} · ${page.title}`, tag: `page-${page.id}` });
      notification.onclick = () => { window.focus(); openPage(page); notification.close(); };
    }
    for (const item of data.dayPlanItems) {
      const reminderDate = dayPlanReminderDate(item, now);
      const notificationKey = `my-day:${item.id}:${reminderDate ?? ""}`;
      if (!reminderDate || !reminderIsDue(reminderDate, now) || notifiedReminderIds.current.has(notificationKey)) continue;
      notifiedReminderIds.current.add(notificationKey);
      const notification = new Notification(`My Day · ${item.category}`, { body: item.title, tag: `my-day-${item.id}` });
      notification.onclick = () => { window.focus(); setSelectedDayDate(item.planDate); setCalendarMonth(item.planDate.slice(0, 7)); setActiveView("my-day"); notification.close(); };
    }
  }, [data.dayPlanItems, data.pages, pushStatus, reminderClock]);

  async function post(body: Record<string, unknown>) {
    const action = String(body.action ?? "");
    const pageWriteId = action === "saveOutline"
      ? String(body.pageId ?? "")
      : action === "savePage" && body.page && typeof body.page === "object"
        ? String((body.page as { id?: unknown }).id ?? "")
        : "";
    if (pageWriteId) pendingPageWriteCounts.current.set(pageWriteId, (pendingPageWriteCounts.current.get(pageWriteId) ?? 0) + 1);
    activeDataWrites.current += 1;
    localDataVersion.current += 1;
    setSaving(true);
    const operation = async () => {
      const response = await requestWithTimeout("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, 20_000);
      const result = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(String(result.error ?? "Unable to save"));
      return result;
    };
    const pending = writeQueue.current.then(operation, operation);
    writeQueue.current = pending.catch(() => {});
    try {
      return await pending;
    } finally {
      if (pageWriteId) {
        const remaining = (pendingPageWriteCounts.current.get(pageWriteId) ?? 1) - 1;
        if (remaining > 0) pendingPageWriteCounts.current.set(pageWriteId, remaining);
        else pendingPageWriteCounts.current.delete(pageWriteId);
      }
      activeDataWrites.current = Math.max(0, activeDataWrites.current - 1);
      window.setTimeout(() => { if (activeDataWrites.current === 0) setSaving(false); }, 350);
    }
  }

  async function learnDictionaryWord(word: string) {
    const result = await post({ action: "learnEditorWord", word });
    const editorDictionary = Array.isArray(result.editorDictionary) ? result.editorDictionary.map(String) : [];
    setData((current) => ({ ...current, editorDictionary }));
  }

  async function removeDictionaryWord(word: string) {
    const result = await post({ action: "removeEditorWord", word });
    const editorDictionary = Array.isArray(result.editorDictionary) ? result.editorDictionary.map(String) : [];
    setData((current) => ({ ...current, editorDictionary }));
  }

  async function uploadPageAttachment(pageId: string, kind: "photo" | "document" | "audio", file: File, outlineId?: string) {
    setSaving(true);
    try {
      const form = new FormData();
      form.set("pageId", pageId);
      form.set("kind", kind);
      if (outlineId) form.set("outlineId", outlineId);
      form.set("file", file);
      const response = await requestWithTimeout("/api/attachments", { method: "POST", body: form }, 120_000);
      const result = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(String(result.error ?? "The attachment could not be saved."));
      const attachment = result.attachment as PageAttachment | undefined;
      if (attachment) setData((current) => ({ ...current, attachments: [...current.attachments, attachment] }));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The attachment could not be saved.");
    } finally {
      window.setTimeout(() => setSaving(false), 350);
    }
  }

  async function addPageLink(pageId: string, title: string, url: string, repository: string) {
    setSaving(true);
    try {
      const response = await requestWithTimeout("/api/attachments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, title, url, repository }),
      }, 20_000);
      const result = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(String(result.error ?? "The link could not be saved."));
      const attachment = result.attachment as PageAttachment | undefined;
      if (attachment) setData((current) => ({ ...current, attachments: [...current.attachments, attachment] }));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The link could not be saved.");
      throw error;
    } finally {
      window.setTimeout(() => setSaving(false), 350);
    }
  }

  async function deletePageAttachment(attachment: PageAttachment) {
    if (!window.confirm(`Remove “${attachment.title}” from this page?`)) return;
    setSaving(true);
    try {
      const response = await requestWithTimeout(`/api/attachments?id=${encodeURIComponent(attachment.id)}`, { method: "DELETE" }, 20_000);
      const result = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(String(result.error ?? "The attachment could not be removed."));
      setData((current) => ({ ...current, attachments: current.attachments.filter((item) => item.id !== attachment.id) }));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The attachment could not be removed.");
    } finally {
      window.setTimeout(() => setSaving(false), 350);
    }
  }

  async function renamePageAttachment(attachment: PageAttachment) {
    const title = window.prompt("Rename this attachment:", attachment.title)?.trim();
    if (!title || title === attachment.title) return;
    setSaving(true);
    try {
      const response = await requestWithTimeout("/api/attachments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: attachment.id, title }),
      }, 20_000);
      const result = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(String(result.error ?? "The attachment could not be renamed."));
      const updated = result.attachment as PageAttachment | undefined;
      setData((current) => ({ ...current, attachments: current.attachments.map((item) => item.id === attachment.id ? updated ?? { ...item, title } : item) }));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The attachment could not be renamed.");
    } finally {
      window.setTimeout(() => setSaving(false), 350);
    }
  }

  async function uploadDayPlanAttachment(chainId: string, detailId: string | null, kind: "photo" | "document" | "audio", file: File) {
    setSaving(true);
    try {
      const form = new FormData();
      form.set("chainId", chainId);
      if (detailId) form.set("detailId", detailId);
      form.set("kind", kind);
      form.set("file", file);
      const response = await requestWithTimeout("/api/day-plan-attachments", { method: "POST", body: form }, 120_000);
      const result = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(String(result.error ?? "The attachment could not be saved."));
      const attachment = result.attachment as DayPlanAttachment | undefined;
      if (attachment) setData((current) => ({ ...current, dayPlanAttachments: [...current.dayPlanAttachments, attachment] }));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The attachment could not be saved.");
    } finally {
      window.setTimeout(() => setSaving(false), 350);
    }
  }

  async function renameDayPlanAttachment(attachment: DayPlanAttachment) {
    const title = window.prompt("Rename this attachment:", attachment.title)?.trim();
    if (!title || title === attachment.title) return;
    setSaving(true);
    try {
      const response = await requestWithTimeout("/api/day-plan-attachments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: attachment.id, title }) }, 20_000);
      const result = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(String(result.error ?? "The attachment could not be renamed."));
      const updated = result.attachment as DayPlanAttachment | undefined;
      setData((current) => ({ ...current, dayPlanAttachments: current.dayPlanAttachments.map((item) => item.id === attachment.id ? updated ?? { ...item, title } : item) }));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The attachment could not be renamed.");
    } finally {
      window.setTimeout(() => setSaving(false), 350);
    }
  }

  async function deleteDayPlanAttachment(attachment: DayPlanAttachment) {
    if (!window.confirm(`Remove “${attachment.title}”?`)) return;
    setSaving(true);
    try {
      const response = await requestWithTimeout(`/api/day-plan-attachments?id=${encodeURIComponent(attachment.id)}`, { method: "DELETE" }, 20_000);
      const result = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(String(result.error ?? "The attachment could not be removed."));
      setData((current) => ({ ...current, dayPlanAttachments: current.dayPlanAttachments.filter((item) => item.id !== attachment.id) }));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The attachment could not be removed.");
    } finally {
      window.setTimeout(() => setSaving(false), 350);
    }
  }

  function updateFocusOrder(next: string[], save = false) {
    setData((current) => ({ ...current, focusOrder: next }));
    if (save) void post({ action: "saveFocusOrder", focusOrder: next });
  }

  function updateHierarchyState(notebookId: string, state: HierarchyState) {
    setData((current) => ({
      ...current,
      hierarchyStates: { ...current.hierarchyStates, [notebookId]: state },
    }));
    void post({ action: "saveHierarchyState", notebookId, ...state }).catch(() => {
      // The device-local copy still preserves the layout if a background save is interrupted.
    });
  }

  async function createDayPlan(planDate: string, category: DayPlanItem["category"], title: string, plannedTime: string, assigneeId: string | null, details: DayPlanDetail[]) {
    const result = await post({ action: "createDayPlan", planDate, category, title, plannedTime: plannedTime || null, assigneeId, details });
    const item = result.item as DayPlanItem | undefined;
    const createdDetails = Array.isArray(result.details) ? result.details as DayPlanDetail[] : [];
    if (!item) return;
    setData((current) => ({
      ...current,
      dayPlanItems: [...current.dayPlanItems, item],
      dayPlanDetails: [...current.dayPlanDetails, ...createdDetails],
    }));
  }

  function updateDayPlan(next: DayPlanItem, save = false) {
    localDataVersion.current += 1;
    setData((current) => ({ ...current, dayPlanItems: current.dayPlanItems.map((item) => item.id === next.id ? next : item) }));
    if (save) void post({ action: "saveDayPlan", item: next });
  }

  function updateDayPlanDetails(chainId: string, details: DayPlanDetail[], save = false) {
    localDataVersion.current += 1;
    setData((current) => ({
      ...current,
      dayPlanDetails: [...current.dayPlanDetails.filter((item) => item.chainId !== chainId), ...details],
    }));
    if (!save) return;
    const timerKey = `day-details:${chainId}`;
    if (saveTimers.current[timerKey]) window.clearTimeout(saveTimers.current[timerKey]);
    saveTimers.current[timerKey] = window.setTimeout(() => {
      delete saveTimers.current[timerKey];
      void post({ action: "saveDayPlanDetails", chainId, details });
    }, 120);
  }

  async function resolveDayPlan(dayPlanId: string, status: "Completed" | "Abandoned" | "Cancelled") {
    const previous = data.dayPlanItems.find((item) => item.id === dayPlanId);
    if (!previous) return;
    const resolvedAt = new Date().toISOString();
    setData((current) => ({
      ...current,
      dayPlanItems: current.dayPlanItems.map((item) => item.id === dayPlanId ? { ...item, status, resolvedAt, updatedAt: resolvedAt, reminderClosedAt: item.reminderRepeat === "daily-until-closed" ? item.reminderClosedAt : item.reminderClosedAt ?? localDateTime() } : item),
    }));
    try {
      await post({ action: "resolveDayPlan", dayPlanId, status });
    } catch (error) {
      setData((current) => ({ ...current, dayPlanItems: current.dayPlanItems.map((item) => item.id === dayPlanId ? previous : item) }));
      throw error;
    }
  }

  async function postponeDayPlan(dayPlanId: string, nextDate: string) {
    const previous = data.dayPlanItems.find((item) => item.id === dayPlanId);
    if (!previous) return;
    setData((current) => ({ ...current, dayPlanItems: current.dayPlanItems.map((item) => item.id === dayPlanId ? { ...item, status: "Postponed", resolvedAt: new Date().toISOString() } : item) }));
    try {
      const result = await post({ action: "postponeDayPlan", dayPlanId, nextDate });
      const item = result.item as DayPlanItem | undefined;
      if (item) setData((current) => ({ ...current, dayPlanItems: [...current.dayPlanItems, item] }));
      setSelectedDayDate(nextDate);
      setCalendarMonth(nextDate.slice(0, 7));
    } catch (error) {
      setData((current) => ({ ...current, dayPlanItems: current.dayPlanItems.map((item) => item.id === dayPlanId ? previous : item) }));
      throw error;
    }
  }

  async function linkDayPlanToJournal(dayPlanId: string, pageId: string) {
    const result = await post({ action: "linkDayPlanToJournal", dayPlanId, pageId });
    const chainId = String(result.chainId ?? "");
    const linkedPageId = String(result.pageId ?? pageId);
    setData((current) => ({
      ...current,
      dayPlanItems: current.dayPlanItems.map((item) => item.chainId === chainId ? { ...item, linkedPageId } : item),
    }));
  }

  const pageById = useMemo(() => new Map(data.pages.map((page) => [page.id, page])), [data.pages]);
  const pageParentIds = useMemo(() => new Set(data.pages.flatMap((page) => page.parentId ? [page.parentId] : [])), [data.pages]);
  const pageDepthById = useMemo(() => {
    const depths = new Map<string, number>();
    const depthFor = (page: Page, visiting = new Set<string>()): number => {
      const cached = depths.get(page.id);
      if (cached !== undefined) return cached;
      if (!page.parentId || visiting.has(page.id)) {
        depths.set(page.id, 0);
        return 0;
      }
      const parent = pageById.get(page.parentId);
      if (!parent) {
        depths.set(page.id, 0);
        return 0;
      }
      const nextVisiting = new Set(visiting);
      nextVisiting.add(page.id);
      const depth = Math.min(10, depthFor(parent, nextVisiting) + 1);
      depths.set(page.id, depth);
      return depth;
    };
    for (const page of data.pages) depthFor(page);
    return depths;
  }, [data.pages, pageById]);
  const selectedPage = pageById.get(selectedPageId);
  const selectedMeeting = data.meetings.find((meeting) => meeting.id === selectedMeetingId) ?? data.meetings[0];
  const selectedPerson = data.people.find((person) => person.id === selectedPersonId) ?? data.people[0];

  function updatePage(next: Page, save = false) {
    localDataVersion.current += 1;
    setData((current) => ({ ...current, pages: current.pages.map((page) => page.id === next.id ? next : page) }));
    if (save) {
      if (saveTimers.current[next.id]) window.clearTimeout(saveTimers.current[next.id]);
      saveTimers.current[next.id] = window.setTimeout(() => {
        delete saveTimers.current[next.id];
        void post({ action: "savePage", page: next }).then((result) => {
          setData((current) => ({ ...current, pages: current.pages.map((page) => page.id === next.id ? {
            ...page,
            updatedAt: String(result.updatedAt ?? new Date().toISOString()),
            startDate: "startDate" in result ? (result.startDate ? String(result.startDate) : null) : page.startDate,
            dueDate: "dueDate" in result ? (result.dueDate ? String(result.dueDate) : null) : page.dueDate,
            completedDate: "completedDate" in result ? (result.completedDate ? String(result.completedDate) : null) : page.completedDate,
            reminderDate: "reminderDate" in result ? (result.reminderDate ? String(result.reminderDate) : null) : page.reminderDate,
            reminderRepeat: "reminderRepeat" in result ? String(result.reminderRepeat) as ReminderRepeat : page.reminderRepeat,
            reminderEndDate: "reminderEndDate" in result ? (result.reminderEndDate ? String(result.reminderEndDate) : null) : page.reminderEndDate,
            reminderClosedAt: "reminderClosedAt" in result ? (result.reminderClosedAt ? String(result.reminderClosedAt) : null) : page.reminderClosedAt,
          } : page) }));
        });
      }, 180);
    }
  }

  function updateOutline(pageId: string, items: OutlineItem[], save = false) {
    localDataVersion.current += 1;
    setData((current) => ({
      ...current,
      pages: save ? current.pages.map((page) => page.id === pageId ? { ...page, updatedAt: new Date().toISOString() } : page) : current.pages,
      outlineItems: [...current.outlineItems.filter((item) => item.pageId !== pageId), ...items],
    }));
    const timerKey = `outline:${pageId}`;
    if (saveTimers.current[timerKey]) window.clearTimeout(saveTimers.current[timerKey]);
    const persist = () => void post({ action: "saveOutline", pageId, items }).then((result) => {
      setData((current) => ({ ...current, pages: current.pages.map((page) => page.id === pageId ? { ...page, updatedAt: String(result.updatedAt ?? new Date().toISOString()) } : page) }));
    });
    if (save) {
      delete saveTimers.current[timerKey];
      persist();
    } else {
      saveTimers.current[timerKey] = window.setTimeout(() => {
        delete saveTimers.current[timerKey];
        persist();
      }, 650);
    }
  }

  function toggleToolbarTodo(outlineId?: string) {
    if (!selectedPage) return;
    const items = data.outlineItems.filter((item) => item.pageId === selectedPage.id).sort((a, b) => a.position - b.position);
    const targetId = outlineId && items.some((item) => item.id === outlineId) ? outlineId : items[0]?.id;
    if (!targetId) return;
    const next = items.map((item) => item.id === targetId
      ? item.isTask
        ? { ...item, completed: !item.completed, reminderClosedAt: !item.completed && item.reminderRepeat !== "daily-until-closed" && item.reminderDate ? localDateTime() : item.reminderClosedAt }
        : { ...item, isTask: true, completed: false }
      : item);
    updateOutline(selectedPage.id, next, true);
  }

  function markSelectedPageImportant() {
    if (selectedPage) updatePage({ ...selectedPage, priority: "High" }, true);
  }

  function beginDrag(event: React.DragEvent, item: DragItem) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", JSON.stringify(item));
    dragItemRef.current = item;
    setDragItem(item);
  }

  function endDrag() {
    dragItemRef.current = null;
    setDragItem(null);
    setDragOverKey("");
  }

  function draggedItem(event: React.DragEvent) {
    if (dragItemRef.current) return dragItemRef.current;
    try {
      return JSON.parse(event.dataTransfer.getData("text/plain")) as DragItem;
    } catch {
      return null;
    }
  }

  async function moveSectionDirect(item: SectionDragItem, targetId: string | null) {
    if (item.id === targetId) return endDrag();
    try {
      await post({ action: "moveSection", sectionId: item.id, sectionKind: item.sectionKind, targetId });
      await loadState();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The section could not be moved.");
    } finally {
      endDrag();
    }
  }

  async function reorderSectionDirect(item: SectionDragItem, targetSectionId: string, placement: "before" | "after") {
    if (item.id === targetSectionId) return endDrag();
    try {
      await post({ action: "reorderSection", sectionId: item.id, targetSectionId, placement });
      await loadState();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The section order could not be changed.");
    } finally {
      endDrag();
    }
  }

  async function promoteSection(sectionId: string) {
    try {
      const result = await post({ action: "promoteSection", sectionId });
      setSelectedSubsectionId(sectionId);
      if (result.departmentId) setSelectedDepartmentId(String(result.departmentId));
      await loadState();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The subsection could not be promoted.");
    }
  }

  function sectionDropTarget(clientX: number, clientY: number, item: SectionDragItem) {
    const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const rootTarget = element?.closest<HTMLElement>("[data-section-root]");
    if (rootTarget && item.sectionKind === "department") return { targetId: null, dragKey: "section-root" };
    const sectionTarget = element?.closest<HTMLElement>("[data-section-id]");
    const targetId = sectionTarget?.dataset.sectionId;
    if (!targetId || targetId === item.id) return null;
    const bounds = sectionTarget.getBoundingClientRect();
    const placement = clientY < bounds.top + bounds.height / 2 ? "before" as const : "after" as const;
    return { targetId, placement, dragKey: `section-${placement}:${targetId}` };
  }

  function beginSectionMouseDrag(event: React.MouseEvent<HTMLElement>, item: SectionDragItem) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    sectionMouseCleanupRef.current?.();
    dragItemRef.current = item;
    setDragItem(item);
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    const cleanup = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      if (sectionMouseCleanupRef.current === cleanup) sectionMouseCleanupRef.current = null;
    };
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!moved && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 5) return;
      moved = true;
      const target = sectionDropTarget(moveEvent.clientX, moveEvent.clientY, item);
      setDragOverKey(target?.dragKey ?? "");
    };
    const handleMouseUp = (upEvent: MouseEvent) => {
      const target = moved ? sectionDropTarget(upEvent.clientX, upEvent.clientY, item) : null;
      cleanup();
      if (!target) return endDrag();
      if (!target.targetId) void moveSectionDirect(item, null);
      else void reorderSectionDirect(item, target.targetId, "placement" in target ? target.placement : "before");
    };
    sectionMouseCleanupRef.current = cleanup;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }

  async function movePageDirect(pageId: string, subsectionId: string, parentPageId: string | null) {
    try {
      const result = await post({ action: "movePage", pageId, subsectionId, parentPageId });
      const subsection = data.subsections.find((item) => item.id === subsectionId);
      const department = data.departments.find((item) => item.id === subsectionId);
      if (subsection) setSelectedDepartmentId(subsection.departmentId);
      else if (department) setSelectedDepartmentId(department.id);
      setSelectedSubsectionId(subsectionId);
      await loadState({ pageId: String(result.pageId) });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The page could not be moved.");
    } finally {
      endDrag();
    }
  }

  async function promotePageOneLevel(pageId: string) {
    const page = data.pages.find((item) => item.id === pageId);
    if (!page?.parentId) return;
    const parentPage = data.pages.find((item) => item.id === page.parentId);
    await movePageDirect(page.id, page.subsectionId, parentPage?.parentId ?? null);
  }

  async function makeSubpageOfPageAbove(pageId: string) {
    const page = data.pages.find((item) => item.id === pageId);
    if (!page) return;
    const sectionPages = data.pages.filter((item) => item.subsectionId === page.subsectionId);
    const pageIndex = sectionPages.findIndex((item) => item.id === pageId);
    const pageAbove = pageIndex > 0 ? sectionPages[pageIndex - 1] : null;
    if (!pageAbove) {
      window.alert("This is already the first page. Place another page above it before making it a subpage.");
      return;
    }
    await movePageDirect(page.id, page.subsectionId, pageAbove.id);
  }

  async function handleDropOnPage(event: React.DragEvent, targetPage: Page) {
    event.preventDefault();
    event.stopPropagation();
    const item = draggedItem(event);
    if (!item || item.kind !== "page" || item.id === targetPage.id) return endDrag();
    try {
      await post({ action: "reorderPage", pageId: item.id, targetPageId: targetPage.id });
      await loadState({ pageId: item.id });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The page order could not be changed.");
    } finally {
      endDrag();
    }
  }

  async function handleDropOnSection(event: React.DragEvent, target: SectionNode) {
    event.preventDefault();
    event.stopPropagation();
    const item = draggedItem(event);
    if (!item) return endDrag();
    if (item.kind === "page") {
      await movePageDirect(item.id, target.id, null);
      return;
    }
    if (item.id === target.id) return endDrag();
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const placement = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    await reorderSectionDirect(item, target.id, placement);
  }

  async function handleDropOnPageRoot(event: React.DragEvent) {
    event.preventDefault();
    const item = draggedItem(event);
    if (!item || item.kind !== "page") return endDrag();
    await movePageDirect(item.id, selectedSubsectionId, null);
  }

  async function handleDropOnSectionRoot(event: React.DragEvent) {
    event.preventDefault();
    const item = draggedItem(event);
    if (!item || item.kind !== "section" || item.sectionKind !== "department") return endDrag();
    await moveSectionDirect(item, null);
  }

  function openPage(page: Page, view: ViewName = "journal") {
    void loadPageContent(page.id).catch((error) => console.error("[page-content]", error));
    const subsection = data.subsections.find((item) => item.id === page.subsectionId);
    const department = data.departments.find((item) => item.id === page.subsectionId);
    setSelectedPageId(page.id);
    setSelectedSubsectionId(page.subsectionId);
    if (subsection) {
      setSelectedDepartmentId(subsection.departmentId);
      setSelectedNotebookId(subsection.notebookId);
    } else if (department) {
      setSelectedDepartmentId(department.id);
      setSelectedNotebookId(department.notebookId);
    }
    setActiveView(view);
    if (view === "journal") setMobileJournalPane("page");
    setSearch("");
  }

  function openSource(page: Page) {
    if (!page.sourceId) return;
    setSelectedMeetingId(page.sourceId);
    setSelectedAgendaPosition(page.sourceAgenda ?? 1);
    setActiveView("meetings");
  }

  function openPerson(personId: string) {
    setSelectedPersonId(personId);
    setActiveView("people");
  }

  function openMyDay() {
    const today = localDate();
    setSelectedDayDate(today);
    setCalendarMonth(today.slice(0, 7));
    setActiveView("my-day");
  }

  function openDashboardFilter(filter: string) {
    const firstMatch = data.pages.find((page) => pageMatchesFilter(page, filter));
    setJournalFilter(filter);
    if (firstMatch) {
      const section = journalSection(data, firstMatch.subsectionId);
      const departmentId = data.subsections.find((item) => item.id === firstMatch.subsectionId)?.departmentId
        ?? data.departments.find((item) => item.id === firstMatch.subsectionId)?.id
        ?? "";
      setSelectedPageId(firstMatch.id);
      setSelectedSubsectionId(firstMatch.subsectionId);
      setSelectedDepartmentId(departmentId);
      if (section) setSelectedNotebookId(section.notebookId);
    }
    setMobileJournalPane("pages");
    setActiveView("journal");
  }

  function openDashboardDepartment(departmentId: string) {
    const department = data.departments.find((item) => item.id === departmentId);
    if (!department) return;
    setJournalFilter("all");
    setSelectedNotebookId(department.notebookId);
    setSelectedDepartmentId(department.id);
    setSelectedSubsectionId(department.id);
    setSelectedPageId(data.pages.find((page) => page.subsectionId === department.id)?.id ?? "");
    setSectionExpansionRequest((current) => ({ id: department.id, request: current.request + 1 }));
    setMobileJournalPane("sections");
    setActiveView("journal");
  }

  function selectJournalFilter(filter: string) {
    setJournalFilter(filter);
    setMobileJournalPane("pages");
    if (filter === "all") return;
    const notebookSections = notebookSectionIds(data, selectedNotebookId);
    const firstMatch = data.pages.find((page) => notebookSections.has(page.subsectionId) && (filter === "reminders" ? pageHasReminder(page, data) : pageMatchesFilter(page, filter)));
    if (firstMatch) {
      setSelectedPageId(firstMatch.id);
      setSelectedSubsectionId(firstMatch.subsectionId);
    }
  }

  function selectDepartment(departmentId: string) {
    setJournalFilter("all");
    setSelectedDepartmentId(departmentId);
    setSelectedSubsectionId(departmentId);
    const department = data.departments.find((item) => item.id === departmentId);
    if (department) setSelectedNotebookId(department.notebookId);
    const page = data.pages.find((item) => item.subsectionId === departmentId);
    setSelectedPageId(page?.id ?? "");
    setMobileJournalPane("pages");
  }

  function selectSubsection(subsection: Subsection) {
    setJournalFilter("all");
    setSelectedDepartmentId(subsection.departmentId);
    setSelectedNotebookId(subsection.notebookId);
    setSelectedSubsectionId(subsection.id);
    const page = data.pages.find((item) => item.subsectionId === subsection.id);
    setSelectedPageId(page?.id ?? "");
    setMobileJournalPane("pages");
  }

  async function createBlankPage(subsectionId = selectedSubsectionId, parentPageId?: string) {
    try {
      if (!journalSection(data, subsectionId)) throw new Error("Select a section before adding a page.");
      const result = await post({ action: "createPage", subsectionId, parentPageId: parentPageId || null });
      const pageId = String(result.pageId);
      const createdPage = result.page as Page | undefined;
      const createdOutline = result.outlineItem as OutlineItem | undefined;
      if (createdPage) {
        setData((current) => ({
          ...current,
          pages: [...current.pages, createdPage].sort((left, right) => left.serial.localeCompare(right.serial, undefined, { numeric: true })),
          outlineItems: createdOutline ? [...current.outlineItems, createdOutline] : current.outlineItems,
        }));
        loadedPageIds.current.add(pageId);
      }
      const subsection = data.subsections.find((item) => item.id === subsectionId);
      const department = data.departments.find((item) => item.id === subsectionId);
      if (subsection) setSelectedDepartmentId(subsection.departmentId);
      else if (department) setSelectedDepartmentId(department.id);
      setSelectedSubsectionId(subsectionId);
      setJournalFilter("all");
      setActiveView("journal");
      setMobileJournalPane("page");
      setSelectedPageId(pageId);
      if (!createdPage) await loadState({ pageId });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The page could not be created.");
    }
  }

  async function createSection(parentId?: string) {
    const name = window.prompt(parentId ? "Name this new subsection:" : "Name this new section:");
    if (!name?.trim()) return;
    try {
      const result = await post({ action: "createSection", parentId: parentId || null, notebookId: selectedNotebookId, name: name.trim() });
      const sectionId = String(result.sectionId);
      if (result.sectionKind === "department" && result.section) {
        setData((current) => ({ ...current, departments: [...current.departments, result.section as Department] }));
      } else if (result.sectionKind === "subsection" && result.section) {
        setData((current) => ({ ...current, subsections: [...current.subsections, result.section as Subsection] }));
      } else {
        await loadState();
      }
      setSelectedDepartmentId(String(result.departmentId ?? sectionId));
      setSelectedSubsectionId(sectionId);
      setSelectedPageId("");
      setJournalFilter("all");
      setActiveView("journal");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The section could not be created.");
    }
  }

  async function createNotebook() {
    const name = window.prompt("Name the new notebook:")?.trim();
    if (!name) return;
    try {
      const result = await post({ action: "createNotebook", name });
      await loadState();
      setSelectedNotebookId(String(result.notebookId));
      setSelectedDepartmentId(String(result.sectionId));
      setSelectedSubsectionId(String(result.subsectionId));
      setJournalFilter("all");
      setActiveView("journal");
      setMobileJournalPane("sections");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The notebook could not be created.");
    }
  }

  async function createPerson(name: string, role: string) {
    await post({ action: "createPerson", name, role });
    await loadState();
  }

  async function updatePerson(personId: string, name: string, role: string) {
    await post({ action: "updatePerson", personId, name, role });
    await loadState();
  }

  async function deletePerson(personId: string) {
    const person = data.people.find((item) => item.id === personId);
    if (!person || !window.confirm(`Remove “${person.name}” from the team list? Existing tasks will become unassigned.`)) return;
    await post({ action: "deletePerson", personId });
    await loadState();
  }

  async function requestReminderPermission(sendTest = false) {
    const desktopRequest = window.matchMedia("(min-width: 761px)").matches;
    if (typeof Notification === "undefined") {
      setPushStatus("unsupported");
      window.alert(desktopRequest ? "This browser does not support reminder notifications." : "On iPhone, open this journal from the Home Screen to enable notifications.");
      return;
    }
    try {
      const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
      if (permission !== "granted") {
        setPushStatus(permission === "denied" ? "denied" : "off");
        if (desktopRequest && permission === "denied") window.alert("Notifications are blocked for this journal. Allow notifications for this site in your browser settings, then press Enable notifications again.");
        return;
      }
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setPushStatus("unsupported");
        window.alert(desktopRequest ? "This browser can show notifications while the journal is open, but it does not support background reminder delivery." : "On iPhone, open this journal from the Home Screen to enable notifications.");
        return;
      }
      const keyResponse = await requestWithTimeout("/api/push", { cache: "no-store" }, 15_000);
      const keyResult = await keyResponse.json() as { publicKey?: string; configured?: boolean; error?: string };
      if (!keyResponse.ok || !keyResult.configured || !keyResult.publicKey) throw new Error(keyResult.error || "Notifications are not configured yet.");
      const registration = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
      await registration.update();
      await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      const applicationServerKey = decodeApplicationServerKey(keyResult.publicKey);
      if (subscription && !pushSubscriptionUsesKey(subscription, applicationServerKey)) {
        await requestWithTimeout("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "unsubscribe", subscription: subscription.toJSON() }) }, 15_000);
        await subscription.unsubscribe();
        subscription = null;
      }
      if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      const response = await requestWithTimeout("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: sendTest ? "test" : "subscribe", subscription: subscription.toJSON() }),
      }, 15_000);
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || result.ok === false) throw new Error(result.error || "The notification service did not accept this device.");
      setPushStatus("enabled");
      setReminderClock(Date.now());
    } catch (error) {
      setPushStatus("error");
      window.alert(error instanceof Error ? error.message : "Notifications could not be enabled.");
    }
  }

  async function toggleReminderNotifications() {
    if (pushStatus === "checking") return;
    if (pushStatus !== "enabled") {
      await requestReminderPermission(true);
      return;
    }
    setPushStatus("checking");
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Notifications are not available on this device.");
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const response = await requestWithTimeout("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "unsubscribe", subscription: subscription.toJSON() }),
        }, 15_000);
        const result = await response.json() as { ok?: boolean; error?: string };
        if (!response.ok || result.ok === false) throw new Error(result.error || "Notifications could not be turned off.");
        await subscription.unsubscribe();
      }
      notifiedReminderIds.current.clear();
      setPushStatus("off");
    } catch (error) {
      setPushStatus("enabled");
      window.alert(error instanceof Error ? error.message : "Notifications could not be turned off.");
    }
  }

  function toggleMobileZoom() {
    const locked = !zoomLocked;
    setZoomLocked(locked);
    window.localStorage.setItem("journal-mobile-zoom", locked ? "locked" : "allowed");
    const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    viewport?.setAttribute("content", locked
      ? "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
      : "width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes, viewport-fit=cover");
  }

  function beginPaneResize(event: React.MouseEvent<HTMLDivElement>, paneIndex: 0 | 1) {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const initial = journalPaneWidths[paneIndex];
    const minimum = paneIndex === 0 ? 190 : 220;
    const maximum = paneIndex === 0 ? 430 : 520;
    const onMove = (moveEvent: MouseEvent) => {
      const width = Math.max(minimum, Math.min(maximum, initial + moveEvent.clientX - startX));
      setJournalPaneWidths((current) => paneIndex === 0 ? [width, current[1]] : [current[0], width]);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.classList.remove("resizing-panes");
    };
    document.body.classList.add("resizing-panes");
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function autoFitPane(event: React.MouseEvent<HTMLDivElement>, paneIndex: 0 | 1) {
    const pane = event.currentTarget.previousElementSibling as HTMLElement | null;
    const selector = paneIndex === 0 ? ".section-copy strong, .focus-filter-row button span" : ".page-card > strong, .pane-title-row h2";
    const labels = pane ? Array.from(pane.querySelectorAll<HTMLElement>(selector)) : [];
    const contentWidth = labels.reduce((largest, label) => Math.max(largest, label.scrollWidth), 0);
    const minimum = paneIndex === 0 ? 210 : 250;
    const maximum = paneIndex === 0 ? 430 : 520;
    const allowance = paneIndex === 0 ? 115 : 72;
    const width = Math.max(minimum, Math.min(maximum, contentWidth + allowance));
    setJournalPaneWidths((current) => paneIndex === 0 ? [width, current[1]] : [current[0], width]);
  }

  function selectNotebook(notebookId: string) {
    const firstDepartment = data.departments.filter((item) => item.notebookId === notebookId).sort((a, b) => a.position - b.position)[0];
    const firstSubsection = data.subsections.filter((item) => item.notebookId === notebookId).sort((a, b) => a.serialPrefix.localeCompare(b.serialPrefix, undefined, { numeric: true }))[0];
    const firstSection = firstSubsection ?? firstDepartment;
    const firstPage = firstSection && data.pages.find((item) => item.subsectionId === firstSection.id);
    setSelectedNotebookId(notebookId);
    if (firstDepartment) setSelectedDepartmentId(firstDepartment.id);
    setSelectedSubsectionId(firstSection?.id ?? "");
    setSelectedPageId(firstPage?.id ?? "");
    setJournalFilter("all");
    setActiveView("journal");
    setMobileJournalPane("sections");
  }

  async function renameSection(sectionId: string, sectionKind: SectionKind) {
    const current = sectionKind === "department" ? data.departments.find((item) => item.id === sectionId) : data.subsections.find((item) => item.id === sectionId);
    const name = window.prompt("Rename this section:", current?.name ?? "");
    if (!name?.trim() || name.trim() === current?.name) return;
    await post({ action: "renameSection", sectionId, sectionKind, name: name.trim() });
    await loadState();
  }

  async function renamePage(pageId: string) {
    const page = data.pages.find((item) => item.id === pageId);
    if (!page) return;
    const title = window.prompt("Rename this page:", page.title);
    if (!title?.trim() || title.trim() === page.title) return;
    await post({ action: "savePage", page: { ...page, title: title.trim() } });
    await loadState({ pageId });
  }

  async function duplicatePage(pageId: string) {
    const result = await post({ action: "duplicatePage", pageId });
    await loadState({ pageId: String(result.pageId) });
  }

  async function deletePage(pageId: string) {
    const page = data.pages.find((item) => item.id === pageId);
    if (!page || !window.confirm(`Delete “${page.title}” and all of its subpages? This cannot be undone.`)) return;
    await post({ action: "deletePage", pageId });
    const remaining = data.pages.find((item) => item.id !== pageId && item.subsectionId === page.subsectionId);
    await loadState({ pageId: remaining?.id });
    if (remaining) setSelectedPageId(remaining.id);
  }

  async function deleteSection(sectionId: string, sectionKind: SectionKind) {
    const section = sectionKind === "department" ? data.departments.find((item) => item.id === sectionId) : data.subsections.find((item) => item.id === sectionId);
    if (!section || !window.confirm(`Delete “${section.name}”, its child sections, and all pages inside them? This cannot be undone.`)) return;
    await post({ action: "deleteSection", sectionId, sectionKind });
    await loadState();
    const fallback = data.subsections.find((item) => item.id !== sectionId);
    if (fallback) selectSubsection(fallback);
  }

  async function createMeeting() {
    const result = await post({ action: "createMeeting" });
    await loadState({ meetingId: String(result.meetingId) });
    setSelectedAgendaPosition(1);
    setActiveView("meetings");
  }

  const searchResults = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return { pages: [] as Page[], meetings: [] as Meeting[] };
    return {
      pages: data.pages.filter((page) => `${page.serial} ${page.title} ${page.notes}`.toLowerCase().includes(query)).slice(0, 6),
      meetings: data.meetings.filter((meeting) => `${meeting.number} ${meeting.purpose}`.toLowerCase().includes(query)).slice(0, 3),
    };
  }, [data, search]);

  if (loading) {
    return <main className="loading-screen"><div className="notebook-logo">PO</div><h1>Opening Plant Operations Journal</h1><p>Preparing your departments, pages and meeting records…</p></main>;
  }

  if (loadError) {
    return <main className="loading-screen error-screen"><div className="notebook-logo">!</div><h1>Journal could not open</h1><p>{loadError}</p><button onClick={() => { setLoading(true); void loadState(); }}>Try again</button></main>;
  }

  const navItems: { id: ViewName; label: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "my-day", label: "My Day" },
    { id: "journal", label: "Journal" },
    { id: "meetings", label: "Meetings" },
    { id: "people", label: "Team" },
  ];
  const selectedNotebook = data.notebooks.find((item) => item.id === selectedNotebookId) ?? data.notebooks[0];
  const reminderNow = new Date(reminderClock);
  const selectedSubsection = journalSection(data, selectedSubsectionId);
  const notebookSubsectionIds = notebookSectionIds(data, selectedNotebookId);
  const journalPagesUncollapsed = data.pages.filter((page) => notebookSubsectionIds.has(page.subsectionId) && (journalFilter === "all"
    ? page.subsectionId === selectedSubsectionId
    : journalFilter === "reminders" ? pageHasReminder(page, data) : pageMatchesFilter(page, journalFilter)));
  const globalJournalView = journalFilter !== "all";
  const journalPages = globalJournalView ? journalPagesUncollapsed : journalPagesUncollapsed.filter((page) => {
    let parentId = page.parentId;
    const seen = new Set<string>();
    while (parentId && !seen.has(parentId)) {
      if (collapsedPages.has(parentId)) return false;
      seen.add(parentId);
      parentId = pageById.get(parentId)?.parentId ?? null;
    }
    return true;
  });

  return (
    <div className={`app-shell theme-${appTheme}`} style={{ "--app-font-family": appFontFamily(appFont) } as React.CSSProperties}>
      <header className="title-bar">
        <div className="brand">
          <div className="brand-mark brand-mark-static">P</div>
          <button type="button" className="brand-mark mobile-nav-trigger" aria-label="Open main menu" aria-expanded={mobileNavOpen} onClick={() => { setMobileProfileOpen(false); setMobileNavOpen(true); }}>P</button>
          <div><strong>Plant Operations</strong><span>Personal Journal</span></div>
        </div>
        <div ref={desktopSearchRef} className="global-search-wrap">
          <Icon name="search" />
          <input value={search} onFocus={() => setDesktopSearchActive(true)} onChange={(event) => { setSearch(event.target.value); setDesktopSearchActive(true); }} placeholder="Search pages, serial numbers and meetings" aria-label="Search journal" />
          {search && desktopSearchActive && (
            <div className="search-results">
              <small>Pages</small>
              {searchResults.pages.map((page) => <button key={page.id} onClick={() => openPage(page)}><span>{page.serial}</span><strong>{page.title}</strong></button>)}
              <small>Meetings</small>
              {searchResults.meetings.map((meeting) => <button key={meeting.id} onClick={() => { setSelectedMeetingId(meeting.id); setActiveView("meetings"); setSearch(""); }}><span>{meeting.number}</span><strong>{meeting.purpose}</strong></button>)}
              {!searchResults.pages.length && !searchResults.meetings.length && <p>No matching pages or meetings.</p>}
            </div>
          )}
        </div>
        <div className="save-state">
          <label className="app-theme-menu">
            <span>Theme</span>
            <select aria-label="Application theme" value={appTheme} onChange={(event) => setAppTheme(event.target.value as AppTheme)}>
              {appThemes.map((theme) => <option value={theme} key={theme}>{theme[0].toUpperCase() + theme.slice(1)}</option>)}
            </select>
          </label>
          <button type="button" className="mobile-search-button" aria-label="Search pages, serial numbers and meetings" onClick={() => { setMobileNavOpen(false); setMobileProfileOpen(false); setMobileSearchOpen(true); }}><Icon name="search" /><b>Search</b></button>
          <button type="button" className={`push-notification-button ${pushStatus}`} aria-pressed={pushStatus === "enabled"} onClick={() => void toggleReminderNotifications()} title={pushStatus === "enabled" ? "Turn off reminder notifications on this device" : pushStatus === "denied" ? "Notifications are blocked in browser settings" : "Enable reminder notifications on this device"}>
            <span>{pushStatus === "enabled" ? "●" : "○"}</span>{pushStatus === "enabled" ? "Notifications on" : pushStatus === "checking" ? "Checking…" : pushStatus === "denied" ? "Notifications blocked" : pushStatus === "error" ? "Retry notifications" : "Enable notifications"}
          </button>
          <button type="button" className={`zoom-toggle-button ${zoomLocked ? "locked" : "allowed"}`} aria-pressed={zoomLocked} aria-label={zoomLocked ? "Allow pinch zoom" : "Lock page zoom"} onClick={toggleMobileZoom}>{zoomLocked ? "1×" : "±"}</button>
          <span className={saving ? "saving" : "saved"}>{saving ? "Saving…" : "All changes saved"}</span>
          <button type="button" className="profile-dot" aria-label="Open profile menu" aria-expanded={mobileProfileOpen} onClick={() => { setMobileNavOpen(false); setMobileProfileOpen((open) => !open); }}>FA</button>
          <button type="button" className="mobile-profile-trigger" aria-label="Open profile menu" aria-expanded={mobileProfileOpen} onClick={() => { setMobileNavOpen(false); setMobileProfileOpen((open) => !open); }}>FA</button>
        </div>
      </header>

      {mobileNavOpen && typeof document !== "undefined" && createPortal(<div className="mobile-menu-backdrop" role="presentation" onPointerDown={(event) => { if (event.currentTarget === event.target) setMobileNavOpen(false); }}>
        <aside className="mobile-navigation-drawer" role="dialog" aria-modal="true" aria-label="Main menu">
          <header><div className="mobile-drawer-brand"><span>P</span><div><strong>Plant Operations</strong><small>Personal Journal</small></div></div><button type="button" aria-label="Close main menu" onClick={() => setMobileNavOpen(false)}>×</button></header>
          <nav aria-label="Application sections">
            {navItems.map((item) => <button type="button" className={activeView === item.id ? "active" : ""} key={item.id} onClick={() => { setMobileNavOpen(false); item.id === "my-day" ? openMyDay() : setActiveView(item.id); }}>
              {item.id === "my-day" ? <span className="my-day-date-icon" aria-hidden="true">{String(reminderNow.getDate()).padStart(2, "0")}</span> : <Icon name={item.id} />}
              <strong>{item.label}</strong><span aria-hidden="true">›</span>
            </button>)}
          </nav>
        </aside>
      </div>, document.body)}

      {mobileProfileOpen && typeof document !== "undefined" && createPortal(<div className="mobile-profile-backdrop" role="presentation" onPointerDown={(event) => { if (event.currentTarget === event.target) setMobileProfileOpen(false); }}>
        <aside className="mobile-profile-menu" role="dialog" aria-modal="true" aria-label="Profile menu">
          <header><span>FA</span><div><strong>Fahim Asghar</strong><small>Plant Operations</small></div><button type="button" aria-label="Close profile menu" onClick={() => setMobileProfileOpen(false)}>×</button></header>
          <div className="mobile-profile-actions">
            <button type="button" className={pushStatus === "enabled" ? "enabled" : ""} aria-pressed={pushStatus === "enabled"} onClick={() => void toggleReminderNotifications()}><span className="profile-menu-symbol" aria-hidden="true">{pushStatus === "enabled" ? "●" : "○"}</span><span><strong>Notifications</strong><small>{pushStatus === "enabled" ? "On" : pushStatus === "checking" ? "Checking…" : pushStatus === "denied" ? "Blocked in settings" : pushStatus === "error" ? "Tap to retry" : "Off"}</small></span><b>{pushStatus === "enabled" ? "On" : "Off"}</b></button>
            <button type="button" aria-pressed={!zoomLocked} onClick={toggleMobileZoom}><span className="profile-menu-symbol" aria-hidden="true">⌕</span><span><strong>Zoom</strong><small>{zoomLocked ? "Fixed at 1×" : "Pinch zoom enabled"}</small></span><b>{zoomLocked ? "1×" : "On"}</b></button>
            <div className="mobile-display-setting"><div><span aria-hidden="true">◐</span><strong>Display</strong></div><div className="mobile-display-options" role="group" aria-label="Display mode">
              {(["day", "night", "auto"] as DisplayMode[]).map((mode) => <button type="button" className={displayMode === mode ? "active" : ""} aria-pressed={displayMode === mode} key={mode} onClick={() => setDisplayMode(mode)}>{mode === "day" ? "Day" : mode === "night" ? "Night" : "Auto"}</button>)}
            </div></div>
            <div className="mobile-theme-setting"><div><span aria-hidden="true">◆</span><strong>Theme</strong></div><div className="mobile-theme-options" role="group" aria-label="Application theme">
              {appThemes.map((theme) => <button type="button" className={appTheme === theme ? "active" : ""} aria-pressed={appTheme === theme} key={theme} onClick={() => setAppTheme(theme)}><span className={`mobile-theme-swatch ${theme}`} aria-hidden="true" /><span>{theme[0].toUpperCase() + theme.slice(1)}</span></button>)}
            </div></div>
            <button type="button" className="profile-settings-future" disabled><span className="profile-menu-symbol" aria-hidden="true">⚙</span><span><strong>Profile settings</strong><small>Available in a future update</small></span><b>Later</b></button>
          </div>
          <a className="mobile-sign-out" href="/signout-with-chatgpt?return_to=/" target="_top">Sign out</a>
        </aside>
      </div>, document.body)}

      {mobileSearchOpen && typeof document !== "undefined" && createPortal(<div className="mobile-search-backdrop" role="presentation" onPointerDown={(event) => { if (event.currentTarget === event.target) setMobileSearchOpen(false); }}>
        <section className="mobile-search-panel" role="search" aria-label="Universal search">
          <div className="mobile-search-field"><Icon name="search" /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search pages, serial numbers and meetings" aria-label="Search journal" /><button type="button" aria-label="Close search" onClick={() => setMobileSearchOpen(false)}>×</button></div>
          {search && <div className="search-results mobile-search-results">
            <small>Pages</small>
            {searchResults.pages.map((page) => <button key={page.id} onClick={() => { setMobileSearchOpen(false); openPage(page); }}><span>{page.serial}</span><strong>{page.title}</strong></button>)}
            <small>Meetings</small>
            {searchResults.meetings.map((meeting) => <button key={meeting.id} onClick={() => { setSelectedMeetingId(meeting.id); setActiveView("meetings"); setSearch(""); setMobileSearchOpen(false); }}><span>{meeting.number}</span><strong>{meeting.purpose}</strong></button>)}
            {!searchResults.pages.length && !searchResults.meetings.length && <p>No matching pages or meetings.</p>}
          </div>}
        </section>
      </div>, document.body)}

      <FormattingToolbar
        enabled={activeView === "journal"}
        appFont={appFont}
        onAppFont={setAppFont}
        onTodo={toggleToolbarTodo}
        onImportant={markSelectedPageImportant}
      />

      <nav className="tab-bar" aria-label="Main sections">
        {navItems.map((item) => (
          <button className={activeView === item.id ? "active" : ""} key={item.id} onClick={() => item.id === "my-day" ? openMyDay() : setActiveView(item.id)}>{item.id === "my-day" ? <span className="my-day-date-icon" aria-hidden="true">{String(reminderNow.getDate()).padStart(2, "0")}</span> : <Icon name={item.id} />}{item.label}</button>
        ))}
      </nav>

      <main className="app-main">
        {activeView === "dashboard" && (
          <Dashboard
            data={data}
            onOpenMyDay={openMyDay}
            onOpenMeetings={() => setActiveView("meetings")}
            onOpenPeople={() => setActiveView("people")}
            onOpenMeeting={(meetingId) => { setSelectedMeetingId(meetingId); setActiveView("meetings"); }}
            onOpenPerson={openPerson}
            onOpenFilter={openDashboardFilter}
            onOpenDepartment={openDashboardDepartment}
          />
        )}
        {activeView === "my-day" && (
          <MyDayView
            data={data}
            selectedDate={selectedDayDate}
            calendarMonth={calendarMonth}
            onSelectedDate={(date) => { setSelectedDayDate(date); setCalendarMonth(date.slice(0, 7)); }}
            onCalendarMonth={setCalendarMonth}
            onCreate={createDayPlan}
            onChange={updateDayPlan}
            onDetailsChange={updateDayPlanDetails}
            onResolve={resolveDayPlan}
            onPostpone={postponeDayPlan}
            onLinkJournal={linkDayPlanToJournal}
            onOpenJournal={openPage}
            onUploadAttachment={uploadDayPlanAttachment}
            onRenameAttachment={renameDayPlanAttachment}
            onDeleteAttachment={deleteDayPlanAttachment}
            onReminderPermission={requestReminderPermission}
          />
        )}
        {activeView === "journal" && (
          <div className="view-with-title">
          <header className="view-title-bar journal-title-bar">
            <h1>Journal</h1>
          </header>
          <div className="journal-notebook-bar">
            <div className="journal-title-notebook">
              <select value={selectedNotebook?.id ?? ""} aria-label="Select notebook" onChange={(event) => selectNotebook(event.target.value)}>{data.notebooks.map((notebook) => <option value={notebook.id} key={notebook.id}>{notebook.name}</option>)}</select>
              <button type="button" title="Add notebook" aria-label="Add notebook" onClick={() => void createNotebook()}>＋</button>
            </div>
          </div>
          <div className="journal-mobile-shell">
          <nav className="mobile-journal-nav" aria-label="Journal panes">
            <div className="mobile-pane-switches">
              <button type="button" className={mobileJournalPane === "sections" ? "active" : ""} onClick={() => setMobileJournalPane("sections")}><span>1</span><strong>Sections</strong></button>
              <button type="button" className={mobileJournalPane === "pages" ? "active" : ""} onClick={() => setMobileJournalPane("pages")}><span>2</span><strong>Pages</strong></button>
              <button type="button" className={mobileJournalPane === "page" ? "active" : ""} disabled={!selectedPage} onClick={() => setMobileJournalPane("page")}><span>3</span><strong>Page</strong></button>
            </div>
          </nav>
          <div className={`three-pane journal-panes mobile-pane-${mobileJournalPane}`} style={{ gridTemplateColumns: `${journalPaneWidths[0]}px 7px ${journalPaneWidths[1]}px 7px minmax(420px, 1fr)` }}>
            <HierarchyPane
              data={data}
              notebookId={selectedNotebookId}
              selectedSubsectionId={selectedSubsectionId}
              journalFilter={journalFilter}
              dragItem={dragItem}
              dragOverKey={dragOverKey}
              onFilter={selectJournalFilter}
              onFocusOrderChange={updateFocusOrder}
              savedHierarchyState={data.hierarchyStates[selectedNotebookId]}
              sectionExpansionRequest={sectionExpansionRequest}
              onHierarchyStateChange={updateHierarchyState}
              onDepartment={selectDepartment}
              onSubsection={selectSubsection}
              onCreateSection={createSection}
              onMouseDragStart={beginSectionMouseDrag}
              onDragOverKey={setDragOverKey}
              onDropOnSection={handleDropOnSection}
              onDropOnRoot={handleDropOnSectionRoot}
              onMenu={(event, id, sectionKind) => {
                event.stopPropagation();
                setActionMenu({ kind: "section", id, sectionKind, ...menuAnchor(event) });
              }}
            />
            <div className="pane-resizer" role="separator" aria-orientation="vertical" aria-label="Resize sections pane" title="Drag to resize · Double-click to fit content" onMouseDown={(event) => beginPaneResize(event, 0)} onDoubleClick={(event) => autoFitPane(event, 0)} />
            <section className="page-list-pane">
              <div className="pane-title-row compact"><h2>{globalJournalView ? journalFilterLabel(journalFilter) : selectedSubsection?.name ?? "Pages"}</h2>{globalJournalView && <span>{journalPages.length}</span>}</div>
              {dragItem?.kind === "page" && <div
                className={`page-root-drop ${dragOverKey === "page-root" ? "active" : ""}`}
                onDragOver={(event) => { event.preventDefault(); setDragOverKey("page-root"); }}
                onDrop={(event) => void handleDropOnPageRoot(event)}
              >Drop here to make it a main page in {selectedSubsection?.name ?? "this section"}</div>}
              <div className="page-list-scroll" data-nav-scroll="journal-pages">
                {journalPages.map((page) => <PageCard
                    page={page}
                    selected={page.id === selectedPage?.id}
                    depth={pageDepthById.get(page.id) ?? 0}
                    hierarchy={globalJournalView ? pageHierarchyNames(data, page) : undefined}
                    reminderDate={pageFirstReminderDate(page, data)}
                    dropActive={dragOverKey === `page:${page.id}`}
                    hasChildren={pageParentIds.has(page.id)}
                    collapsed={collapsedPages.has(page.id)}
                    onToggle={() => setCollapsedPages((current) => { const next = new Set(current); if (next.has(page.id)) next.delete(page.id); else next.add(page.id); return next; })}
                    onClick={() => openPage(page)}
                    onMenu={(event) => { event.stopPropagation(); setActionMenu({ kind: "page", id: page.id, ...menuAnchor(event) }); }}
                    onDragStart={(event) => beginDrag(event, { kind: "page", id: page.id })}
                    onDragEnd={endDrag}
                    onDragOver={(event) => { if (dragItem?.kind === "page" && dragItem.id !== page.id) { event.preventDefault(); event.stopPropagation(); setDragOverKey(`page:${page.id}`); } }}
                    onDrop={(event) => void handleDropOnPage(event, page)}
                    key={page.id}
                  />)}
                {!journalPages.length && <div className="empty-pane"><span>○</span><p>No pages in this view.</p><button onClick={() => selectJournalFilter("all")}>Show all pages</button></div>}
              </div>
              <button className="add-page-bottom" onClick={() => void createBlankPage()}>＋ Add page</button>
            </section>
            <div className="pane-resizer" role="separator" aria-orientation="vertical" aria-label="Resize pages pane" title="Drag to resize · Double-click to fit content" onMouseDown={(event) => beginPaneResize(event, 1)} onDoubleClick={(event) => autoFitPane(event, 1)} />
            {selectedPage ? <PageEditor page={selectedPage} data={data} onPageChange={updatePage} onOutlineChange={updateOutline} onUploadAttachment={uploadPageAttachment} onAddLink={addPageLink} onRenameAttachment={renamePageAttachment} onDeleteAttachment={deletePageAttachment} onOpenSource={openSource} onOpenPerson={openPerson} onManagePeople={() => setPeopleManagerOpen(true)} onReminderPermission={requestReminderPermission} onLearnDictionaryWord={learnDictionaryWord} onRemoveDictionaryWord={removeDictionaryWord} /> : <div className="blank-page-state"><span>New page</span><h2>This section has no pages yet.</h2><p>Use “Add page” below the middle pane to create one immediately.</p></div>}
          </div>
          </div>
          </div>
        )}
        {activeView === "meetings" && selectedMeeting && (
          <div className="view-with-title">
          <header className="view-title-bar"><h1>Meetings</h1></header>
          <MeetingsView
            data={data}
            meeting={selectedMeeting}
            selectedAgendaPosition={selectedAgendaPosition}
            onAgendaPosition={setSelectedAgendaPosition}
            onSelectMeeting={setSelectedMeetingId}
            onCreateMeeting={createMeeting}
            onDataChange={setData}
            onSave={async (meeting, agendas) => { await post({ action: "saveMeeting", meeting, agendas }); await loadState({ meetingId: meeting.id }); }}
            onLinkTask={async (meetingId, agendaId) => {
              const result = await post({ action: "linkAgenda", meetingId, agendaId, subsectionId: selectedSubsectionId, dueDate: null, ownerId: null });
              await loadState({ pageId: String(result.pageId), meetingId });
            }}
            onOpenPage={(pageId) => { const page = data.pages.find((item) => item.id === pageId); if (page) openPage(page); }}
          />
          </div>
        )}
        {activeView === "people" && selectedPerson && (
          <div className="view-with-title">
          <header className="view-title-bar"><h1>Team</h1></header>
          <PeopleView data={data} person={selectedPerson} onSelectPerson={setSelectedPersonId} onOpenPage={openPage} onManage={() => setPeopleManagerOpen(true)} />
          </div>
        )}
      </main>

      {actionMenu && (
        <>
          <button className="context-backdrop" aria-label="Close menu" onClick={() => setActionMenu(null)} />
          <div className="context-menu" style={actionMenuStyle(actionMenu)}>
            {actionMenu.kind === "page" ? <>
              <button onClick={() => { const page = data.pages.find((item) => item.id === actionMenu.id); setActionMenu(null); if (page) void createBlankPage(page.subsectionId, page.id); }}><span>＋</span>Add subpage</button>
              <button onClick={() => { const id = actionMenu.id; setActionMenu(null); void makeSubpageOfPageAbove(id); }}><span>↳</span>Make subpage of page above</button>
              <button
                disabled={!data.pages.find((item) => item.id === actionMenu.id)?.parentId}
                title={data.pages.find((item) => item.id === actionMenu.id)?.parentId ? "Move this page up by exactly one level" : "This page is already a main page"}
                onClick={() => { const id = actionMenu.id; setActionMenu(null); void promotePageOneLevel(id); }}
              ><span>↰</span>Promote one level</button>
              <button onClick={() => { const id = actionMenu.id; setActionMenu(null); void renamePage(id); }}><span>✎</span>Rename page</button>
              <button onClick={() => { const page = data.pages.find((item) => item.id === actionMenu.id); setActionMenu(null); if (page) setMoveDialog({ kind: "page", id: page.id, subsectionId: page.subsectionId, parentPageId: page.parentId ?? "" }); }}><span>⇄</span>Move to another location…</button>
              <button onClick={() => { const id = actionMenu.id; setActionMenu(null); void duplicatePage(id); }}><span>⧉</span>Duplicate page</button>
              <hr />
              <button className="danger" onClick={() => { const id = actionMenu.id; setActionMenu(null); void deletePage(id); }}><span>×</span>Delete page</button>
            </> : <>
              <button onClick={() => { const id = actionMenu.id; setActionMenu(null); void createSection(id); }}><span>＋</span>Add child section</button>
              {actionMenu.sectionKind === "subsection" && data.subsections.find((section) => section.id === actionMenu.id)?.departmentId !== actionMenu.id && <button onClick={() => { const id = actionMenu.id; setActionMenu(null); void promoteSection(id); }}><span>↰</span>Move up one level / make main section</button>}
              <button onClick={() => { const { id, sectionKind } = actionMenu; setActionMenu(null); void renameSection(id, sectionKind); }}><span>✎</span>Rename section</button>
              <button onClick={() => { const { id, sectionKind } = actionMenu; setActionMenu(null); setMoveDialog({ kind: "section", id, sectionKind, targetId: "" }); }}><span>↳</span>Move / make subsection</button>
              <hr />
              <button className="danger" onClick={() => { const { id, sectionKind } = actionMenu; setActionMenu(null); void deleteSection(id, sectionKind); }}><span>×</span>Delete section</button>
            </>}
          </div>
        </>
      )}

      {moveDialog && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setMoveDialog(null); }}>
          <form className="move-modal" onSubmit={(event) => {
            event.preventDefault();
            void (async () => {
              try {
                if (moveDialog.kind === "page") {
                  const result = await post({ action: "movePage", pageId: moveDialog.id, subsectionId: moveDialog.subsectionId, parentPageId: moveDialog.parentPageId || null });
                  setSelectedSubsectionId(moveDialog.subsectionId);
                  await loadState({ pageId: String(result.pageId) });
                } else {
                  await post({ action: "moveSection", sectionId: moveDialog.id, sectionKind: moveDialog.sectionKind, targetId: moveDialog.targetId || null });
                  await loadState();
                }
                setMoveDialog(null);
              } catch (error) {
                window.alert(error instanceof Error ? error.message : "The item could not be moved.");
              }
            })();
          }}>
            <div className="modal-heading"><div className="modal-icon">↳</div><div><h2>{moveDialog.kind === "page" ? "Move page" : "Move section"}</h2><p>Choose where this item should belong.</p></div><button type="button" className="close-button" onClick={() => setMoveDialog(null)}>×</button></div>
            {moveDialog.kind === "page" ? <div className="move-fields">
              <label><span>Section / subsection</span><select value={moveDialog.subsectionId} onChange={(event) => setMoveDialog({ ...moveDialog, subsectionId: event.target.value, parentPageId: "" })}>{[
                ...data.departments.filter((section) => section.notebookId === selectedNotebookId),
                ...data.subsections.filter((section) => section.notebookId === selectedNotebookId),
              ].sort((left, right) => left.serialPrefix.localeCompare(right.serialPrefix, undefined, { numeric: true })).map((section) => <option value={section.id} key={section.id}>{section.serialPrefix} · {section.name}</option>)}</select></label>
              <label><span>Parent page</span><select value={moveDialog.parentPageId} onChange={(event) => setMoveDialog({ ...moveDialog, parentPageId: event.target.value })}><option value="">None — keep as a main page</option>{data.pages.filter((page) => page.subsectionId === moveDialog.subsectionId && page.id !== moveDialog.id).map((page) => <option value={page.id} key={page.id}>{page.serial} · {page.title}</option>)}</select></label>
            </div> : <div className="move-fields"><label><span>Place under</span><select required={moveDialog.sectionKind === "subsection"} value={moveDialog.targetId} onChange={(event) => setMoveDialog({ ...moveDialog, targetId: event.target.value })}><option value="">{moveDialog.sectionKind === "department" ? "Top level" : "Choose a parent section…"}</option>{[...data.departments.filter((section) => section.notebookId === selectedNotebookId).map((section) => ({ id: section.id, name: section.name, serialPrefix: section.serialPrefix })), ...data.subsections.filter((section) => section.notebookId === selectedNotebookId).map((section) => ({ id: section.id, name: section.name, serialPrefix: section.serialPrefix }))].filter((section) => section.id !== moveDialog.id).sort((a, b) => a.serialPrefix.localeCompare(b.serialPrefix, undefined, { numeric: true })).map((section) => <option value={section.id} key={section.id}>{section.serialPrefix} · {section.name}</option>)}</select></label></div>}
            <div className="modal-actions"><button type="button" onClick={() => setMoveDialog(null)}>Cancel</button><button className="primary-button" type="submit">Move item</button></div>
          </form>
        </div>
      )}
      {peopleManagerOpen && <TeamManager people={data.people} onClose={() => setPeopleManagerOpen(false)} onCreate={createPerson} onUpdate={updatePerson} onDelete={deletePerson} />}
    </div>
  );
}

function TeamManager({ people, onClose, onCreate, onUpdate, onDelete }: { people: Person[]; onClose: () => void; onCreate: (name: string, role: string) => Promise<void>; onUpdate: (personId: string, name: string, role: string) => Promise<void>; onDelete: (personId: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [working, setWorking] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="team-manager-modal">
    <div className="modal-heading"><div className="modal-icon">◎</div><div><h2>Team members</h2><p>This list supplies task owners and supporting team members.</p></div><button type="button" className="close-button" onClick={onClose}>×</button></div>
    <form className="team-add-form" onSubmit={(event) => { event.preventDefault(); if (!name.trim()) return; setWorking(true); void onCreate(name.trim(), role.trim()).then(() => { setName(""); setRole(""); }).finally(() => setWorking(false)); }}><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Team member name" aria-label="Team member name" /><input value={role} onChange={(event) => setRole(event.target.value)} placeholder="Role / department" aria-label="Role or department" /><button className="primary-button" disabled={working || !name.trim()}>{working ? "Adding…" : "Add member"}</button></form>
    <div className="team-member-list">{people.map((person) => <div className={editingId === person.id ? "editing" : ""} key={person.id}><span className="person-avatar">{initials(editingId === person.id ? editName : person.name)}</span>{editingId === person.id ? <form className="team-edit-form" onSubmit={(event) => { event.preventDefault(); if (!editName.trim()) return; setWorking(true); void onUpdate(person.id, editName.trim(), editRole.trim()).then(() => setEditingId("")).finally(() => setWorking(false)); }}><input value={editName} onChange={(event) => setEditName(event.target.value)} aria-label={`Name for ${person.name}`} /><input value={editRole} onChange={(event) => setEditRole(event.target.value)} aria-label={`Role for ${person.name}`} placeholder="Role / department" /><div><button type="button" onClick={() => setEditingId("")}>Cancel</button><button className="primary-button" disabled={working || !editName.trim()}>Save</button></div></form> : <><div><strong>{person.name}</strong><small>{person.role || "Role not entered"}</small></div><div className="team-member-actions"><button onClick={() => { setEditingId(person.id); setEditName(person.name); setEditRole(person.role); }}>Edit</button><button className="danger-text-button" onClick={() => void onDelete(person.id)}>Remove</button></div></>}</div>)}</div>
  </section></div>;
}

function HierarchyPane({ data, notebookId, selectedSubsectionId, journalFilter, dragItem, dragOverKey, onFilter, onFocusOrderChange, savedHierarchyState, sectionExpansionRequest, onHierarchyStateChange, onDepartment, onSubsection, onCreateSection, onMenu, onMouseDragStart, onDragOverKey, onDropOnSection, onDropOnRoot }: {
  data: AppData;
  notebookId: string;
  selectedSubsectionId: string;
  journalFilter: string;
  dragItem: DragItem | null;
  dragOverKey: string;
  onFilter: (value: string) => void;
  onFocusOrderChange: (next: string[], save?: boolean) => void;
  savedHierarchyState?: HierarchyState;
  sectionExpansionRequest: { id: string; request: number };
  onHierarchyStateChange: (notebookId: string, state: HierarchyState) => void;
  onDepartment: (id: string) => void;
  onSubsection: (subsection: Subsection) => void;
  onCreateSection: (parentId?: string) => void;
  onMenu: (event: React.MouseEvent, id: string, sectionKind: SectionKind) => void;
  onMouseDragStart: (event: React.MouseEvent<HTMLElement>, item: SectionDragItem) => void;
  onDragOverKey: (key: string) => void;
  onDropOnSection: (event: React.DragEvent, target: SectionNode) => void;
  onDropOnRoot: (event: React.DragEvent) => void;
}) {
  const roots = sectionTree(data, notebookId);
  const notebookSubsections = notebookSectionIds(data, notebookId);
  const notebookPages = data.pages.filter((page) => notebookSubsections.has(page.subsectionId));
  const filterCount = (filter: string) => notebookPages.filter((page) => filter === "reminders" ? pageHasReminder(page, data) : pageMatchesFilter(page, filter)).length;
  const [focusDragging, setFocusDragging] = useState("");
  const [focusCollapsed, setFocusCollapsed] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [collapseLoadedNotebook, setCollapseLoadedNotebook] = useState("");
  const hierarchyStateChangeRef = useRef(onHierarchyStateChange);
  const departmentTreeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { hierarchyStateChangeRef.current = onHierarchyStateChange; }, [onHierarchyStateChange]);

  useEffect(() => {
    const storageKey = `journal-hierarchy-state:${notebookId}`;
    const isMobile = window.matchMedia("(max-width: 480px)").matches;
    const mobileDefaults = new Set<string>();
    const collectCollapsibleSections = (nodes: SectionNode[]) => nodes.forEach((node) => {
      if (node.children.length > 0) mobileDefaults.add(node.id);
      collectCollapsibleSections(node.children);
    });
    collectCollapsibleSections(roots);

    let restored = savedHierarchyState;
    if (!restored && !isMobile) {
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          const stored = JSON.parse(raw) as { collapsedSections?: unknown; focusCollapsed?: unknown };
          restored = {
            collapsedSections: Array.isArray(stored.collapsedSections) ? stored.collapsedSections.map(String) : [],
            focusCollapsed: stored.focusCollapsed === true,
          };
        }
      } catch {
        // A damaged device-local preference safely falls back to the default layout.
      }
    }
    setCollapsedSections(new Set(restored?.collapsedSections ?? (isMobile ? [...mobileDefaults] : [])));
    setFocusCollapsed(restored?.focusCollapsed ?? false);
    setCollapseLoadedNotebook(notebookId);
  }, [notebookId]);

  useLayoutEffect(() => {
    if (!sectionExpansionRequest.id) return;
    const sectionsToExpand = new Set<string>();
    let sectionId: string | null = sectionExpansionRequest.id;
    while (sectionId) {
      sectionsToExpand.add(sectionId);
      const department = data.departments.find((item) => item.id === sectionId);
      const subsection = data.subsections.find((item) => item.id === sectionId);
      sectionId = department?.parentId ?? subsection?.parentId ?? null;
    }
    setCollapsedSections((current) => {
      const next = new Set(current);
      let changed = false;
      sectionsToExpand.forEach((id) => {
        if (next.delete(id)) changed = true;
      });
      return changed ? next : current;
    });
    const revealSection = () => {
      const tree = departmentTreeRef.current;
      if (!tree) return;
      const row = Array.from(tree.querySelectorAll<HTMLElement>("[data-section-id]"))
        .find((candidate) => candidate.dataset.sectionId === sectionExpansionRequest.id);
      if (!row) return;
      const treeBounds = tree.getBoundingClientRect();
      const rowBounds = row.getBoundingClientRect();
      tree.scrollTop = Math.max(0, tree.scrollTop + rowBounds.top - treeBounds.top - 8);
    };
    revealSection();
    const frame = window.requestAnimationFrame(revealSection);
    return () => window.cancelAnimationFrame(frame);
  }, [sectionExpansionRequest]);

  useEffect(() => {
    if (collapseLoadedNotebook !== notebookId) return;
    const nextState = {
      collapsedSections: [...collapsedSections],
      focusCollapsed,
    };
    window.localStorage.setItem(`journal-hierarchy-state:${notebookId}`, JSON.stringify(nextState));
    const savedCollapsed = new Set(savedHierarchyState?.collapsedSections ?? []);
    const isAlreadySaved = savedHierarchyState
      && savedHierarchyState.focusCollapsed === nextState.focusCollapsed
      && savedCollapsed.size === collapsedSections.size
      && [...collapsedSections].every((id) => savedCollapsed.has(id));
    if (!isAlreadySaved) hierarchyStateChangeRef.current(notebookId, nextState);
  }, [collapseLoadedNotebook, collapsedSections, focusCollapsed, notebookId, savedHierarchyState]);

  function beginFocusDrag(event: React.MouseEvent<HTMLElement>, filter: string) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const workingOrder = [...data.focusOrder];
    setFocusDragging(filter);
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const target = (document.elementFromPoint(moveEvent.clientX, moveEvent.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-focus-filter]");
      const targetFilter = target?.dataset.focusFilter;
      if (!targetFilter || targetFilter === filter) return;
      const fromIndex = workingOrder.indexOf(filter);
      const targetIndex = workingOrder.indexOf(targetFilter);
      if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) return;
      workingOrder.splice(fromIndex, 1);
      workingOrder.splice(targetIndex, 0, filter);
      onFocusOrderChange([...workingOrder]);
    };
    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      setFocusDragging("");
      onFocusOrderChange([...workingOrder], true);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }

  function focusRow(filter: string) {
    const definitions: Record<string, { label: string; className?: string; mark: React.ReactNode }> = {
      all: { label: "All pages", mark: <Icon name="journal" /> },
      today: { label: "Due today", mark: <Icon name="calendar" /> },
      reminders: { label: "Reminders", className: "attention", mark: <span className="filter-mark reminder">◷</span> },
      attention: { label: "Requires attention", className: "attention", mark: <Icon name="warning" /> },
      "in-progress": { label: "In progress", mark: <span className="filter-mark progress">◐</span> },
      "not-started": { label: "Not started", mark: <span className="filter-mark">○</span> },
      completed: { label: "Completed", mark: <span className="filter-mark complete">✓</span> },
    };
    const definition = definitions[filter];
    if (!definition) return null;
    const count = filter === "all" ? notebookPages.length : filterCount(filter);
    return <div className={`focus-filter-row ${focusDragging === filter ? "dragging" : ""}`} data-focus-filter={filter} key={filter}>
      <span className="focus-drag-handle" role="button" tabIndex={0} title={`Drag ${definition.label} up or down`} aria-label={`Drag ${definition.label} up or down`} onMouseDown={(event) => beginFocusDrag(event, filter)}>⋮⋮</span>
      <button className={`${journalFilter === filter ? "active " : ""}${definition.className ?? ""}`.trim()} onClick={() => onFilter(filter)}>{definition.mark}<span>{definition.label}</span><em>{count}</em></button>
    </div>;
  }

  function renderNode(node: SectionNode, level = 0): React.ReactNode {
    const subsection = node.kind === "subsection" ? data.subsections.find((item) => item.id === node.id) : null;
    const selected = node.id === selectedSubsectionId;
    const sectionIds = new Set<string>();
    const collectSectionIds = (item: SectionNode) => { sectionIds.add(item.id); item.children.forEach(collectSectionIds); };
    collectSectionIds(node);
    const pageCount = data.pages.filter((page) => sectionIds.has(page.subsectionId)).length;
    const acceptsDrop = dragItem?.kind === "section"
      ? dragItem.id !== node.id
      : dragItem?.kind === "page";
    return <div className="section-tree-node" key={`${node.kind}-${node.id}`}>
      <div
        className={`section-row level-${Math.min(level, 4)} ${selected ? "selected" : ""} ${dragOverKey === `section-before:${node.id}` ? "drop-before" : ""} ${dragOverKey === `section-after:${node.id}` ? "drop-after" : ""} ${dragOverKey === `section:${node.id}` ? "drop-target" : ""}`}
        data-section-id={node.id}
        data-section-kind={node.kind}
        onDragOver={(event) => {
          const carriesJournalItem = Array.from(event.dataTransfer.types).includes("text/plain");
          if (acceptsDrop || carriesJournalItem) {
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "move";
            if (dragItem?.kind === "section") {
              const bounds = event.currentTarget.getBoundingClientRect();
              onDragOverKey(`section-${event.clientY < bounds.top + bounds.height / 2 ? "before" : "after"}:${node.id}`);
            } else {
              onDragOverKey(`section:${node.id}`);
            }
          }
        }}
        onDrop={(event) => void onDropOnSection(event, node)}
      >
        <span
          className="section-drag-handle"
          role="button"
          tabIndex={0}
          title={`Drag to reorder ${node.name}`}
          aria-label={`Drag to reorder ${node.name}`}
          onMouseDown={(event) => onMouseDragStart(event, { kind: "section", id: node.id, sectionKind: node.kind })}
        >⋮⋮</span>
        {node.children.length > 0 ? <button className={`tree-toggle ${collapsedSections.has(node.id) ? "collapsed" : ""}`} aria-expanded={!collapsedSections.has(node.id)} aria-label={collapsedSections.has(node.id) ? `Expand ${node.name}` : `Collapse ${node.name}`} onClick={() => setCollapsedSections((current) => { const next = new Set(current); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next; })}>›</button> : <span className="tree-toggle-spacer" />}
        <button className="section-main" onClick={() => node.kind === "department" ? onDepartment(node.id) : subsection && onSubsection(subsection)}>
          <span className="department-color" style={{ background: node.color }} />
          <span className="section-copy"><small>{node.serialPrefix}</small><strong>{node.name}</strong></span>
          <em>{pageCount || ""}</em>
        </button>
        <button className="item-menu-button" aria-label={`Settings for ${node.name}`} onClick={(event) => onMenu(event, node.id, node.kind)}><Icon name="dots" /></button>
      </div>
      {node.children.length > 0 && !collapsedSections.has(node.id) && <div className="section-children">{node.children.map((child) => renderNode(child, level + 1))}</div>}
    </div>;
  }

  return (
    <aside className="hierarchy-pane">
      <div className="hierarchy-heading compact"><h2>Sections</h2></div>
      <div className={`smart-views ${focusCollapsed ? "collapsed" : ""}`}>
        <button className="focus-collapse-button" onClick={() => setFocusCollapsed((value) => !value)}><span className="focus-leading-spacer" aria-hidden="true" /><span className={`tree-toggle ${focusCollapsed ? "collapsed" : ""}`}>›</span><span className="focus-label-spacer" aria-hidden="true" /><strong>Focus</strong><em>{notebookPages.length}</em><span className="focus-menu-spacer" aria-hidden="true" /></button>
        {!focusCollapsed && data.focusOrder.map((filter) => focusRow(filter))}
      </div>
      <div ref={departmentTreeRef} className="department-tree" data-nav-scroll="journal-sections">
        {dragItem?.kind === "section" && dragItem.sectionKind === "department" && <div
          className={`section-root-drop ${dragOverKey === "section-root" ? "active" : ""}`}
          data-section-root
          onDragOver={(event) => { event.preventDefault(); onDragOverKey("section-root"); }}
          onDrop={(event) => void onDropOnRoot(event)}
        >Drop here for a top-level section</div>}
        {roots.map((node) => renderNode(node))}
      </div>
      <button className="add-section-bottom" onClick={() => onCreateSection()}>＋ Add section</button>
    </aside>
  );
}

function MyDayDetails({ baseSerial, chainId, details, attachments, readOnly = false, actionsOnly = false, onChange, onUploadAttachment, onRenameAttachment, onDeleteAttachment }: {
  baseSerial: string;
  chainId: string;
  details: DayPlanDetail[];
  attachments: DayPlanAttachment[];
  readOnly?: boolean;
  actionsOnly?: boolean;
  onChange: (chainId: string, details: DayPlanDetail[], save?: boolean) => void;
  onUploadAttachment: (chainId: string, detailId: string | null, kind: "photo" | "document" | "audio", file: File) => Promise<void>;
  onRenameAttachment: (attachment: DayPlanAttachment) => Promise<void>;
  onDeleteAttachment: (attachment: DayPlanAttachment) => Promise<void>;
}) {
  const ordered = [...details].sort((a, b) => a.position - b.position);
  const serials = computeOutlineSerials(baseSerial, ordered);
  const inputRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  function fitDetailField(field: HTMLTextAreaElement | null) {
    if (!field) return;
    field.style.height = "0px";
    field.style.height = `${Math.max(42, field.scrollHeight)}px`;
  }

  function replace(detailId: string, patch: Partial<DayPlanDetail>, save = false) {
    onChange(chainId, ordered.map((detail) => detail.id === detailId ? { ...detail, ...patch } : detail), save);
  }

  function addDetail(afterIndex = ordered.length - 1, level = 0) {
    const detail: DayPlanDetail = { id: `day-detail-${crypto.randomUUID()}`, chainId, level, position: afterIndex + 1, text: "", isTask: false, completed: false, entryDate: localDate() };
    const next = [...ordered];
    next.splice(afterIndex + 1, 0, detail);
    const normalized = next.map((item, position) => ({ ...item, position }));
    onChange(chainId, normalized, true);
    window.setTimeout(() => inputRefs.current[detail.id]?.focus(), 0);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>, detail: DayPlanDetail, index: number) {
    if ((event.metaKey || event.ctrlKey) && (event.key === "]" || event.key === "[")) {
      event.preventDefault();
      const priorLevel = index === 0 ? 0 : ordered[index - 1].level;
      const nextLevel = event.key === "[" ? Math.max(0, detail.level - 1) : Math.min(priorLevel + 1, detail.level + 1);
      replace(detail.id, { level: nextLevel }, true);
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      const field = event.currentTarget;
      const start = field.selectionStart;
      const end = field.selectionEnd;
      const text = `${detail.text.slice(0, start)}    ${detail.text.slice(end)}`;
      replace(detail.id, { text });
      window.setTimeout(() => {
        field.focus();
        field.setSelectionRange(start + 4, start + 4);
        fitDetailField(field);
      }, 0);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      addDetail(index, detail.level);
      return;
    }
    if (event.key === "Backspace" && !detail.text && ordered.length > 1) {
      event.preventDefault();
      const next = ordered.filter((item) => item.id !== detail.id).map((item, position) => ({ ...item, position }));
      onChange(chainId, next, true);
      window.setTimeout(() => inputRefs.current[ordered[Math.max(0, index - 1)]?.id]?.focus(), 0);
    }
  }

  if (!ordered.length && readOnly) return null;
  return <div className={`day-detail-list ${readOnly ? "read-only" : ""} ${actionsOnly ? "actions-only" : ""}`}>
    {ordered.map((detail, index) => <div className={`day-detail-row ${detail.isTask ? "task-line" : "update-line"} level-${Math.min(detail.level, 3)}`} key={detail.id}>
      {!readOnly && <div className="day-detail-hierarchy-tools"><InlineAttachmentTools compact actionsOnly menuLabel={`Change hierarchy for ${serials[index]}`} menuActions={[
        {
          icon: "⇥",
          label: "Indent right",
          detail: index === 0 || detail.level >= (ordered[index - 1]?.level ?? -1) + 1 ? "No deeper level is available here" : "Move one level under the line above",
          disabled: index === 0 || detail.level >= (ordered[index - 1]?.level ?? -1) + 1,
          onSelect: () => replace(detail.id, { level: Math.min((ordered[index - 1]?.level ?? -1) + 1, detail.level + 1) }, true),
        },
        {
          icon: "⇤",
          label: "Indent left",
          detail: detail.level === 0 ? "This line is already at the main level" : "Move one level back",
          disabled: detail.level === 0,
          onSelect: () => replace(detail.id, { level: Math.max(0, detail.level - 1) }, true),
        },
      ]} onUpload={async () => undefined} /></div>}
      {!readOnly && (detail.isTask ? <button type="button" className={`day-detail-check ${detail.completed ? "done" : ""}`} aria-label={detail.completed ? "Mark detail open" : "Complete detail"} onClick={() => replace(detail.id, { completed: !detail.completed }, true)}>{detail.completed ? "✓" : ""}</button> : <span className="day-detail-update-mark" title="Ordinary detail line" aria-label="Ordinary detail line">·</span>)}
      {readOnly && <span className={detail.isTask ? `day-detail-read-mark ${detail.completed ? "done" : ""}` : "day-detail-update-mark"}>{detail.isTask ? detail.completed ? "✓" : "○" : "·"}</span>}
      <CompactDateInput className="day-detail-date" wrapperClassName="day-detail-date-control" value={detail.entryDate} disabled={readOnly} onChange={(entryDate) => replace(detail.id, { entryDate: entryDate || localDate() }, true)} ariaLabel={`Date for ${serials[index]}`} />
      <span className="day-detail-serial">{serials[index]}</span>
      {readOnly ? <span className={detail.isTask && detail.completed ? "completed-text" : ""}>{detail.text}</span> : <textarea rows={1} ref={(node) => { inputRefs.current[detail.id] = node; fitDetailField(node); }} value={detail.text} className={detail.isTask && detail.completed ? "completed-text" : ""} placeholder={index === 0 ? "Add details…" : "Next detail…"} onChange={(event) => { fitDetailField(event.currentTarget); replace(detail.id, { text: event.target.value }); }} onBlur={(event) => replace(detail.id, { text: event.currentTarget.value }, true)} onKeyDown={(event) => handleKeyDown(event, detail, index)} aria-label={`Detail ${serials[index]}`} />}
      {!readOnly && <InlineAttachmentTools compact actionsOnly={actionsOnly} menuLabel={actionsOnly ? "Detail line options" : undefined} menuActions={[{
        icon: detail.isTask ? "↩" : "✓",
        label: detail.isTask ? "Change to ordinary detail" : "Make this a task",
        detail: detail.isTask ? "Remove its completion circle" : "Give this line its own completion circle",
        active: detail.isTask,
        onSelect: () => replace(detail.id, { isTask: !detail.isTask, completed: false }, true),
      }]} onUpload={(kind, file) => onUploadAttachment(chainId, detail.id, kind, file)} />}
      <AttachmentList compact attachments={attachments.filter((attachment) => attachment.detailId === detail.id)} urlFor={(attachment) => `/api/day-plan-attachments?id=${encodeURIComponent(attachment.id)}`} onRename={onRenameAttachment} onDelete={onDeleteAttachment} />
    </div>)}
    {!readOnly && <button type="button" className="add-day-detail" onClick={() => addDetail()}>+ Detail line</button>}
  </div>;
}

function MyDayView({ data, selectedDate, calendarMonth, onSelectedDate, onCalendarMonth, onCreate, onChange, onDetailsChange, onResolve, onPostpone, onLinkJournal, onOpenJournal, onUploadAttachment, onRenameAttachment, onDeleteAttachment, onReminderPermission }: {
  data: AppData;
  selectedDate: string;
  calendarMonth: string;
  onSelectedDate: (date: string) => void;
  onCalendarMonth: (month: string) => void;
  onCreate: (date: string, category: DayPlanItem["category"], title: string, time: string, assigneeId: string | null, details: DayPlanDetail[]) => Promise<void>;
  onChange: (item: DayPlanItem, save?: boolean) => void;
  onDetailsChange: (chainId: string, details: DayPlanDetail[], save?: boolean) => void;
  onResolve: (id: string, status: "Completed" | "Abandoned" | "Cancelled") => Promise<void>;
  onPostpone: (id: string, nextDate: string) => Promise<void>;
  onLinkJournal: (dayPlanId: string, pageId: string) => Promise<void>;
  onOpenJournal: (page: Page) => void;
  onUploadAttachment: (chainId: string, detailId: string | null, kind: "photo" | "document" | "audio", file: File) => Promise<void>;
  onRenameAttachment: (attachment: DayPlanAttachment) => Promise<void>;
  onDeleteAttachment: (attachment: DayPlanAttachment) => Promise<void>;
  onReminderPermission: () => Promise<void>;
}) {
  const categories: Array<{ id: DayPlanItem["category"]; label: string; code: string; mark: string }> = [
    { id: "Task", label: "Tasks", code: "T", mark: "✓" },
    { id: "Call", label: "Calls", code: "C", mark: "☎" },
    { id: "Email", label: "Emails", code: "E", mark: "@" },
  ];
  const [plannerView, setPlannerView] = useState<"day" | "week" | "month">("day");
  const [addCategory, setAddCategory] = useState<DayPlanItem["category"] | null>(null);
  const [addTitle, setAddTitle] = useState("");
  const [addDate, setAddDate] = useState(selectedDate);
  const [addTime, setAddTime] = useState("");
  const [addAssigneeId, setAddAssigneeId] = useState("");
  const [addDetails, setAddDetails] = useState<DayPlanDetail[]>([]);
  const [addSaving, setAddSaving] = useState(false);
  const [postponeId, setPostponeId] = useState("");
  const [postponeDate, setPostponeDate] = useState(shiftDay(selectedDate, 1));
  const [journalLink, setJournalLink] = useState<{ itemId: string; notebookId: string; sectionId: string; pageId: string } | null>(null);
  const [showCompleted, setShowCompleted] = useState<Record<DayPlanItem["category"], boolean>>({ Task: false, Call: false, Email: false });
  const [focusedItemId, setFocusedItemId] = useState("");
  const [reminderEditorItemId, setReminderEditorItemId] = useState("");
  const monthDates = calendarDates(calendarMonth);
  const selectedItems = data.dayPlanItems.filter((item) => item.planDate === selectedDate);
  const week = weekDates(selectedDate);

  useEffect(() => {
    if (!focusedItemId) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setFocusedItemId(""); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [focusedItemId]);

  useEffect(() => {
    if (!addCategory && !journalLink && !focusedItemId) return;
    document.body.classList.add("my-day-overlay-open");
    return () => document.body.classList.remove("my-day-overlay-open");
  }, [addCategory, focusedItemId, journalLink]);

  function openAdd(category: DayPlanItem["category"], date = selectedDate) {
    setAddCategory(category);
    setAddDate(date);
    setAddTitle("");
    setAddTime("");
    setAddAssigneeId("");
    setAddDetails([{
      id: `day-detail-${crypto.randomUUID()}`,
      chainId: "new-day-plan",
      level: 0,
      position: 0,
      text: "",
      isTask: false,
      completed: false,
      entryDate: localDate(),
    }]);
  }

  async function submitItem(event: React.FormEvent) {
    event.preventDefault();
    if (!addCategory || !addTitle.trim()) return;
    setAddSaving(true);
    try {
      if (addTime) void onReminderPermission();
      await onCreate(addDate, addCategory, addTitle.trim(), addTime, addAssigneeId || null, addDetails);
      setAddCategory(null);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The planner item could not be saved.");
    } finally {
      setAddSaving(false);
    }
  }

  async function resolveItem(item: DayPlanItem, status: "Completed" | "Abandoned" | "Cancelled") {
    if (status !== "Completed" && !window.confirm(`${status === "Abandoned" ? "Abandon" : "Cancel"} “${item.title}”?`)) return;
    try {
      await onResolve(item.id, status);
      setFocusedItemId("");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The planner item could not be updated.");
    }
  }

  async function postponeItem(item: DayPlanItem) {
    try {
      await onPostpone(item.id, postponeDate);
      setPostponeId("");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The planner item could not be postponed.");
    }
  }

  function openJournalLink(item: DayPlanItem) {
    const linkedPage = data.pages.find((page) => page.id === item.linkedPageId);
    const linkedSection = linkedPage && journalSection(data, linkedPage.subsectionId);
    const notebookId = linkedSection?.notebookId ?? data.notebooks[0]?.id ?? "";
    const sectionOptions = [...data.departments, ...data.subsections].filter((section) => section.notebookId === notebookId);
    const sectionId = linkedPage?.subsectionId ?? sectionOptions[0]?.id ?? "";
    const pageId = linkedPage?.id ?? data.pages.find((page) => page.subsectionId === sectionId)?.id ?? "";
    setFocusedItemId("");
    setJournalLink({ itemId: item.id, notebookId, sectionId, pageId });
  }

  function navigatePeriod(direction: -1 | 1) {
    if (plannerView === "month") {
      const month = shiftMonth(calendarMonth, direction);
      onCalendarMonth(month);
      onSelectedDate(`${month}-01`);
      return;
    }
    onSelectedDate(shiftDay(selectedDate, direction * (plannerView === "week" ? 7 : 1)));
  }

  function itemDetails(item: DayPlanItem) {
    return data.dayPlanDetails.filter((detail) => detail.chainId === item.chainId).sort((a, b) => a.position - b.position);
  }

  function renderActiveCard(item: DayPlanItem, baseSerial: string, category: (typeof categories)[number], focused = false) {
    const linkedPage = data.pages.find((page) => page.id === item.linkedPageId);
    const itemAttachments = data.dayPlanAttachments.filter((attachment) => attachment.chainId === item.chainId);
    const taskAttachments = itemAttachments.filter((attachment) => !attachment.detailId);
    const details = itemDetails(item);
    const progressItems = details.filter((detail) => detail.isTask && detail.text.trim());
    const completedProgressItems = progressItems.filter((detail) => detail.completed).length;
    const progressPercent = progressItems.length ? Math.round(completedProgressItems / progressItems.length * 100) : 0;
    return <article
      className={`planner-card ${focused ? "focused" : ""}`}
      role={focused ? "dialog" : undefined}
      aria-modal={focused ? "true" : undefined}
      aria-label={focused ? `Focused ${category.id.toLowerCase()}: ${item.title}` : undefined}
      onMouseDown={(event) => {
        if (focused) { event.stopPropagation(); return; }
        const target = event.target as HTMLElement;
        if (target.closest("button, a, audio, input, select, textarea, label")) return;
        setFocusedItemId(item.id);
      }}
      key={`${focused ? "focused" : "column"}-${item.id}`}
    >
      {focused && <div className="planner-focus-heading"><div><span>{category.mark}</span><p>Focused {category.id}</p></div><button type="button" aria-label="Close focused item" onClick={() => setFocusedItemId("")}>×</button></div>}
      <div className="planner-card-heading"><button type="button" className="planner-complete-button" aria-label={`Complete ${item.title}`} onClick={() => void resolveItem(item, "Completed")}>✓</button><span className="planner-item-serial">{baseSerial}</span><AutoGrowTextarea className="planner-card-title" value={item.title} ariaLabel={`${category.id} title`} singleParagraph onChange={(title) => onChange({ ...item, title })} onBlur={(title) => onChange({ ...item, title }, true)} /></div>
      {!focused && <div className="planner-card-summary-schedule"><div className="planner-schedule-field"><span>Date</span><AppDateControl value={item.planDate} wrapperClassName="planner-date-control" ariaLabel={`${item.category} date`} required onChange={(planDate) => planDate && onChange({ ...item, planDate }, true)} /></div><div className="planner-time-field"><span>{item.category === "Call" ? "Call time" : item.category === "Email" ? "Email time" : "Time"}</span><AppTimeControl value={item.plannedTime} ariaLabel={`${item.category} time`} onChange={(time) => { const plannedTime = time || null; onChange({ ...item, plannedTime }, true); if (plannedTime) void onReminderPermission(); }} /></div></div>}
      {focused && <>
        <div className="planner-card-progress" aria-label={progressItems.length ? `${completedProgressItems} of ${progressItems.length} detail tasks completed` : "No detail tasks selected"}><span>{progressItems.length ? `${completedProgressItems}/${progressItems.length} detail tasks` : "No detail tasks"}</span><div><i style={{ width: `${progressPercent}%` }} /></div><strong>{progressPercent}%</strong></div>
        <div className="planner-card-controls"><div className="planner-schedule-row"><div className="planner-schedule-field"><span>Date</span><AppDateControl value={item.planDate} wrapperClassName="planner-date-control" ariaLabel={`${item.category} date`} required onChange={(planDate) => planDate && onChange({ ...item, planDate }, true)} /></div><div className="planner-time-field"><span>{item.category === "Call" ? "Call time" : item.category === "Email" ? "Email time" : "Time"}</span><AppTimeControl value={item.plannedTime} ariaLabel={`${item.category} time`} onChange={(time) => { const plannedTime = time || null; onChange({ ...item, plannedTime }, true); if (plannedTime) void onReminderPermission(); }} /></div><button type="button" className={`planner-reminder-setting ${item.plannedTime && !item.reminderClosedAt ? "active" : ""}`} onMouseDown={(event) => event.stopPropagation()} onClick={() => setReminderEditorItemId(item.id)}><span>◷</span><b>{item.reminderRepeat !== "none" ? reminderRepeatLabel(item.reminderRepeat) : "Reminder"}</b></button><label className="planner-assignee-field"><span>Assigned to</span><select value={item.assigneeId ?? ""} onChange={(event) => onChange({ ...item, assigneeId: event.target.value || null }, true)}><option value="">Unassigned</option>{data.people.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label></div><div className="planner-card-resource-row"><InlineAttachmentTools onUpload={(kind, file) => onUploadAttachment(item.chainId, null, kind, file)} /></div></div>
        <AttachmentList attachments={taskAttachments} urlFor={(attachment) => `/api/day-plan-attachments?id=${encodeURIComponent(attachment.id)}`} onRename={onRenameAttachment} onDelete={onDeleteAttachment} />
        <MyDayDetails baseSerial={baseSerial} chainId={item.chainId} details={details} attachments={itemAttachments} onChange={onDetailsChange} onUploadAttachment={onUploadAttachment} onRenameAttachment={onRenameAttachment} onDeleteAttachment={onDeleteAttachment} />
        <div className="planner-card-meta"><span>{item.carryCount > 0 ? `↪ Forward ${item.carryCount}d · ${addedTimeLabel(item.createdAt)}` : addedTimeLabel(item.createdAt)}</span>{linkedPage && <button type="button" onClick={() => onOpenJournal(linkedPage)}>Open {linkedPage.serial}</button>}</div>
        <div className="planner-card-actions"><button type="button" className={linkedPage ? "linked" : ""} onClick={() => openJournalLink(item)}>{linkedPage ? "Journal linked" : "Add to journal"}</button><button type="button" onClick={() => { setPostponeId(item.id); setPostponeDate(shiftDay(item.planDate, 1)); }}>Postpone</button><button type="button" onClick={() => void resolveItem(item, "Abandoned")}>Abandon</button><button type="button" onClick={() => void resolveItem(item, "Cancelled")}>Cancel</button></div>
        {postponeId === item.id && <div className="postpone-row"><span>Move to</span><AppDateControl value={postponeDate} wrapperClassName="postpone-date-control" min={shiftDay(item.planDate, 1)} ariaLabel="Postpone date" required onChange={setPostponeDate} /><button type="button" onClick={() => setPostponeId("")}>Keep</button><button type="button" className="primary-button" onClick={() => void postponeItem(item)}>Postpone</button></div>}
      </>}
    </article>;
  }

  function renderDayColumns() {
    return <div className="planner-columns">{categories.map((category) => {
      const categoryItems = selectedItems.filter((item) => item.category === category.id).sort((a, b) => (a.status === "Active" ? 0 : 1) - (b.status === "Active" ? 0 : 1) || String(a.plannedTime ?? "99:99").localeCompare(String(b.plannedTime ?? "99:99")) || a.createdAt.localeCompare(b.createdAt));
      const activeItems = categoryItems.filter((item) => item.status === "Active");
      const resolvedItems = categoryItems.filter((item) => item.status !== "Active");
      const items = showCompleted[category.id] ? categoryItems : activeItems;
      return <section className={`planner-column ${category.id.toLowerCase()}`} key={category.id}>
        <div className="planner-column-heading"><span>{category.mark}</span><div><h3>{category.label}</h3></div><em>{activeItems.length}</em><button type="button" className="planner-column-add" onClick={() => openAdd(category.id)} aria-label={`Add ${category.id.toLowerCase()}`}>＋</button></div>
        <div className="planner-item-list">{items.map((item, itemIndex) => {
          const baseSerial = `${category.code}${itemIndex + 1}`;
          const itemAttachments = data.dayPlanAttachments.filter((attachment) => attachment.chainId === item.chainId);
          const taskAttachments = itemAttachments.filter((attachment) => !attachment.detailId);
          return item.status === "Active" ? renderActiveCard(item, baseSerial, category) : <article className="planner-card resolved" key={item.id}><div className="planner-card-heading"><span className={`planner-result-mark ${item.status.toLowerCase().replace(" ", "-")}`}>{item.status === "Completed" ? "✓" : item.status === "Carried Forward" ? "↪" : "×"}</span><span className="planner-item-serial">{baseSerial}</span><strong>{item.title}</strong></div><AttachmentList attachments={taskAttachments} urlFor={(attachment) => `/api/day-plan-attachments?id=${encodeURIComponent(attachment.id)}`} onRename={onRenameAttachment} onDelete={onDeleteAttachment} /><MyDayDetails readOnly baseSerial={baseSerial} chainId={item.chainId} details={itemDetails(item)} attachments={itemAttachments} onChange={onDetailsChange} onUploadAttachment={onUploadAttachment} onRenameAttachment={onRenameAttachment} onDeleteAttachment={onDeleteAttachment} /><div className="planner-card-meta"><span>{item.status}{item.plannedTime ? ` · ${formatAppTime(item.plannedTime)}` : ""}</span>{item.plannedTime && !item.reminderClosedAt && <button type="button" onClick={() => setReminderEditorItemId(item.id)}>{item.reminderRepeat === "daily-until-closed" ? "Daily reminder is open" : "Reminder settings"}</button>}</div></article>;
        })}</div>
        {!activeItems.length && !showCompleted[category.id] && <div className="empty-planner-column"><span>{category.mark}</span><p>No open {category.label.toLowerCase()} planned.</p><button type="button" onClick={() => openAdd(category.id)}>Add one</button></div>}
        <button type="button" className="show-completed-button" disabled={!resolvedItems.length} onClick={() => setShowCompleted((current) => ({ ...current, [category.id]: !current[category.id] }))}>{showCompleted[category.id] ? "Hide completed" : `Show completed${resolvedItems.length ? ` (${resolvedItems.length})` : ""}`}</button>
      </section>;
    })}</div>;
  }

  function renderWeek() {
    return <div className="planner-week-board">{week.map((date) => {
      const items = data.dayPlanItems.filter((item) => item.planDate === date && item.status === "Active").sort((a, b) => String(a.plannedTime ?? "99:99").localeCompare(String(b.plannedTime ?? "99:99")));
      return <section className={`planner-week-day ${date === selectedDate ? "selected" : ""} ${date === localDate() ? "today" : ""}`} key={date}>
        <button type="button" className="week-day-heading" onClick={() => { onSelectedDate(date); setPlannerView("day"); }}><strong>{fullPlannerDate(date)}</strong><span>{items.length} open</span></button>
        <div>{items.map((item) => <article className={`week-plan-item ${item.category.toLowerCase()}`} key={item.id}><button type="button" aria-label={`Complete ${item.title}`} onClick={() => void resolveItem(item, "Completed")}>○</button><div><strong>{item.title}</strong><span>{item.category}{item.plannedTime ? ` · ${formatAppTime(item.plannedTime)}` : ""}</span></div></article>)}</div>
        <button type="button" className="week-add-button" onClick={() => openAdd("Task", date)}>＋ Add</button>
      </section>;
    })}</div>;
  }

  function renderMonth() {
    return <div className="planner-month-board"><div className="month-board-weekdays">{fullWeekdaysMondayFirst.map((day) => <span key={day}>{day}</span>)}</div><div className="month-board-grid">{monthDates.map((date) => {
      const items = data.dayPlanItems.filter((item) => item.planDate === date && item.status === "Active");
      return <section className={`${date.slice(0, 7) !== calendarMonth ? "outside " : ""}${date === localDate() ? "today " : ""}${date === selectedDate ? "selected" : ""}`.trim()} key={date}><button type="button" className="month-day-number" onClick={() => { onSelectedDate(date); setPlannerView("day"); }}>{dayDate(date).getDate()}</button><div>{items.slice(0, 3).map((item) => <button type="button" className={item.category.toLowerCase()} onClick={() => { onSelectedDate(date); setPlannerView("day"); }} key={item.id}><span>{item.category === "Task" ? "✓" : item.category === "Call" ? "☎" : "@"}</span>{item.title}</button>)}{items.length > 3 && <small>+{items.length - 3} more</small>}</div><button type="button" className="month-add-button" onClick={() => openAdd("Task", date)}>＋</button></section>;
    })}</div></div>;
  }

  const linkSections = journalLink ? [...data.departments, ...data.subsections].filter((section) => section.notebookId === journalLink.notebookId).sort((a, b) => a.serialPrefix.localeCompare(b.serialPrefix, undefined, { numeric: true })) : [];
  const linkPages = journalLink ? data.pages.filter((page) => page.subsectionId === journalLink.sectionId).sort((a, b) => a.serial.localeCompare(b.serial, undefined, { numeric: true })) : [];
  const linkItem = journalLink && data.dayPlanItems.find((item) => item.id === journalLink.itemId);
  const focusedItem = selectedItems.find((item) => item.id === focusedItemId && item.status === "Active");
  const focusedCategory = focusedItem && categories.find((category) => category.id === focusedItem.category);
  const focusedCategoryItems = focusedItem ? selectedItems.filter((item) => item.category === focusedItem.category).sort((a, b) => (a.status === "Active" ? 0 : 1) - (b.status === "Active" ? 0 : 1) || String(a.plannedTime ?? "99:99").localeCompare(String(b.plannedTime ?? "99:99")) || a.createdAt.localeCompare(b.createdAt)) : [];
  const focusedBaseSerial = focusedItem && focusedCategory ? `${focusedCategory.code}${Math.max(0, focusedCategoryItems.findIndex((item) => item.id === focusedItem.id)) + 1}` : "";
  const reminderEditorItem = data.dayPlanItems.find((item) => item.id === reminderEditorItemId);
  const addCategoryDefinition = addCategory ? categories.find((category) => category.id === addCategory) : null;
  const addBaseSerial = addCategoryDefinition
    ? `${addCategoryDefinition.code}${data.dayPlanItems.filter((item) => item.planDate === addDate && item.category === addCategory && item.status === "Active").length + 1}`
    : "T1";

  return <div className="my-day-view" data-nav-scroll="my-day">
    <header className="my-day-header view-title-bar"><h1>My Day</h1></header>
    <div className="my-day-header-actions my-day-control-bar"><div className="planner-view-switch" aria-label="Planner view">{(["day", "week", "month"] as const).map((view) => <button type="button" className={plannerView === view ? "active" : ""} onClick={() => setPlannerView(view)} key={view}>{view[0].toUpperCase() + view.slice(1)}</button>)}</div><div className="selected-day-navigation"><button type="button" onClick={() => navigatePeriod(-1)}>‹</button><button type="button" className="today-button" onClick={() => onSelectedDate(localDate())}>Today</button><button type="button" onClick={() => navigatePeriod(1)}>›</button></div></div>
    <div className={`my-day-layout view-${plannerView}`}>
      <aside className="planner-calendar">
        <div className="calendar-heading"><button type="button" onClick={() => onCalendarMonth(shiftMonth(calendarMonth, -1))}>‹</button><strong>{monthHeading(calendarMonth)}</strong><button type="button" onClick={() => onCalendarMonth(shiftMonth(calendarMonth, 1))}>›</button></div>
        <div className="calendar-weekdays">{shortWeekdaysMondayFirst.map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
        <div className="calendar-grid">{monthDates.map((date) => {
          const count = data.dayPlanItems.filter((item) => item.planDate === date && item.status === "Active").length;
          return <button type="button" className={`${date.slice(0, 7) !== calendarMonth ? "outside " : ""}${date === localDate() ? "today " : ""}${date === selectedDate ? "selected" : ""}`.trim()} onClick={() => onSelectedDate(date)} key={date}><span>{dayDate(date).getDate()}</span>{count > 0 && <em>{count}</em>}</button>;
        })}</div>
      </aside>
      <main className="day-planner-sheet" data-nav-scroll="my-day-sheet">
        {plannerView === "day" ? <div className="planner-day-heading date-hero">
          <div className="date-hero-number">{dayDate(selectedDate).getDate()}</div>
          <div className="date-hero-copy"><small>{selectedDate === localDate() ? "TODAY" : new Intl.DateTimeFormat("en", { weekday: "long" }).format(dayDate(selectedDate)).toUpperCase()}</small><h2>{new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(dayDate(selectedDate))}</h2><p>{dayHeading(selectedDate)} · {selectedItems.filter((item) => item.status === "Active").length} open</p></div>
        </div> : <div className="planner-day-heading"><div><small>{plannerView === "month" ? calendarMonth : selectedDate}</small><h2>{plannerView === "month" ? monthHeading(calendarMonth) : `${friendlyDate(week[0])} – ${friendlyDate(week[6])}`}</h2></div></div>}
        {plannerView === "day" ? renderDayColumns() : plannerView === "week" ? renderWeek() : renderMonth()}
      </main>
    </div>
    {focusedItem && focusedCategory && typeof document !== "undefined" && createPortal(<div className="planner-focus-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setFocusedItemId(""); }}>
      {renderActiveCard(focusedItem, focusedBaseSerial, focusedCategory, true)}
    </div>, document.body)}
    {addCategory && typeof document !== "undefined" && createPortal(<div className="modal-backdrop planner-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setAddCategory(null); }} onTouchMove={(event) => { if (event.currentTarget === event.target) event.preventDefault(); }}><form className="planner-add-modal" role="dialog" aria-modal="true" aria-label={`New ${addCategory}`} onSubmit={(event) => void submitItem(event)}>
      <div className="modal-heading"><div className={`modal-icon ${addCategory.toLowerCase()}`}>{categories.find((category) => category.id === addCategory)?.mark}</div><div><h2>New {addCategory}</h2></div><button type="button" className="close-button" onClick={() => setAddCategory(null)}>×</button></div>
      <label><span>{addCategory} title</span><input autoFocus value={addTitle} onChange={(event) => setAddTitle(event.target.value)} placeholder={addCategory === "Call" ? "Who do you need to call?" : addCategory === "Email" ? "Which email needs attention?" : "What needs to be done?"} /></label>
      <div className="planner-add-schedule"><div className="planner-add-schedule-field"><span>Date</span><AppDateControl value={addDate} wrapperClassName="planner-add-date-control" ariaLabel={`New ${addCategory.toLowerCase()} date`} required onChange={setAddDate} /></div><div className="planner-time-field"><span>{addCategory === "Call" ? "Call time" : addCategory === "Email" ? "Email time" : "Time"}</span><AppTimeControl value={addTime || null} ariaLabel={`New ${addCategory.toLowerCase()} time`} onChange={setAddTime} /></div><label><span>Assigned to</span><select value={addAssigneeId} onChange={(event) => setAddAssigneeId(event.target.value)}><option value="">Unassigned</option>{data.people.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label></div>
      <section className="planner-add-details"><div className="planner-add-details-heading"><div><strong>Details</strong></div></div><MyDayDetails baseSerial={addBaseSerial} chainId="new-day-plan" details={addDetails} attachments={[]} actionsOnly onChange={(_chainId, details) => setAddDetails(details)} onUploadAttachment={async () => {}} onRenameAttachment={async () => {}} onDeleteAttachment={async () => {}} /></section>
      <div className="modal-actions"><button type="button" onClick={() => setAddCategory(null)}>Cancel</button><button type="submit" className="primary-button" disabled={addSaving || !addTitle.trim()}>{addSaving ? "Adding…" : `Add ${addCategory.toLowerCase()}`}</button></div>
    </form></div>, document.body)}
    {journalLink && linkItem && typeof document !== "undefined" && createPortal(<div className="modal-backdrop planner-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setJournalLink(null); }} onTouchMove={(event) => { if (event.currentTarget === event.target) event.preventDefault(); }}><form className="planner-journal-modal" role="dialog" aria-modal="true" aria-label="Add to journal" onSubmit={(event) => { event.preventDefault(); if (!journalLink.pageId) return; void onLinkJournal(journalLink.itemId, journalLink.pageId).then(() => setJournalLink(null)).catch((error) => window.alert(error instanceof Error ? error.message : "The item could not be added to the journal.")); }}>
      <div className="modal-heading"><div className="modal-icon">↗</div><div><h2>Add to journal</h2><p>Choose the exact section and page for “{linkItem.title}”.</p></div><button type="button" className="close-button" onClick={() => setJournalLink(null)}>×</button></div>
      <label><span>Notebook</span><select value={journalLink.notebookId} onChange={(event) => { const notebookId = event.target.value; const section = [...data.departments, ...data.subsections].find((item) => item.notebookId === notebookId); const page = section && data.pages.find((item) => item.subsectionId === section.id); setJournalLink({ ...journalLink, notebookId, sectionId: section?.id ?? "", pageId: page?.id ?? "" }); }}>{data.notebooks.map((notebook) => <option value={notebook.id} key={notebook.id}>{notebook.name}</option>)}</select></label>
      <label><span>Section</span><select value={journalLink.sectionId} onChange={(event) => { const sectionId = event.target.value; setJournalLink({ ...journalLink, sectionId, pageId: data.pages.find((page) => page.subsectionId === sectionId)?.id ?? "" }); }}>{linkSections.map((section) => <option value={section.id} key={section.id}>{section.serialPrefix} · {section.name}</option>)}</select></label>
      <label><span>Page</span><select required value={journalLink.pageId} onChange={(event) => setJournalLink({ ...journalLink, pageId: event.target.value })}><option value="">Choose a page…</option>{linkPages.map((page) => <option value={page.id} key={page.id}>{page.serial} · {page.title}</option>)}</select></label>
      <div className="journal-link-preview"><span>MY DAY ITEM</span><strong>{linkItem.title}</strong><p>The title and its dated detail lines will appear as one linked journal update.</p></div>
      <div className="modal-actions"><button type="button" onClick={() => setJournalLink(null)}>Cancel</button><button type="submit" className="primary-button" disabled={!journalLink.pageId}>{linkItem.linkedPageId ? "Update journal link" : "Add to journal"}</button></div>
    </form></div>, document.body)}
    {reminderEditorItem && typeof document !== "undefined" && <ReminderSettingsModal
      title={reminderEditorItem.title}
      dateTime={reminderEditorItem.plannedTime ? `${reminderEditorItem.planDate}T${reminderEditorItem.plannedTime}` : null}
      repeat={reminderEditorItem.reminderRepeat ?? "none"}
      endDate={reminderEditorItem.reminderEndDate}
      closedAt={reminderEditorItem.reminderClosedAt}
      onCancel={() => setReminderEditorItemId("")}
      onSave={(value) => {
        onChange({ ...reminderEditorItem, planDate: value.dateTime.slice(0, 10), plannedTime: value.dateTime.slice(11, 16), reminderRepeat: value.repeat, reminderEndDate: value.endDate, reminderClosedAt: null }, true);
        setReminderEditorItemId("");
        void onReminderPermission();
      }}
      onCloseReminder={() => {
        onChange({ ...reminderEditorItem, reminderClosedAt: localDateTime() }, true);
        setReminderEditorItemId("");
      }}
    />}
  </div>;
}

function Dashboard({ data, onOpenMyDay, onOpenMeetings, onOpenPeople, onOpenMeeting, onOpenPerson, onOpenFilter, onOpenDepartment }: { data: AppData; onOpenMyDay: () => void; onOpenMeetings: () => void; onOpenPeople: () => void; onOpenMeeting: (meetingId: string) => void; onOpenPerson: (personId: string) => void; onOpenFilter: (filter: string) => void; onOpenDepartment: (departmentId: string) => void }) {
  const [clockNow, setClockNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const today = localDate();
  const dueToday = data.pages.filter((page) => pageMatchesFilter(page, "today"));
  const overdue = data.pages.filter(isOverdue);
  const attention = data.pages.filter((page) => pageMatchesFilter(page, "attention"));
  const completed = data.pages.filter((page) => page.status === "Completed").length;
  const active = data.pages.filter(isOpen).length;
  const todayPlan = data.dayPlanItems.filter((item) => item.planDate === today && item.status === "Active");
  const completedToday = data.dayPlanItems.filter((item) => item.planDate === today && item.status === "Completed").length;
  const todayCategoryCounts = (["Task", "Call", "Email"] as const).map((category) => ({ category, count: todayPlan.filter((item) => item.category === category).length }));
  const urgentToday = todayPlan.filter((item) => item.linkedPageId && data.pages.some((page) => page.id === item.linkedPageId && page.priority === "High"));
  const upcomingMeetings = data.meetings.filter((meeting) => meeting.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  const meetingPreview = upcomingMeetings.length ? upcomingMeetings : data.meetings.slice(0, 3);
  const personLoads = data.people.map((person) => ({ person, tasks: data.pages.filter((page) => page.ownerId === person.id && isOpen(page)) })).sort((a, b) => b.tasks.length - a.tasks.length);
  const departmentActivity = data.departments.map((department) => {
    const subsectionIds = [department.id, ...data.subsections.filter((item) => item.departmentId === department.id).map((item) => item.id)];
    const pages = data.pages.filter((page) => subsectionIds.includes(page.subsectionId));
    return { department, activeCount: pages.filter(isOpen).length, completedCount: pages.filter((page) => page.status === "Completed").length, totalCount: pages.length };
  }).sort((a, b) => b.activeCount - a.activeCount || b.totalCount - a.totalCount || a.department.name.localeCompare(b.department.name));
  const currentDate = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(clockNow);
  const greeting = clockNow.getHours() < 12 ? "Good morning" : clockNow.getHours() < 17 ? "Good afternoon" : "Good evening";
  return (
    <div className="dashboard-view" data-nav-scroll="dashboard">
      <div className="dashboard-hero view-title-bar"><div><h1>Dashboard</h1><p className="dashboard-greeting">{greeting}, Fahim.</p></div><span className="eyebrow">{currentDate.toUpperCase()}</span></div>

      <div className="dashboard-overview-grid">
        <section className="dashboard-module my-day-module">
          <div className="dashboard-module-heading"><div><small>MY DAY</small><h2>Today&apos;s plan</h2></div><button type="button" onClick={onOpenMyDay}>Open My Day <span>›</span></button></div>
          <div className="dashboard-stat-grid my-day-stat-grid">
            {todayCategoryCounts.map(({ category, count }) => <button type="button" className={category.toLowerCase()} key={category} onClick={onOpenMyDay}><strong>{count}</strong><span>{category === "Email" ? "Emails" : `${category}s`}</span></button>)}
          </div>
          <div className="dashboard-preview-list dashboard-urgent-list">
            {urgentToday.slice(0, 3).map((item) => <button type="button" key={item.id} onClick={onOpenMyDay}><span className={`dashboard-kind ${item.category.toLowerCase()}`}>{item.category.slice(0, 1)}</span><div><strong>{item.title}</strong><small>Urgent · {item.plannedTime ? formatAppTime(item.plannedTime) : "No time set"}</small></div><b>›</b></button>)}
            {!urgentToday.length && <div className="dashboard-empty-state dashboard-urgent-empty">No urgent items flagged for today.</div>}
          </div>
          <button type="button" className="dashboard-wide-link" onClick={onOpenMyDay}><span>{todayPlan.length} active today</span><b>{completedToday} completed ›</b></button>
        </section>

        <section className="dashboard-module journal-module">
          <div className="dashboard-module-heading"><div><small>JOURNAL</small><h2>Pages and priorities</h2></div><button type="button" onClick={() => onOpenFilter("all")}>Open Journal <span>›</span></button></div>
          <div className="dashboard-stat-grid">
            <button type="button" onClick={() => onOpenFilter("today")}><strong>{dueToday.length}</strong><span>Due today</span></button>
            <button type="button" className="urgent" onClick={() => onOpenFilter("overdue")}><strong>{overdue.length}</strong><span>Overdue</span></button>
            <button type="button" onClick={() => onOpenFilter("waiting")}><strong>{data.pages.filter((page) => page.status === "Waiting").length}</strong><span>Waiting</span></button>
            <button type="button" onClick={() => onOpenFilter("attention")}><strong>{attention.length}</strong><span>Attention</span></button>
            <button type="button" className="complete" onClick={() => onOpenFilter("completed")}><strong>{completed}</strong><span>Completed</span></button>
          </div>
          <button type="button" className="dashboard-wide-link" onClick={() => onOpenFilter("in-progress")}><span>{active} active pages</span><b>Review current work ›</b></button>
        </section>

        <section className="dashboard-module meetings-module">
          <div className="dashboard-module-heading"><div><small>MEETINGS</small><h2>{upcomingMeetings.length ? "Coming up" : "Recent meetings"}</h2></div><button type="button" onClick={onOpenMeetings}>Open Meetings <span>›</span></button></div>
          <div className="dashboard-preview-list">
            {meetingPreview.map((meeting) => <button type="button" key={meeting.id} onClick={() => onOpenMeeting(meeting.id)}><span className="dashboard-date-tile"><b>{formatAppDate(meeting.date).slice(0, 2)}</b><small>{new Intl.DateTimeFormat("en-GB", { month: "short" }).format(new Date(`${meeting.date}T00:00:00`))}</small></span><div><strong>{meeting.purpose || "Untitled meeting"}</strong><small>{meeting.number} · {meeting.venue || "Venue not set"}</small></div><b>›</b></button>)}
            {!meetingPreview.length && <div className="dashboard-empty-state">No meetings recorded.</div>}
          </div>
        </section>

        <section className="dashboard-module people-module">
          <div className="dashboard-module-heading"><div><small>TEAM</small><h2>Responsibilities</h2></div><button type="button" onClick={onOpenPeople}>Open Team <span>›</span></button></div>
          <div className="dashboard-preview-list people-preview-list">
            {personLoads.slice(0, 4).map(({ person, tasks }) => <button type="button" key={person.id} onClick={() => onOpenPerson(person.id)}><span className="person-avatar">{initials(person.name)}</span><div><strong>{person.name}</strong><small>{person.role || "Role not entered"}</small></div><em>{tasks.length} active</em><b>›</b></button>)}
            {!personLoads.length && <div className="dashboard-empty-state">No team members added.</div>}
          </div>
        </section>
      </div>

      <section className="department-strip"><div className="panel-heading"><div><small>NOTEBOOK</small><h2>Department activity</h2></div></div><div className="department-cards">{departmentActivity.slice(0, 6).map(({ department, activeCount, completedCount }) => <button key={department.id} onClick={() => onOpenDepartment(department.id)}><span style={{ background: department.color }} /><strong>{department.name}</strong><p>{activeCount} active · {completedCount} completed</p></button>)}</div></section>
    </div>
  );
}

function TaskManager({ data, selectedPage, filter, onFilter, onSelectPage, onPageChange, onOutlineChange, onOpenSource, onOpenPerson }: {
  data: AppData;
  selectedPage: Page;
  filter: string;
  onFilter: (value: string) => void;
  onSelectPage: (id: string) => void;
  onPageChange: (page: Page, save?: boolean) => void;
  onOutlineChange: (pageId: string, items: OutlineItem[], save?: boolean) => void;
  onOpenSource: (page: Page) => void;
  onOpenPerson: (id: string) => void;
}) {
  const filters = [
    ["today", "Due today"], ["attention", "Requires attention"], ["week", "This week"], ["overdue", "Overdue"], ["high", "High priority"], ["meetings", "From meetings"], ["all", "All active"], ["completed", "Completed"],
  ];
  const filtered = data.pages.filter((page) => pageMatchesFilter(page, filter));
  return (
    <div className="three-pane task-panes">
      <aside className="task-filter-pane"><div className="hierarchy-heading"><small>TASK MANAGER</small><h2>Smart lists</h2></div>{filters.map(([id, label]) => <button className={filter === id ? "active" : ""} key={id} onClick={() => onFilter(id)}><span className={`smart-icon ${id}`}>{id === "overdue" || id === "attention" ? "!" : id === "completed" ? "✓" : "•"}</span><strong>{label}</strong><em>{data.pages.filter((page) => pageMatchesFilter(page, id)).length}</em></button>)}</aside>
      <section className="task-list-pane"><div className="pane-title-row"><div><small>SMART LIST</small><h2>{filters.find((item) => item[0] === filter)?.[1]}</h2></div><span>{filtered.length}</span></div><div className="task-list-scroll">{filtered.map((page) => {
        const owner = data.people.find((item) => item.id === page.ownerId);
        return <button className={`task-row ${selectedPage.id === page.id ? "selected" : ""}`} key={page.id} onClick={() => onSelectPage(page.id)}><span className={`task-check ${page.status === "Completed" ? "done" : ""}`}>{page.status === "Completed" ? "✓" : ""}</span><div><strong>{page.title}</strong><p>{page.serial} · {journalSectionName(data, page.subsectionId)}</p><div><span className={`status-pill ${statusTone(page.status)}`}>{page.status}</span>{page.sourceType === "Meeting" && <span className="source-mini">M</span>}</div></div><aside><span className={isOverdue(page) ? "date-overdue" : ""}>{friendlyDate(page.dueDate)}</span>{owner && <em>{initials(owner.name)}</em>}</aside></button>;
      })}{!filtered.length && <div className="empty-pane"><span>✓</span><p>No tasks in this list.</p></div>}</div></section>
      <PageEditor compact page={selectedPage} data={data} onPageChange={onPageChange} onOutlineChange={onOutlineChange} onOpenSource={onOpenSource} onOpenPerson={onOpenPerson} onManagePeople={() => {}} />
    </div>
  );
}

function MeetingsView({ data, meeting, selectedAgendaPosition, onAgendaPosition, onSelectMeeting, onCreateMeeting, onDataChange, onSave, onLinkTask, onOpenPage }: {
  data: AppData;
  meeting: Meeting;
  selectedAgendaPosition: number;
  onAgendaPosition: (position: number) => void;
  onSelectMeeting: (id: string) => void;
  onCreateMeeting: () => void;
  onDataChange: React.Dispatch<React.SetStateAction<AppData>>;
  onSave: (meeting: Meeting, agendas: AgendaItem[]) => Promise<void>;
  onLinkTask: (meetingId: string, agendaId: string) => Promise<void>;
  onOpenPage: (pageId: string) => void;
}) {
  const meetingAgendas = data.agendaItems.filter((item) => item.meetingId === meeting.id).sort((a, b) => a.position - b.position);
  const paddedAgendas = Array.from({ length: 10 }, (_, index) => meetingAgendas.find((item) => item.position === index + 1) ?? {
    id: `agenda-${meeting.id}-${index + 1}`,
    meetingId: meeting.id,
    position: index + 1,
    title: "",
    discussion: "",
    actionText: "",
    linkedPageId: null,
  });
  const selectedAgenda = paddedAgendas.find((item) => item.position === selectedAgendaPosition) ?? paddedAgendas[0];

  function updateMeeting(changes: Partial<Meeting>) {
    onDataChange((current) => ({ ...current, meetings: current.meetings.map((item) => item.id === meeting.id ? { ...item, ...changes } : item) }));
  }

  function updateAgenda(position: number, changes: Partial<AgendaItem>) {
    const existing = data.agendaItems.find((item) => item.meetingId === meeting.id && item.position === position);
    const next = { ...(existing ?? paddedAgendas[position - 1]), ...changes };
    onDataChange((current) => ({ ...current, agendaItems: [...current.agendaItems.filter((item) => !(item.meetingId === meeting.id && item.position === position)), next] }));
  }

  function participants() {
    return Array.from({ length: 9 }, (_, index) => meeting.participants[index] ?? "");
  }

  async function save() {
    const currentMeeting = data.meetings.find((item) => item.id === meeting.id) ?? meeting;
    const agendas = Array.from({ length: 10 }, (_, index) => data.agendaItems.find((item) => item.meetingId === meeting.id && item.position === index + 1) ?? paddedAgendas[index]);
    await onSave(currentMeeting, agendas);
  }

  return (
    <div className="meetings-layout" data-nav-scroll="meetings">
      <aside className="meeting-list-pane"><div className="hierarchy-heading"><small>MEETINGS</small><h2>Meeting register</h2></div><button className="new-meeting-button" onClick={onCreateMeeting}>+ New meeting</button><div className="meeting-list">{data.meetings.map((item) => <button className={item.id === meeting.id ? "selected" : ""} key={item.id} onClick={() => { onSelectMeeting(item.id); onAgendaPosition(1); }}><div><strong>{item.number}</strong><span>{friendlyDate(item.date)}</span></div><p>{item.purpose}</p><small>{item.venue || "Venue not entered"}</small></button>)}</div></aside>
      <div className="meeting-workspace" data-nav-scroll="meeting-workspace">
        <div className="meeting-toolbar"><div><span className="meeting-number-pill">{meeting.number}</span><strong>Meeting registration & minutes</strong></div><div><span>Edits also update linked journal tasks</span><button className="primary-button" onClick={() => void save()}>Save meeting</button></div></div>
        <section className="meeting-sheet">
          <header className="meeting-sheet-header"><p>Vital Agri Nutrients</p><h1>Meeting Agenda & M.O.M</h1><span>{meeting.number}</span></header>
          <div className="meeting-meta-grid">
            <label><span>Convener:</span><input value={meeting.convener} onChange={(event) => updateMeeting({ convener: event.target.value })} onBlur={() => void save()} /></label>
            <label><span>Venue:</span><input value={meeting.venue} onChange={(event) => updateMeeting({ venue: event.target.value })} onBlur={() => void save()} /></label>
            <label><span>Date:</span><AppDateControl value={meeting.date} wrapperClassName="meeting-date-control" ariaLabel="Meeting date" required onChange={(date) => { updateMeeting({ date }); window.setTimeout(() => void save(), 0); }} /></label>
            <label className="purpose-field"><span>Purpose:</span><input value={meeting.purpose} onChange={(event) => updateMeeting({ purpose: event.target.value })} onBlur={() => void save()} /></label>
            <label><span>Called by:</span><input value={meeting.calledBy} onChange={(event) => updateMeeting({ calledBy: event.target.value })} onBlur={() => void save()} /></label>
          </div>
          <section className="form-section participants-section"><h2>Participants:</h2><div className="participants-grid">{participants().map((participant, index) => <label key={index}><span>{index + 1}:</span><input value={participant} onChange={(event) => { const next = participants(); next[index] = event.target.value; updateMeeting({ participants: next }); }} onBlur={() => void save()} /></label>)}</div></section>
          <section className="form-section agenda-section"><div className="form-section-heading"><h2>Agenda Items</h2><p>Select an item to write its discussion and action below.</p></div><div className="agenda-lines">{paddedAgendas.map((agenda) => <label className={agenda.position === selectedAgendaPosition ? "selected" : ""} key={agenda.id} onClick={() => onAgendaPosition(agenda.position)}><span>{agenda.position}:</span><input value={agenda.title} placeholder="Agenda item" onFocus={() => onAgendaPosition(agenda.position)} onChange={(event) => updateAgenda(agenda.position, { title: event.target.value })} onBlur={() => void save()} />{agenda.linkedPageId && <button type="button" title="Open linked journal task" onClick={(event) => { event.preventDefault(); onOpenPage(agenda.linkedPageId!); }}>↗</button>}</label>)}</div></section>
          <div className="discussion-action-grid">
            <section className="form-section discussion-section"><div className="form-section-heading"><h2>Agenda Item {selectedAgenda.position} Discussion</h2><span>{selectedAgenda.title || "Select or name this agenda item"}</span></div><textarea value={selectedAgenda.discussion} placeholder="Write the discussion naturally here…" onChange={(event) => updateAgenda(selectedAgenda.position, { discussion: event.target.value })} onBlur={() => void save()} /></section>
            <section className="form-section action-section"><div className="form-section-heading"><h2>Action Taken / Update</h2>{selectedAgenda.linkedPageId ? <button className="linked-task-button" onClick={() => onOpenPage(selectedAgenda.linkedPageId!)}>Open linked journal task ↗</button> : <button className="link-task-button" disabled={!selectedAgenda.title && !selectedAgenda.actionText} onClick={() => void onLinkTask(meeting.id, selectedAgenda.id)}>Create journal task</button>}</div><textarea value={selectedAgenda.actionText} placeholder="Write the agreed action or update…" onChange={(event) => updateAgenda(selectedAgenda.position, { actionText: event.target.value })} onBlur={() => void save()} /><p>{selectedAgenda.linkedPageId ? "This is a shared task. Editing the action updates its title in the Journal, and editing the Journal title updates this action." : "When ready, create a linked journal task. Its journal serial number will be generated automatically."}</p></section>
          </div>
          <div className="meeting-general-notes"><label><span>Overall discussion note</span><textarea value={meeting.discussion} onChange={(event) => updateMeeting({ discussion: event.target.value })} onBlur={() => void save()} /></label><label><span>Overall meeting update</span><textarea value={meeting.updateText} onChange={(event) => updateMeeting({ updateText: event.target.value })} onBlur={() => void save()} /></label></div>
        </section>
      </div>
    </div>
  );
}

function PeopleView({ data, person, onSelectPerson, onOpenPage, onManage }: { data: AppData; person: Person; onSelectPerson: (id: string) => void; onOpenPage: (page: Page, view?: ViewName) => void; onManage: () => void }) {
  const tasks = data.pages.filter((page) => page.ownerId === person.id);
  const active = tasks.filter(isOpen);
  const completed = tasks.filter((page) => page.status === "Completed");
  const overdue = active.filter(isOverdue);
  const onTimeCompleted = completed.filter((page) => !page.dueDate || Boolean(page.completedDate && page.completedDate <= page.dueDate));
  const onTimeRate = completed.length ? Math.round(onTimeCompleted.length / completed.length * 100) : 0;
  return (
    <div className="people-layout" data-nav-scroll="people">
      <aside className="people-list-pane"><div className="hierarchy-heading"><small>TEAM</small><h2>Team members</h2></div><button className="manage-people-button" onClick={onManage}>＋ Manage team</button><div className="people-list">{data.people.map((item) => { const count = data.pages.filter((page) => page.ownerId === item.id && isOpen(page)).length; return <button className={item.id === person.id ? "selected" : ""} key={item.id} onClick={() => onSelectPerson(item.id)}><span className="person-avatar">{initials(item.name)}</span><div><strong>{item.name}</strong><p>{item.role}</p></div><em>{count}</em></button>; })}</div></aside>
      <div className="person-workspace" data-nav-scroll="person-workspace">
        <header className="person-header"><div className="large-avatar">{initials(person.name)}</div><div><span>ASSIGNEE PROFILE</span><h1>{person.name}</h1><p>{person.role} · {data.departments.find((item) => item.id === person.departmentId)?.name}</p></div></header>
        <div className="person-metrics"><div><span>Active tasks</span><strong>{active.length}</strong></div><div className="red"><span>Overdue</span><strong>{overdue.length}</strong></div><div><span>Completed</span><strong>{completed.length}</strong></div><div className="green"><span>On-time rate</span><strong>{onTimeRate}%</strong></div></div>
        <div className="person-columns">
          <section className="person-task-panel"><div className="panel-heading"><div><small>RESPONSIBILITY</small><h2>Current tasks</h2></div><span>{active.length} active</span></div>{active.map((page) => <button className="person-task-row" key={page.id} onClick={() => onOpenPage(page)}><span className={`focus-status ${statusTone(page.status)}`} /><div><strong>{page.title}</strong><p>{page.serial} · {journalSectionName(data, page.subsectionId)}</p></div><aside><span className={isOverdue(page) ? "date-overdue" : ""}>{friendlyDate(page.dueDate)}</span><em className={`status-pill ${statusTone(page.status)}`}>{page.status}</em></aside></button>)}{!active.length && <div className="empty-pane"><span>✓</span><p>No active tasks.</p></div>}</section>
          <section className="performance-panel"><div className="panel-heading"><div><small>PERFORMANCE</small><h2>Completion view</h2></div></div><div className="completion-ring" style={{ "--completion": `${completed.length / Math.max(1, tasks.length) * 360}deg` } as React.CSSProperties}><div><strong>{Math.round(completed.length / Math.max(1, tasks.length) * 100)}%</strong><span>completed</span></div></div><div className="performance-lines"><p><span>Assigned in this journal</span><strong>{tasks.length}</strong></p><p><span>Completed</span><strong>{completed.length}</strong></p><p><span>Requires attention</span><strong>{tasks.filter((page) => page.status === "Requires Attention").length}</strong></p><p><span>Meeting actions</span><strong>{tasks.filter((page) => page.sourceType === "Meeting").length}</strong></p></div><p className="metric-note">This view uses tasks where {person.name} is the primary owner.</p></section>
        </div>
      </div>
    </div>
  );
}
