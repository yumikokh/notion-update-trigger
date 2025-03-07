export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import {
  getLatestJournalPage,
  getTodayTasks,
  updateJournalTasks,
} from "../client";

export async function POST(_request: NextRequest) {
  try {
    // 最新のジャーナルページを取得
    const latestJournal = await getLatestJournalPage();

    // 今日の日付のタスクを取得
    const todayTasks = await getTodayTasks();

    // ジャーナルのTasksリレーショナルプロパティに今日のタスクを追加
    const result = await updateJournalTasks(latestJournal, todayTasks);

    return new Response(
      JSON.stringify({
        status: "success",
        result: {
          journalId: latestJournal.id,
          journalUrl: latestJournal.url,
          tasksAdded: todayTasks.length,
        },
      })
    );
  } catch (error) {
    console.error("Error adding tasks to journal:", error);
    return new Response(
      JSON.stringify({
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500 }
    );
  }
}
