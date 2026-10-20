const send = (res, status, data) => {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(data));
};

module.exports = async function health(req, res) {
  if (req.method !== "GET") {
    res.setHeader?.("allow", "GET");
    return send(res, 405, { ok: false, message: "Use GET for this endpoint." });
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return send(res, 503, {
      ok: false,
      service: "plot-twist-engine",
      checks: { runtime: "ok", redis: "missing_configuration" },
      message: "Multiplayer storage is not configured. Add the Upstash Redis REST URL and token in Vercel."
    });
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(["PING"]),
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      return send(res, 503, {
        ok: false,
        service: "plot-twist-engine",
        checks: { runtime: "ok", redis: "unavailable" },
        message: "The Redis health check failed. Verify the Upstash URL, token, and database status."
      });
    }

    const result = await response.json();
    if (result.error || result.result !== "PONG") {
      return send(res, 503, {
        ok: false,
        service: "plot-twist-engine",
        checks: { runtime: "ok", redis: "unavailable" },
        message: "Redis did not return the expected health-check response."
      });
    }

    return send(res, 200, {
      ok: true,
      service: "plot-twist-engine",
      checks: { runtime: "ok", redis: "ok" }
    });
  } catch {
    return send(res, 503, {
      ok: false,
      service: "plot-twist-engine",
      checks: { runtime: "ok", redis: "unavailable" },
      message: "Redis could not be reached. Verify the Upstash connection and try again."
    });
  }
};
