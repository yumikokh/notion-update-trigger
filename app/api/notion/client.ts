import { Client } from "@notionhq/client";
import { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import emoji from "emoji-datasource";

const notion = new Client({
  auth: process.env.NOTION_API_TOKEN,
});

/**
 * ジャーナルページを取得する
 * @param date YYYY-MM-DD形式の日付文字列。未指定時は最新のページを返す
 */
export const getJournalPage = async (date?: string): Promise<PageObjectResponse> => {
  if (!process.env.NOTION_JOURNAL_DATABASE_ID) {
    throw new Error("NOTION_JOURNAL_DATABASE_ID is not defined");
  }

  const response = await notion.databases.query({
    database_id: process.env.NOTION_JOURNAL_DATABASE_ID,
    page_size: 1,
    ...(date
      ? {
          filter: {
            property: "Date",
            date: { equals: date },
          },
        }
      : {
          sorts: [
            {
              property: "Date",
              direction: "descending" as const,
            },
          ],
        }),
  });

  const [page] = response.results;

  if (!page || page.object !== "page") {
    throw new Error(
      date
        ? `Journal page not found for date: ${date}`
        : "Latest item in journal database is not a page"
    );
  }

  return page as PageObjectResponse;
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

export type SlackMessage = {
  ts: string;
  text: string;
  thread_ts?: string;
  reply_count?: number | null;
  parent_user_id?: string | null;
};

export type Input = {
  text?: string;
  embed?: string;
  video?: string;
  bookmark?: {
    url: string;
    caption?: string;
  };
  messages?: SlackMessage[];
};

/**
 * ジャーナルページのSleepプロパティを更新する
 */
export const updateJournalSleep = async (pageId: string, text: string) => {
  return notion.pages.update({
    page_id: pageId,
    properties: {
      Sleep: {
        rich_text: [
          {
            type: "text",
            text: { content: text },
          },
        ],
      },
    },
  });
};

import { ProjectSummary, formatDuration } from "../toggl/client";

/**
 * TogglサマリーをジャーナルページのTrackedプロパティに設定する
 */
export const updateJournalTracked = async (
  pageId: string,
  summaries: ProjectSummary[]
) => {
  const lines: string[] = [];
  for (const summary of summaries) {
    // 同じdescriptionのエントリをマージ
    const mergedEntries = new Map<string, number>();
    for (const entry of summary.entries) {
      const key = entry.description;
      mergedEntries.set(key, (mergedEntries.get(key) ?? 0) + entry.seconds);
    }
    for (const [desc, secs] of Array.from(mergedEntries.entries())) {
      lines.push(`・${summary.projectName}: ${desc} (${formatDuration(secs)})`);
    }
  }

  const trackedText = lines.join("\n");

  return notion.pages.update({
    page_id: pageId,
    properties: {
      Tracked: {
        rich_text: [
          {
            type: "text",
            text: { content: trackedText },
          },
        ],
      },
    },
  });
};

type RichTextItem = {
  type: "text";
  text: { content: string; link: { url: string } } | { content: string };
};

/**
 * テキストをemoji変換 + URL抽出・リンク化してrich_text配列に変換する
 */
export const buildRichText = (input: string): RichTextItem[] => {
  const rich_text: RichTextItem[] = [];

  // emojiを変換
  const emojiRegex = /:([a-z0-9_+]+):/g;
  const textWithEmoji = input.replace(emojiRegex, (match, p1) => {
    const emojiData = emoji.find((e) => e.short_name === p1);
    if (emojiData) {
      return String.fromCodePoint(parseInt(emojiData.unified, 16));
    }
    return match;
  });

  // url部分（複数可）だけ取り出す
  const urls = textWithEmoji.match(/https?:\/\/\S+/g) || [];
  // url部分をダミーリンクに変換
  const text = textWithEmoji.replace(/https?:\/\/\S+/g, "<URL>");
  const link = urls.map((url) => ({
    type: "text" as const,
    text: {
      content: url,
      link: { url },
    },
  }));
  // テキストとリンクを結合
  const texts = text.split("<URL>");
  texts.forEach((text, index) => {
    rich_text.push({
      type: "text" as const,
      text: { content: text },
    });
    if (link[index]) {
      rich_text.push(link[index]);
    }
  });

  return rich_text;
};

/**
 * SlackメッセージをNotionの箇条書きブロック配列に変換する
 * スレッドの返信は親メッセージのchildrenとしてネストする
 */
export const buildMessageBlocks = (messages: SlackMessage[]) => {
  // thread_tsでグループ化
  const groups = new Map<string, SlackMessage[]>();
  for (const msg of messages) {
    const key = msg.thread_ts || msg.ts;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(msg);
  }

  const blocks: {
    object: "block";
    type: "bulleted_list_item";
    bulleted_list_item: {
      rich_text: RichTextItem[];
      children?: { type: "bulleted_list_item"; bulleted_list_item: { rich_text: RichTextItem[] } }[];
    };
  }[] = [];

  for (const [, group] of Array.from(groups.entries())) {
    // 親メッセージ（parent_user_idがnull/undefined）を見つける
    const parent = group.find((m: SlackMessage) => !m.parent_user_id);
    const replies = group.filter((m: SlackMessage) => m.parent_user_id);

    if (!parent) continue;

    const children = replies.map((reply: SlackMessage) => ({
      type: "bulleted_list_item" as const,
      bulleted_list_item: {
        rich_text: buildRichText(reply.text),
      },
    }));

    blocks.push({
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: buildRichText(parent.text),
        ...(children.length > 0 ? { children } : {}),
      },
    });
  }

  return blocks;
};

export const appendTextToPage = async (pageId: string, opts: Input) => {
  const rich_text: RichTextItem[] = [];
  const children = [];

  if (opts.text) {
    rich_text.push(...buildRichText(opts.text));
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

  // messages処理: Slackメッセージがある場合は箇条書きブロックとして追加
  if (opts.messages && opts.messages.length > 0) {
    const messageBlocks = buildMessageBlocks(opts.messages);
    const response = await notion.blocks.children.append({
      block_id: pageId,
      children: messageBlocks,
    });
    return response;
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
