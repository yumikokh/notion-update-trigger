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

  // 今日の日付を取得（YYYY-MM-DD形式）
  const today = new Date().toISOString().split("T")[0];

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
