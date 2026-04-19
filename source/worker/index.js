export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Route /api/* to Worker handlers (Phase 2)
    if (url.pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ ok: false, error: "Not implemented" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Serve all other paths from static assets
    return env.ASSETS.fetch(request);
  },
};
