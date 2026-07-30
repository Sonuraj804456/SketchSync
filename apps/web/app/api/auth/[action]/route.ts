import { NextRequest, NextResponse } from "next/server";
import { proxyJson } from "../../_backend";

const allowedActions = new Set(["signup", "signin", "guest"]);

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ action: string }> }
) {
  const { action } = await context.params;

  if (!allowedActions.has(action)) {
    return NextResponse.json(
      { message: "Unsupported auth action" },
      { status: 404 }
    );
  }

  const body = await request.text();
  const result = await proxyJson(`/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": request.headers.get("content-type") ?? "application/json",
    },
    body,
  });

  return new NextResponse(result.body, {
    status: result.status,
    headers: {
      "content-type": result.contentType,
    },
  });
}
