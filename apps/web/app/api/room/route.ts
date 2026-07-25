import { NextRequest, NextResponse } from "next/server";
import { proxyJson } from "../_backend";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const authorization = request.headers.get("authorization") ?? "";

  const result = await proxyJson("/room", {
    method: "POST",
    headers: {
      "Content-Type": request.headers.get("content-type") ?? "application/json",
      ...(authorization ? { authorization } : {}),
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
