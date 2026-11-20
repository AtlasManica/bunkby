export async function onRequest({ request }: { request: Request }) {
  const url = new URL(request.url);
  return new Response(
    JSON.stringify({ error: `API route not found: ${request.method} ${url.pathname}` }),
    {
      status: 404,
      headers: { "Content-Type": "application/json" },
    }
  );
}
