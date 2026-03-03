export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { getJournalPage, updateJournalTracked } from "../client";
import {
  getTimeEntries,
  summarizeByProject,
  formatDuration,
} from "../../toggl/client";

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") ?? undefined; // YYYY-MM-DD (JST), default: today

    const entries = await getTimeEntries(date);
    const summaries = await summarizeByProject(entries);

    const journal = await getJournalPage(date);
    await updateJournalTracked(journal.id, summaries);

    const totalSeconds = summaries.reduce((sum, s) => sum + s.totalSeconds, 0);

    return new Response(
      JSON.stringify({
        status: "success",
        result: {
          journalId: journal.id,
          journalUrl: journal.url,
          entriesCount: entries.length,
          totalTime: formatDuration(totalSeconds),
          projects: summaries.map((s) => ({
            name: s.projectName,
            time: formatDuration(s.totalSeconds),
          })),
        },
      })
    );
  } catch (error) {
    console.error("Error adding Toggl summary to journal:", error);
    return new Response(
      JSON.stringify({
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500 }
    );
  }
}
