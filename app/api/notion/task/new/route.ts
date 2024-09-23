export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { Client } from "@notionhq/client";
import { NextRequest } from "next/server";

const notion = new Client({
  auth: process.env.NOTION_API_TOKEN,
});

export async function GET(_request: NextRequest) {
  return new Response(JSON.stringify({ status: "success" }));
}

export async function POST(request: NextRequest) {
  const data = await request.json();
  console.log(data, "kita");
  const { title } = data as {
    title: string;
  };
  const result = await createTask(title);
  return new Response(JSON.stringify({ status: "success", result: result }));
}

const createTask = async (title: string) => {
  if (!process.env.NOTION_TASK_DATABASE_ID) {
    throw new Error("No database ID provided");
  }
  const response = await notion.pages.create({
    parent: {
      database_id: process.env.NOTION_TASK_DATABASE_ID,
    },
    properties: {
      Task: {
        title: [
          {
            text: {
              content: title,
            },
          },
        ],
      },
    },
  });
  return response;
};
