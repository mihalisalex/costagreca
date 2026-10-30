// Small helpers shared by the API routes.

export function clientIp(req) {
  const real = req.headers["x-real-ip"];
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return String(real || forwarded || "unknown").slice(0, 64);
}

export function readBody(req) {
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch (e) { return {}; }
  }
  return req.body && typeof req.body === "object" ? req.body : {};
}

export function send(res, status, payload) {
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json(payload);
}

// Wraps a POST-only JSON route with consistent error handling.
export function route(handler) {
  return async (req, res) => {
    if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });
    try {
      await handler(req, res, readBody(req));
    } catch (err) {
      console.error(err);
      send(res, 500, { error: "server_error" });
    }
  };
}
