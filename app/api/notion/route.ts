export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { Client } from "@notionhq/client";
import { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
const notion = new Client({ auth: process.env.NOTION_API_TOKEN });

export async function GET(request: Request) {
  const latestPage = await getLatestPageFromDatabase();
  return new Response(
    JSON.stringify({ status: "success", result: latestPage.url })
  );
}

// async function doPost(e) {
//   const data = JSON.parse(e.postData.contents);
//   const text = data.text;

//   if (!text) {
//     return JSON.stringify({ status: "error", message: "No text provided" });
//   }

//   const latestPage = getLatestPageFromDatabase();
//   const latestPageId = await latestPage?.id;
//   if (latestPageId) {
//     const result = appendTextToPage(latestPageId, text);
//     return JSON.stringify({ status: "success", result: result });
//   } else {
//     return JSON.stringify({
//       status: "error",
//       message: "No pages found in the database.",
//     });
//   }
// }

async function getLatestPageFromDatabase(): Promise<PageObjectResponse> {
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
}

// async function appendTextToPage(pageId: string, text = "test") {
//   const url = `https://api.notion.com/v1/blocks/${pageId}/children`;
//   const options = {
//     method: "patch",
//     headers: {
//       Authorization: `Bearer ${NOTION_API_KEY}`,
//       "Content-Type": "application/json",
//       "Notion-Version": "2022-06-28",
//     },
//     payload: JSON.stringify({
//       children: [
//         {
//           object: "block",
//           type: "bulleted_list_item",
//           bulleted_list_item: {
//             rich_text: [
//               {
//                 type: "text",
//                 text: {
//                   content: text,
//                 },
//               },
//             ],
//           },
//         },
//       ],
//     }),
//   };
//   const response = await fetch(url, options);
//   console.log(response.getContentText());
// }
