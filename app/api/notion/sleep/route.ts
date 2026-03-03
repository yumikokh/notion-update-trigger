export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { getJournalPage, updateJournalSleep } from "../client";

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") ?? undefined;

    const { bedTime, wakeTime, sleepHours } = (await request.json()) as {
      bedTime: string; // "2:41"
      wakeTime: string; // "11:25"
      sleepHours: number; // 8.02
    };

    if (!bedTime || !wakeTime || sleepHours == null) {
      return new Response(
        JSON.stringify({
          status: "error",
          message: "bedTime, wakeTime, sleepHours are required",
        }),
        { status: 400 }
      );
    }

    const MIN_SLEEP_HOURS = 1;
    if (sleepHours < MIN_SLEEP_HOURS) {
      return new Response(
        JSON.stringify({
          status: "skipped",
          message: `Sleep duration too short (${sleepHours}h), likely a measurement error`,
        })
      );
    }

    const journal = await getJournalPage(date);
    await updateJournalSleep(journal.id, { bedTime, wakeTime, sleepHours });

    return new Response(
      JSON.stringify({
        status: "success",
        result: {
          journalId: journal.id,
          journalUrl: journal.url,
          bedTime,
          wakeTime,
          sleepHours,
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
