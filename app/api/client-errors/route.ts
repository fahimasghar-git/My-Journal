type ClientErrorPayload = {
  message?: unknown;
  stack?: unknown;
  source?: unknown;
  path?: unknown;
  userAgent?: unknown;
  occurredAt?: unknown;
};

function limited(value: unknown, length: number) {
  return String(value ?? "").slice(0, length);
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 16_384) return new Response(null, { status: 413 });
  try {
    const body = await request.json() as ClientErrorPayload;
    console.error("[client-crash]", {
      message: limited(body.message, 2_000),
      stack: limited(body.stack, 8_000),
      source: limited(body.source, 500),
      path: limited(body.path, 500),
      userAgent: limited(body.userAgent, 500),
      occurredAt: limited(body.occurredAt, 100),
    });
  } catch {
    console.error("[client-crash] Invalid crash report received.");
  }
  return new Response(null, { status: 204 });
}
