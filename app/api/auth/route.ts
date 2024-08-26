import type { NextApiRequest, NextApiResponse } from "next";
import { NextResponse } from "next/server";

export function GET(_: NextApiRequest, _res: NextApiResponse) {
  return NextResponse.json(
    { error: "Basic Auth Required" },
    {
      status: 401,
      headers: { "WWW-Authenticate": "Basic realm='secure_area'" },
    }
  );
}
