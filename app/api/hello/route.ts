export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  return new Response(
    `Hello from ${process.env.VERCEL_REGION} ${process.env.TEST_ENV}!!!`
  );
}
