import { getD1, getFiles, initializeDatabase } from "@/db/runtime";

type AttachmentKind = "photo" | "document" | "audio" | "link";
type AttachmentRow = {
  id: string;
  page_id: string;
  outline_id: string | null;
  kind: AttachmentKind;
  title: string;
  external_url: string | null;
  repository: string | null;
  object_key: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

const maximumFileSize = 25 * 1024 * 1024;

function attachmentJson(row: AttachmentRow) {
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

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "attachment";
}

function validWebUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Please enter a complete http or https link.");
  return url.toString();
}

async function findAttachment(id: string) {
  return getD1().prepare("SELECT * FROM page_attachments WHERE id = ?").bind(id).first<AttachmentRow>();
}

export async function GET(request: Request) {
  try {
    await initializeDatabase();
    const attachmentId = new URL(request.url).searchParams.get("id") ?? "";
    const attachment = await findAttachment(attachmentId);
    if (!attachment?.object_key) return new Response("Attachment not found", { status: 404 });
    const object = await getFiles().get(attachment.object_key);
    if (!object) return new Response("Attachment not found", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Content-Type", attachment.mime_type || headers.get("Content-Type") || "application/octet-stream");
    headers.set("Content-Disposition", `inline; filename="${safeFileName(attachment.file_name || attachment.title)}"`);
    headers.set("Cache-Control", "private, max-age=300");
    return new Response(object.body, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to open the attachment";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await initializeDatabase();
    const db = getD1();
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const body = await request.json() as Record<string, unknown>;
      const pageId = String(body.pageId ?? "");
      const outlineId = String(body.outlineId ?? "").trim() || null;
      const page = await db.prepare("SELECT id FROM pages WHERE id = ?").bind(pageId).first<{ id: string }>();
      if (!page) return Response.json({ error: "Page not found" }, { status: 404 });
      if (outlineId) {
        const outline = await db.prepare("SELECT id FROM outline_items WHERE id = ? AND page_id = ?").bind(outlineId, pageId).first<{ id: string }>();
        if (!outline) return Response.json({ error: "Update line not found" }, { status: 404 });
      }
      const externalUrl = validWebUrl(String(body.url ?? "").trim());
      const title = String(body.title ?? "").trim() || new URL(externalUrl).hostname;
      const repository = String(body.repository ?? "").trim() || null;
      const attachmentId = `attachment-${crypto.randomUUID()}`;
      await db.batch([
        db.prepare(`INSERT INTO page_attachments
          (id, page_id, outline_id, kind, title, external_url, repository)
          VALUES (?, ?, ?, 'link', ?, ?, ?)`).bind(attachmentId, pageId, outlineId, title, externalUrl, repository),
        db.prepare("UPDATE pages SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(pageId),
      ]);
      const created = await findAttachment(attachmentId);
      return Response.json({ ok: true, attachment: created && attachmentJson(created) });
    }

    const form = await request.formData();
    const pageId = String(form.get("pageId") ?? "");
    const outlineId = String(form.get("outlineId") ?? "").trim() || null;
    const kind = String(form.get("kind") ?? "") as AttachmentKind;
    const file = form.get("file");
    if (!(["photo", "document", "audio"] as string[]).includes(kind)) throw new Error("Unknown attachment type.");
    if (!(file instanceof File) || !file.size) throw new Error("Choose a file to attach.");
    if (file.size > maximumFileSize) throw new Error("Attachments must be smaller than 25 MB.");
    if (kind === "photo" && !file.type.startsWith("image/")) throw new Error("Please choose an image file.");
    if (kind === "audio" && !file.type.startsWith("audio/")) throw new Error("Please choose an audio recording.");
    const page = await db.prepare("SELECT id FROM pages WHERE id = ?").bind(pageId).first<{ id: string }>();
    if (!page) return Response.json({ error: "Page not found" }, { status: 404 });
    if (outlineId) {
      const outline = await db.prepare("SELECT id FROM outline_items WHERE id = ? AND page_id = ?").bind(outlineId, pageId).first<{ id: string }>();
      if (!outline) return Response.json({ error: "Update line not found" }, { status: 404 });
    }

    const attachmentId = `attachment-${crypto.randomUUID()}`;
    const fileName = safeFileName(file.name);
    const objectKey = `pages/${pageId}/${crypto.randomUUID()}-${fileName}`;
    const files = getFiles();
    await files.put(objectKey, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || "application/octet-stream" } });
    try {
      await db.batch([
        db.prepare(`INSERT INTO page_attachments
          (id, page_id, outline_id, kind, title, object_key, file_name, mime_type, size_bytes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
            attachmentId, pageId, outlineId, kind, file.name || (kind === "audio" ? "Audio note" : "Attachment"), objectKey,
            file.name || null, file.type || null, file.size,
          ),
        db.prepare("UPDATE pages SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(pageId),
      ]);
    } catch (error) {
      await files.delete(objectKey);
      throw error;
    }
    const created = await findAttachment(attachmentId);
    return Response.json({ ok: true, attachment: created && attachmentJson(created) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save the attachment";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    await initializeDatabase();
    const attachmentId = new URL(request.url).searchParams.get("id") ?? "";
    const attachment = await findAttachment(attachmentId);
    if (!attachment) return Response.json({ error: "Attachment not found" }, { status: 404 });
    await getD1().batch([
      getD1().prepare("DELETE FROM page_attachments WHERE id = ?").bind(attachmentId),
      getD1().prepare("UPDATE pages SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(attachment.page_id),
    ]);
    if (attachment.object_key) await getFiles().delete(attachment.object_key);
    const updated = await findAttachment(attachmentId);
    return Response.json({ ok: true, attachment: updated && attachmentJson(updated) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to remove the attachment";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await initializeDatabase();
    const body = await request.json() as Record<string, unknown>;
    const attachmentId = String(body.id ?? "");
    const title = String(body.title ?? "").trim();
    if (!title) throw new Error("Attachment name cannot be empty.");
    const attachment = await findAttachment(attachmentId);
    if (!attachment) return Response.json({ error: "Attachment not found" }, { status: 404 });
    const db = getD1();
    await db.batch([
      db.prepare("UPDATE page_attachments SET title = ? WHERE id = ?").bind(title, attachmentId),
      db.prepare("UPDATE pages SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(attachment.page_id),
    ]);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to rename the attachment";
    return Response.json({ error: message }, { status: 400 });
  }
}
