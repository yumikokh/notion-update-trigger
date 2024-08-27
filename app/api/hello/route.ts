export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(_request: Request) {
  return new Response(`Hello from ${process.env.VERCEL_REGION}!`);
}
