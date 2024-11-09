export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { Client } from "@notionhq/client";
import { NextRequest } from "next/server";

// 今月の実行済みの習慣を取得し、プロジェクトの分子プロパティに追加する

const VALUE_PROPERTY = "分子";

const notion = new Client({ auth: process.env.NOTION_API_TOKEN });

type Input = {
  title: string;
  property?: string;
};

export async function PUT(request: NextRequest) {
  const data = await request.json();
  const { title, property } = data as Input;

  const count = await countCheckedRoutines(property || title);
  await updateProjectProperty(title, count);

  return new Response(JSON.stringify({ status: "success", result: count }));
}

const countCheckedRoutines = async (property: string): Promise<number> => {
  if (!process.env.NOTION_JOURNAL_DATABASE_ID) {
    throw new Error("No database ID provided");
  }
  // 今月の実行済みの習慣を取得
  const response = await notion.databases.query({
    database_id: process.env.NOTION_JOURNAL_DATABASE_ID,
    filter: {
      and: [
        {
          property: "Date",
          date: {
            on_or_after: new Date(
              new Date().getFullYear(),
              new Date().getMonth(),
              1
            ).toISOString(),
          },
        },
        {
          property: "Date",
          date: {
            before: new Date(
              new Date().getFullYear(),
              new Date().getMonth() + 1,
              1
            ).toISOString(),
          },
        },
        {
          property,
          checkbox: {
            equals: true,
          },
        },
      ],
    },
  });

  return response.results.length;
};

const updateProjectProperty = async (title: string, value: number) => {
  if (!process.env.NOTION_PROJECT_DATABASE_ID) {
    throw new Error("No database ID provided");
  }
  const response = await notion.databases.query({
    database_id: process.env.NOTION_PROJECT_DATABASE_ID,
    filter: {
      and: [
        {
          property: "Project Name",
          title: {
            starts_with: title,
          },
        },
        {
          property: "Status",
          status: {
            equals: "Planned",
          },
        },
        {
          property: "Date",
          date: {
            on_or_after: new Date(
              new Date().getFullYear(),
              new Date().getMonth(),
              1
            ).toISOString(),
          },
        },
        {
          property: "Date",
          date: {
            before: new Date(
              new Date().getFullYear(),
              new Date().getMonth() + 1,
              1
            ).toISOString(),
          },
        },
        {
          property: "Type",
          select: {
            equals: "Routine",
          },
        },
      ],
    },
  });
  const [project] = response.results;
  if (!project) {
    throw new Error("Project not found");
  }
  const { id: projectId } = project;
  await notion.pages.update({
    page_id: projectId,
    properties: {
      [VALUE_PROPERTY]: value,
    },
  });
};
