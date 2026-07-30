import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_HTTP_BACKEND_URL ??
  "http://127.0.0.1:3002";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await context.params;

  const response = await fetch(`${BACKEND_URL}/chats/${encodeURIComponent(roomId)}`, {
    method: "GET",
  });
  const body = await response.text();

  return new NextResponse(body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
    },
  });
}
