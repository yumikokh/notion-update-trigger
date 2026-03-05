export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { getJournalPage, updateJournalSleep } from "../client";

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") ?? undefined;

    const { text } = (await request.json()) as { text: string };

    if (!text) {
      return new Response(
        JSON.stringify({ status: "error", message: "text is required" }),
        { status: 400 }
      );
    }

    const journal = await getJournalPage(date);
    await updateJournalSleep(journal.id, text);

    return new Response(
      JSON.stringify({
        status: "success",
        result: {
          journalId: journal.id,
          journalUrl: journal.url,
          text,
        },
      })
    );
  } catch (error) {
    console.error("Error updating sleep data:", error);
    return new Response(
      JSON.stringify({
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500 }
    );
  }
}
