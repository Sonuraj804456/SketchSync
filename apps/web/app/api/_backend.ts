const BACKEND_URL =
  process.env.NEXT_PUBLIC_HTTP_BACKEND_URL ??
  "http://127.0.0.1:3002";

export async function proxyJson(
  path: string,
  init: RequestInit,
  timeoutMs = 10000
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${BACKEND_URL}${path}`, {
      ...init,
      signal: controller.signal,
    });

    const text = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      body: text,
      contentType:
        response.headers.get("content-type") ?? "application/json; charset=utf-8",
    };
  } finally {
    clearTimeout(timeout);
  }
}
