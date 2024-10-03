export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { Client } from "@notionhq/client";
import { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { NextRequest } from "next/server";

const notion = new Client({ auth: process.env.NOTION_API_TOKEN });

type Input = {
  text?: string;
  embed?: string;
  video?: string;
  link?: {
    title: string;
    url: string;
  };
  bookmark?: {
    url: string;
    caption?: string;
  };
};

export async function GET(_request: NextRequest) {
  const latestPage = await getLatestPageFromDatabase();
  const { url: latestPageUrl } = latestPage;

  return new Response(
    JSON.stringify({ status: "success", result: latestPageUrl })
  );
}

export async function PUT(request: NextRequest) {
  const data = await request.json();
  const { text, embed, video, link, bookmark } = data as Input;

  const latestPage = await getLatestPageFromDatabase();
  const { id: latestPageId } = latestPage;

  const result = await appendTextToPage(latestPageId, {
    text,
    embed,
    video,
    link,
    bookmark,
  });
  return new Response(JSON.stringify({ status: "success", result: result }));
}

const getLatestPageFromDatabase = async (): Promise<PageObjectResponse> => {
  if (!process.env.NOTION_JOURNAL_DATABASE_ID) {
    throw new Error("No database ID provided");
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

  if (latestPage && latestPage.object !== "page") {
    throw new Error("Latest item in database is not a page");
  }

  return latestPage as PageObjectResponse;
};

const appendTextToPage = async (pageId: string, opts: Input) => {
  const rich_text = [];
  const children = [];
  if (opts.text) {
    rich_text.push({
      type: "text",
      text: {
        content: opts.text,
      },
    } as const);
  }
  if (opts.link) {
    rich_text.push({
      type: "text",
      text: {
        content: opts.link.title,
        link: {
          url: opts.link.url,
        },
      },
    } as const);
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
