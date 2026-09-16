import { getD1, getFiles, initializeDatabase } from "@/db/runtime";

type AttachmentKind = "photo" | "document" | "audio";
type AttachmentRow = {
  id: string;
  chain_id: string;
  detail_id: string | null;
  kind: AttachmentKind;
  title: string;
  object_key: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

const maximumFileSize = 25 * 1024 * 1024;

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "attachment";
}

function attachmentJson(row: AttachmentRow) {
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

async function findAttachment(id: string) {
  return getD1().prepare("SELECT * FROM day_plan_attachments WHERE id = ?").bind(id).first<AttachmentRow>();
}

export async function GET(request: Request) {
  try {
    await initializeDatabase();
    const id = new URL(request.url).searchParams.get("id") ?? "";
    const attachment = await findAttachment(id);
    if (!attachment) return new Response("Attachment not found", { status: 404 });
    const object = await getFiles().get(attachment.object_key);
    if (!object) return new Response("Attachment not found", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Content-Type", attachment.mime_type || headers.get("Content-Type") || "application/octet-stream");
    headers.set("Content-Disposition", `inline; filename="${safeFileName(attachment.file_name || attachment.title)}"`);
    headers.set("Cache-Control", "private, max-age=300");
    return new Response(object.body, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to open the attachment" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let objectKey = "";
  try {
    await initializeDatabase();
    const db = getD1();
    const form = await request.formData();
    const chainId = String(form.get("chainId") ?? "");
    const detailId = String(form.get("detailId") ?? "").trim() || null;
    const kind = String(form.get("kind") ?? "") as AttachmentKind;
    const file = form.get("file");
    if (!("photo document audio".split(" ") as string[]).includes(kind)) throw new Error("Unknown attachment type.");
    if (!(file instanceof File) || !file.size) throw new Error("Choose a file to attach.");
    if (file.size > maximumFileSize) throw new Error("Attachments must be smaller than 25 MB.");
    if (kind === "photo" && !file.type.startsWith("image/")) throw new Error("Please choose an image file.");
    if (kind === "audio" && !file.type.startsWith("audio/")) throw new Error("Please choose an audio recording.");
    const item = await db.prepare("SELECT chain_id FROM day_plan_items WHERE chain_id = ? LIMIT 1").bind(chainId).first<{ chain_id: string }>();
    if (!item) return Response.json({ error: "Planner item not found" }, { status: 404 });
    if (detailId) {
      const detail = await db.prepare("SELECT id FROM day_plan_details WHERE id = ? AND chain_id = ?").bind(detailId, chainId).first<{ id: string }>();
      if (!detail) return Response.json({ error: "Detail line not found" }, { status: 404 });
    }

    const id = `day-attachment-${crypto.randomUUID()}`;
    const fileName = safeFileName(file.name);
    objectKey = `my-day/${chainId}/${crypto.randomUUID()}-${fileName}`;
    const files = getFiles();
    await files.put(objectKey, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || "application/octet-stream" } });
    try {
      await db.prepare(`INSERT INTO day_plan_attachments
        (id, chain_id, detail_id, kind, title, object_key, file_name, mime_type, size_bytes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, chainId, detailId, kind, file.name || (kind === "audio" ? "Audio note" : "Attachment"), objectKey, file.name || null, file.type || null, file.size)
        .run();
    } catch (error) {
      await files.delete(objectKey);
      throw error;
    }
    const created = await findAttachment(id);
    return Response.json({ ok: true, attachment: created && attachmentJson(created) });
  } catch (error) {
    if (objectKey) {
      try { await getFiles().delete(objectKey); } catch { /* The original error is more useful. */ }
    }
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save the attachment" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    await initializeDatabase();
    const body = await request.json() as Record<string, unknown>;
    const id = String(body.id ?? "");
    const title = String(body.title ?? "").trim();
    if (!title) throw new Error("Attachment name cannot be empty.");
    const attachment = await findAttachment(id);
    if (!attachment) return Response.json({ error: "Attachment not found" }, { status: 404 });
    await getD1().prepare("UPDATE day_plan_attachments SET title = ? WHERE id = ?").bind(title, id).run();
    const updated = await findAttachment(id);
    return Response.json({ ok: true, attachment: updated && attachmentJson(updated) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to rename the attachment" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    await initializeDatabase();
    const id = new URL(request.url).searchParams.get("id") ?? "";
    const attachment = await findAttachment(id);
    if (!attachment) return Response.json({ error: "Attachment not found" }, { status: 404 });
    await getD1().prepare("DELETE FROM day_plan_attachments WHERE id = ?").bind(id).run();
    await getFiles().delete(attachment.object_key);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to remove the attachment" }, { status: 500 });
  }
}
