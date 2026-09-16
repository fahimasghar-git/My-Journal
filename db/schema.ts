import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const notebooks = sqliteTable("notebooks", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6d4cc2"),
  position: integer("position").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const departments = sqliteTable("departments", {
  id: text("id").primaryKey(),
  notebookId: text("notebook_id").notNull().default("plant-operations"),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6d4cc2"),
  parentId: text("parent_id"),
  serialPrefix: text("serial_prefix").notNull().default(""),
  position: integer("position").notNull().default(0),
}, (table) => [
  index("idx_departments_notebook_position").on(table.notebookId, table.position),
  index("idx_departments_parent").on(table.parentId),
]);

export const subsections = sqliteTable("subsections", {
  id: text("id").primaryKey(),
  notebookId: text("notebook_id").notNull().default("plant-operations"),
  departmentId: text("department_id").notNull(),
  parentId: text("parent_id"),
  name: text("name").notNull(),
  serialPrefix: text("serial_prefix").notNull(),
  position: integer("position").notNull().default(0),
}, (table) => [
  index("idx_subsections_notebook_position").on(table.notebookId, table.position),
  index("idx_subsections_department").on(table.departmentId),
  index("idx_subsections_parent").on(table.parentId),
]);

export const people = sqliteTable("people", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull().default(""),
  departmentId: text("department_id"),
});

export const pages = sqliteTable("pages", {
  id: text("id").primaryKey(),
  serial: text("serial").notNull(),
  parentId: text("parent_id"),
  subsectionId: text("subsection_id").notNull(),
  title: text("title").notNull(),
  notes: text("notes").notNull().default(""),
  status: text("status").notNull().default("Not Started"),
  priority: text("priority").notNull().default("Medium"),
  startDate: text("start_date"),
  dueDate: text("due_date"),
  completedDate: text("completed_date"),
  reminderDate: text("reminder_date"),
  reminderRepeat: text("reminder_repeat").notNull().default("none"),
  reminderEndDate: text("reminder_end_date"),
  reminderClosedAt: text("reminder_closed_at"),
  position: integer("position").notNull().default(0),
  ownerId: text("owner_id"),
  supportingJson: text("supporting_json").notNull().default("[]"),
  sourceType: text("source_type").notNull().default("Direct"),
  sourceId: text("source_id"),
  sourceLabel: text("source_label"),
  sourceAgenda: integer("source_agenda"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_pages_subsection").on(table.subsectionId),
  index("idx_pages_section_parent_position").on(table.subsectionId, table.parentId, table.position),
  index("idx_pages_serial").on(table.serial),
  index("idx_pages_due_status").on(table.dueDate, table.status),
  index("idx_pages_owner").on(table.ownerId),
  index("idx_pages_reminder_date").on(table.reminderDate),
]);

export const outlineItems = sqliteTable("outline_items", {
  id: text("id").primaryKey(),
  pageId: text("page_id").notNull(),
  level: integer("level").notNull().default(0),
  position: integer("position").notNull().default(0),
  text: text("text").notNull().default(""),
  isTask: integer("is_task", { mode: "boolean" }).notNull().default(false),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  entryDate: text("entry_date"),
  reminderDate: text("reminder_date"),
  reminderRepeat: text("reminder_repeat").notNull().default("none"),
  reminderEndDate: text("reminder_end_date"),
  reminderClosedAt: text("reminder_closed_at"),
}, (table) => [
  index("idx_outline_page_position").on(table.pageId, table.position),
  index("idx_outline_reminder_date").on(table.reminderDate),
]);

export const meetings = sqliteTable("meetings", {
  id: text("id").primaryKey(),
  number: text("number").notNull().unique(),
  purpose: text("purpose").notNull().default(""),
  date: text("date").notNull(),
  venue: text("venue").notNull().default(""),
  convener: text("convener").notNull().default(""),
  calledBy: text("called_by").notNull().default(""),
  participantsJson: text("participants_json").notNull().default("[]"),
  discussion: text("discussion").notNull().default(""),
  updateText: text("update_text").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const agendaItems = sqliteTable("agenda_items", {
  id: text("id").primaryKey(),
  meetingId: text("meeting_id").notNull(),
  position: integer("position").notNull(),
  title: text("title").notNull().default(""),
  discussion: text("discussion").notNull().default(""),
  actionText: text("action_text").notNull().default(""),
  linkedPageId: text("linked_page_id"),
}, (table) => [
  index("idx_agenda_meeting_position").on(table.meetingId, table.position),
]);

export const pageAttachments = sqliteTable("page_attachments", {
  id: text("id").primaryKey(),
  pageId: text("page_id").notNull(),
  outlineId: text("outline_id"),
  kind: text("kind").notNull(),
  title: text("title").notNull().default(""),
  externalUrl: text("external_url"),
  repository: text("repository"),
  objectKey: text("object_key"),
  fileName: text("file_name"),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_attachments_page_created").on(table.pageId, table.createdAt),
  index("idx_attachments_outline_created").on(table.outlineId, table.createdAt),
]);

export const journalSettings = sqliteTable("journal_settings", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const dayPlanItems = sqliteTable("day_plan_items", {
  id: text("id").primaryKey(),
  chainId: text("chain_id").notNull(),
  planDate: text("plan_date").notNull(),
  category: text("category").notNull().default("Task"),
  title: text("title").notNull(),
  notes: text("notes").notNull().default(""),
  plannedTime: text("planned_time"),
  assigneeId: text("assignee_id"),
  reminderRepeat: text("reminder_repeat").notNull().default("none"),
  reminderEndDate: text("reminder_end_date"),
  reminderClosedAt: text("reminder_closed_at"),
  status: text("status").notNull().default("Active"),
  carriedFromId: text("carried_from_id"),
  carryCount: integer("carry_count").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  resolvedAt: text("resolved_at"),
  linkedPageId: text("linked_page_id"),
}, (table) => [
  index("idx_day_plan_date_status").on(table.planDate, table.status),
  index("idx_day_plan_chain").on(table.chainId),
  index("idx_day_plan_assignee").on(table.assigneeId),
]);

export const dayPlanDetails = sqliteTable("day_plan_details", {
  id: text("id").primaryKey(),
  chainId: text("chain_id").notNull(),
  level: integer("level").notNull().default(0),
  position: integer("position").notNull().default(0),
  text: text("text").notNull().default(""),
  isTask: integer("is_task", { mode: "boolean" }).notNull().default(false),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  entryDate: text("entry_date"),
}, (table) => [
  index("idx_day_plan_details_chain_position").on(table.chainId, table.position),
]);

export const dayPlanAttachments = sqliteTable("day_plan_attachments", {
  id: text("id").primaryKey(),
  chainId: text("chain_id").notNull(),
  detailId: text("detail_id"),
  kind: text("kind").notNull(),
  title: text("title").notNull().default(""),
  objectKey: text("object_key").notNull(),
  fileName: text("file_name"),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_day_plan_attachments_chain_detail").on(table.chainId, table.detailId, table.createdAt),
]);

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: text("id").primaryKey(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_push_subscriptions_updated").on(table.updatedAt),
]);

export const pushDeliveryLog = sqliteTable("push_delivery_log", {
  notificationKey: text("notification_key").primaryKey(),
  subscriptionId: text("subscription_id").notNull(),
  reminderKind: text("reminder_kind").notNull(),
  reminderId: text("reminder_id").notNull(),
  reminderAt: text("reminder_at").notNull(),
  sentAt: text("sent_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_push_delivery_subscription").on(table.subscriptionId, table.sentAt),
]);
