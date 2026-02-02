export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { getLatestJournalPage, appendTogglSummaryToPage } from "../client";
import {
  getTodayTimeEntries,
  summarizeByProject,
  formatDuration,
} from "../../toggl/client";

export async function POST(_request: NextRequest) {
  try {
    const entries = await getTodayTimeEntries();
    const summaries = await summarizeByProject(entries);

    const latestJournal = await getLatestJournalPage();
    await appendTogglSummaryToPage(latestJournal.id, summaries);

    const totalSeconds = summaries.reduce((sum, s) => sum + s.totalSeconds, 0);

    return new Response(
      JSON.stringify({
        status: "success",
        result: {
          journalId: latestJournal.id,
          journalUrl: latestJournal.url,
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
