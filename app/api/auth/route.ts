import { NextRequest, NextResponse } from "next/server";

export function GET(_: NextRequest, _res: NextResponse) {
  return NextResponse.json(
    { error: "Basic Auth Required" },
    {
      status: 401,
      headers: { "WWW-Authenticate": "Basic realm='secure_area'" },
    }
  );
}
