export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { Client } from "@notionhq/client";
import { NextRequest } from "next/server";

const notion = new Client({
  auth: process.env.NOTION_API_TOKEN,
});

export async function GET(_request: NextRequest) {
  const tasks = await getTasksFromDatabase();
  const result = tasks.map((task) => {
    if (
      task.properties?.Task?.type !== "title" ||
      task.properties?.Status?.type !== "status" ||
      task.properties?.Date?.type !== "date" ||
      task.properties?.["Estimate Hours"]?.type !== "number" ||
      task.properties?.["Actual Hours"]?.type !== "number"
    ) {
      throw new Error("Task is not formatted correctly");
    }
    return {
      id: task.id,
      url: task.url,
      title: task.properties?.Task.title[0].plain_text,
      status: task.properties?.Status.status?.name,
      date: task.properties?.Date.date?.start,
      project: task.properties?.Project,
      estimateHours: task.properties?.["Estimate Hours"].number ?? "-",
      actualHours: task.properties?.["Actual Hours"].number ?? "-",
    };
  });
  return new Response(JSON.stringify({ status: "success", result }));
}

export async function POST(request: NextRequest) {
  const data = await request.json();
  const { title } = data as {
    title: string;
  };
  const result = await createTask(title);
  return new Response(JSON.stringify({ status: "success", result: result }));
}

const getTasksFromDatabase = async () => {
  if (!process.env.NOTION_TASK_DATABASE_ID) {
    throw new Error("No database ID provided");
  }
  const response = await notion.databases.query({
    database_id: process.env.NOTION_TASK_DATABASE_ID,
    filter: {
      or: [
        {
          and: [
            {
              property: "Status",
              status: {
                equals: "Todo",
              },
            },
            {
              property: "Date",
              date: {
                on_or_before: new Date().toISOString(),
              },
            },
          ],
        },
        {
          and: [
            {
              property: "Status",
              status: {
                equals: "In progress",
              },
            },
            {
              property: "Date",
              date: {
                on_or_before: new Date().toISOString(),
              },
            },
          ],
        },
        {
          property: "Date",
          date: {
            equals: new Date().toISOString(),
          },
        },
      ],
    },
    sorts: [
      {
        property: "Status",
        direction: "descending",
      },
    ],
  });

  return response.results.filter(
    (task) => task.object === "page" && "properties" in task
  );
};

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
