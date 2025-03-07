/**
 * 今日の日付のタスクを直近のジャーナルのTasksリレーショナルプロパティに追加するAPIをテストするスクリプト
 *
 * 使用方法:
 * npx ts-node app/api/notion/journal-task/test.ts
 */

import fetch from "node-fetch";

async function testAddTasksToJournal() {
  try {
    console.log("今日の日付のタスクを直近のジャーナルに追加しています...");

    const response = await fetch(
      "http://localhost:3000/api/notion/journal-task",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json();

    if (data.status === "success") {
      console.log("✅ 成功しました！");
      console.log(`ジャーナルURL: ${data.result.journalUrl}`);
      console.log(`追加されたタスク数: ${data.result.tasksAdded}`);
    } else {
      console.error("❌ エラーが発生しました:", data.message);
    }
  } catch (error) {
    console.error("❌ リクエスト中にエラーが発生しました:", error);
  }
}

// スクリプトを実行
testAddTasksToJournal();
