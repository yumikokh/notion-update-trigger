export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { Client } from "@notionhq/client";
import { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { NextRequest } from "next/server";

const notion = new Client({ auth: process.env.NOTION_API_TOKEN });

export async function GET(_request: NextRequest) {
  const latestPage = await getLatestPageFromDatabase();
  const { url: latestPageUrl, id: latestPageId } = latestPage;

  return new Response(
    JSON.stringify({ status: "success", result: latestPageUrl })
  );
}

export async function PUT(request: NextRequest) {
  const data = await request.json();
  const text = data.text;

  if (!text) {
    return new Response(
      JSON.stringify({ status: "error", message: "No text provided" })
    );
  }

  const latestPage = await getLatestPageFromDatabase();
  const { id: latestPageId } = latestPage;

  const result = await appendTextToPage(latestPageId, text);
  return new Response(JSON.stringify({ status: "success", result: result }));
}

const getLatestPageFromDatabase = async (): Promise<PageObjectResponse> => {
  if (!process.env.NOTION_DATABASE_ID) {
    throw new Error("No database ID provided");
  }
  const response = await notion.databases.query({
    database_id: process.env.NOTION_DATABASE_ID,
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

const appendTextToPage = async (pageId: string, text = "test") => {
  const response = await notion.blocks.children.append({
    block_id: pageId,
    children: [
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [
            {
              type: "text",
              text: {
                content: text,
              },
            },
          ],
        },
      },
    ],
  });
  return response;
};
