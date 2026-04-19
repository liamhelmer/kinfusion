export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Route /api/* to Worker handlers (Phase 2)
    if (url.pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ ok: false, error: "Not implemented" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Serve static assets; on 404 serve the 404 page if available
    const response = await env.ASSETS.fetch(request);
    if (response.status === 404) {
      const notFoundResponse = await env.ASSETS.fetch(new Request(new URL("/404.html", request.url)));
      if (notFoundResponse.ok) {
        return new Response(notFoundResponse.body, {
          status: 404,
          headers: notFoundResponse.headers,
        });
      }
    }
    return response;
  },
};
