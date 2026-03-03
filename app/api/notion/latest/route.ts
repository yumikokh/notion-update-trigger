export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { appendTextToPage, getJournalPage, Input } from "../client";

export async function GET(_request: NextRequest) {
  const latestPage = await getJournalPage();
  const { url: latestPageUrl } = latestPage;

  return new Response(
    JSON.stringify({ status: "success", result: latestPageUrl })
  );
}

export async function PUT(request: NextRequest) {
  const data = await request.json();
  const { text, embed, video, bookmark } = data as Input;

  const latestPage = await getJournalPage();
  const { id: latestPageId } = latestPage;

  const result = await appendTextToPage(latestPageId, {
    text,
    embed,
    video,
    bookmark,
  });
  return new Response(JSON.stringify({ status: "success", result: result }));
}
