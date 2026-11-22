const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function setupPreviewProxy(app) {
  const target = process.env.BOONZ_PREVIEW_API_ORIGIN;
  if (!target) return;
  if (process.env.HOST !== "127.0.0.1" || process.env.REACT_APP_API_URL !== "/api") {
    throw new Error("The Boonz preview proxy requires HOST=127.0.0.1 and REACT_APP_API_URL=/api.");
  }

  const upstream = new URL(target);
  if (upstream.protocol !== "https:" || target !== upstream.origin) {
    throw new Error("BOONZ_PREVIEW_API_ORIGIN must be an HTTPS origin.");
  }

  app.use("/api", (req, res, next) => {
    const host = req.get("host") || "";
    const origin = req.get("origin");
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host) || (origin && origin !== `http://${host}`)) {
      return res.sendStatus(403);
    }
    next();
  });

  const isApiPath = (pathname) => pathname === "/api" || pathname.startsWith("/api/");
  app.use(createProxyMiddleware(isApiPath, {
    target: upstream.origin,
    changeOrigin: true,
    onProxyReq: (request) => request.removeHeader("origin"),
  }));
};
