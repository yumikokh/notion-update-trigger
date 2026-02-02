import { Client } from "@notionhq/client";
import { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import emoji from "emoji-datasource";

const notion = new Client({
  auth: process.env.NOTION_API_TOKEN,
});

/**
 * 最新のジャーナルページを取得する
 */
export const getLatestJournalPage = async (): Promise<PageObjectResponse> => {
  if (!process.env.NOTION_JOURNAL_DATABASE_ID) {
    throw new Error("NOTION_JOURNAL_DATABASE_ID is not defined");
  }

  const response = await notion.databases.query({
    database_id: process.env.NOTION_JOURNAL_DATABASE_ID,
    page_size: 1,
    sorts: [
      {
        property: "Date",
        direction: "descending",
      },
    ],
  });

  const [latestPage] = response.results;

  if (!latestPage || latestPage.object !== "page") {
    throw new Error("Latest item in journal database is not a page");
  }

  return latestPage as PageObjectResponse;
};

/**
 * 今日の日付のタスクを取得する
 */
export const getTodayTasks = async (): Promise<PageObjectResponse[]> => {
  if (!process.env.NOTION_TASK_DATABASE_ID) {
    throw new Error("NOTION_TASK_DATABASE_ID is not defined");
  }

  // 今日の日付をJST (UTC+9) で取得（YYYY-MM-DD形式）
  const nowJst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const today = nowJst.toISOString().split("T")[0];

  const response = await notion.databases.query({
    database_id: process.env.NOTION_TASK_DATABASE_ID,
    filter: {
      property: "Date",
      date: {
        equals: today,
      },
    },
    sorts: [
      {
        property: "Status",
        direction: "ascending",
      },
    ],
  });

  return response.results.filter(
    (task): task is PageObjectResponse =>
      task.object === "page" && "properties" in task
  );
};

/**
 * ジャーナルのTasksリレーショナルプロパティに今日のタスクを追加する
 */
export const updateJournalTasks = async (
  journal: PageObjectResponse,
  tasksToAdd: PageObjectResponse[]
): Promise<any> => {
  const TASK_RELATION_PROPERTY_NAME = "Tasks";
  // 既存のタスク関連を取得
  const existingTasks = journal.properties[TASK_RELATION_PROPERTY_NAME];

  if (existingTasks?.type !== "relation") {
    throw new Error("Journal does not have a Tasks relation property");
  }

  // 既存のタスクIDを取得
  const existingTaskIds = existingTasks.relation.map((relation) => relation.id);

  // 追加するタスクのIDを取得
  const newTaskIds = tasksToAdd.map((task) => task.id);

  // 重複を排除して結合
  const combinedTaskIds = [...existingTaskIds];

  // 新しいタスクIDを追加（重複を排除）
  newTaskIds.forEach((id) => {
    if (!combinedTaskIds.includes(id)) {
      combinedTaskIds.push(id);
    }
  });

  // タスクIDをリレーション形式に変換
  const taskRelations = combinedTaskIds.map((id) => ({ id }));

  // ジャーナルページのプロパティを更新
  const response = await notion.pages.update({
    page_id: journal.id,
    properties: {
      // "Tasks"はジャーナルデータベースのリレーショナルプロパティ名
      Tasks: {
        relation: taskRelations,
      },
    },
  });

  return response;
};

export type Input = {
  text?: string;
  embed?: string;
  video?: string;
  bookmark?: {
    url: string;
    caption?: string;
  };
};

import { ProjectSummary, formatDuration, formatTime } from "../toggl/client";

/**
 * プロジェクト名からNotionのProjectページを検索する
 */
const findProjectPages = async (
  projectNames: string[]
): Promise<Map<string, string>> => {
  if (!process.env.NOTION_PROJECT_DATABASE_ID) {
    return new Map();
  }

  const result = new Map<string, string>();

  await Promise.all(
    projectNames.map(async (name) => {
      if (name === "No Project" || name === "Unknown") return;
      try {
        const response = await notion.databases.query({
          database_id: process.env.NOTION_PROJECT_DATABASE_ID!,
          filter: {
            property: "Project Name",
            title: { equals: name },
          },
          page_size: 1,
        });
        if (response.results.length > 0) {
          result.set(name, response.results[0].id);
        }
      } catch {
        // ignore
      }
    })
  );

  return result;
};

/**
 * Togglサマリーをページに追記する
 */
export const appendTogglSummaryToPage = async (
  pageId: string,
  summaries: ProjectSummary[]
) => {
  const totalSeconds = summaries.reduce((sum, s) => sum + s.totalSeconds, 0);

  // プロジェクト名からNotionページを検索
  const projectPageMap = await findProjectPages(
    summaries.map((s) => s.projectName)
  );

  // 全体の開始・終了時間を算出
  const allEntries = summaries.flatMap((s) => s.entries);
  const starts = allEntries.map((e) => new Date(e.start).getTime());
  const stops = allEntries.filter((e) => e.stop).map((e) => new Date(e.stop!).getTime());
  const overallStart = starts.length > 0 ? formatTime(new Date(Math.min(...starts)).toISOString()) : "";
  const overallEnd = stops.length > 0 ? formatTime(new Date(Math.max(...stops)).toISOString()) : "";
  const timeRange = overallStart && overallEnd ? ` ${overallStart}-${overallEnd}` : "";

  // テーブル行を作成
  const headerRow = {
    object: "block",
    type: "table_row",
    table_row: {
      cells: [
        [{ type: "text", text: { content: "Project" } }],
        [{ type: "text", text: { content: "Time" } }],
        [{ type: "text", text: { content: "Details" } }],
      ],
    },
  };

  const dataRows = summaries.map((summary) => {
    const notionPageId = projectPageMap.get(summary.projectName);
    const projectCell: any[] = notionPageId
      ? [{ type: "mention", mention: { type: "page", page: { id: notionPageId } } }]
      : [{ type: "text", text: { content: summary.projectName } }];

    // 同じdescriptionのエントリをマージ
    const mergedEntries = new Map<string, number>();
    for (const entry of summary.entries) {
      const key = entry.description;
      mergedEntries.set(key, (mergedEntries.get(key) ?? 0) + entry.seconds);
    }
    const details = Array.from(mergedEntries.entries())
      .map(([desc, secs]) => `• ${desc} (${formatDuration(secs)})`)
      .join("\n");

    return {
      object: "block",
      type: "table_row",
      table_row: {
        cells: [
          projectCell,
          [{ type: "text", text: { content: formatDuration(summary.totalSeconds) } }],
          [{ type: "text", text: { content: details } }],
        ],
      },
    };
  });

  const children: any[] = [
    {
      object: "block",
      type: "heading_3",
      heading_3: {
        rich_text: [
          { type: "text", text: { content: `⏱ Toggl (${formatDuration(totalSeconds)})${timeRange}` } },
        ],
      },
    },
    {
      object: "block",
      type: "table",
      table: {
        table_width: 3,
        has_column_header: true,
        has_row_header: false,
        children: [headerRow, ...dataRows],
      },
    },
  ];

  return notion.blocks.children.append({
    block_id: pageId,
    children,
  });
};

export const appendTextToPage = async (pageId: string, opts: Input) => {
  const rich_text: {
    type: "text";
    text: { content: string; link: { url: string } } | { content: string };
  }[] = [];
  const children = [];

  if (opts.text) {
    // emojiを変換
    const emojiRegex = /:([a-z0-9_+]+):/g;
    const textWithEmoji = opts.text.replace(emojiRegex, (match, p1) => {
      const emojiData = emoji.find((e) => e.short_name === p1);
      if (emojiData) {
        return String.fromCodePoint(parseInt(emojiData.unified, 16));
      }
      return match; // 見つからない場合は :emoji: のまま返す
    });

    // url部分（複数可）だけ取り出す
    const urls = textWithEmoji.match(/https?:\/\/\S+/g) || [];
    // url部分をダミーリンクに変換
    const text = textWithEmoji.replace(/https?:\/\/\S+/g, "<URL>");
    const link = urls.map((url) => ({
      type: "text" as const,
      text: {
        content: url,
        link: {
          url,
        },
      },
    }));
    // テキストとリンクを結合
    const texts = text.split("<URL>");
    texts.forEach((text, index) => {
      rich_text.push({
        type: "text" as const,
        text: {
          content: text,
        },
      });
      if (link[index]) {
        rich_text.push(link[index]);
      }
    });
  }

  if (opts.bookmark) {
    children.push({
      type: "bookmark" as const,
      bookmark: {
        url: opts.bookmark.url,
        caption: [
          {
            type: "text" as const,
            text: {
              content: opts.bookmark.caption || "",
            },
          },
        ],
      },
    });
  }
  if (opts.embed) {
    children.push({
      type: "embed", // ✗Spotify, ◯ Twitter,Vimeo see: https://developers.notion.com/reference/block#embed
      embed: {
        url: opts.embed,
      },
    } as const);
  }
  if (opts.video) {
    children.push({
      type: "video",
      video: {
        type: "external",
        external: {
          url: opts.video, // ◯ Youtube
        },
      },
    } as const);
  }
  const response = await notion.blocks.children.append({
    block_id: pageId,
    children: [
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text,
          children,
        },
      },
    ],
  });
  return response;
};
