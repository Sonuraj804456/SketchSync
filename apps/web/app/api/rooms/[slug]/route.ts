import { NextRequest, NextResponse } from "next/server";
import { proxyJson } from "../../_backend";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;

  const result = await proxyJson(`/room/${encodeURIComponent(slug)}`, {
    method: "GET",
  });

  return new NextResponse(result.body, {
    status: result.status,
    headers: {
      "content-type": result.contentType,
    },
  });
}
