import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { Request, Response, NextFunction } from "express";
import { config } from "./config.js";
import { sessionMiddleware } from "./auth/session.js";
import { MasterNotConnectedError } from "./google/master.js";
import { mapGoogleError } from "./google/errors.js";
import { authRouter } from "./routes/auth.js";
import { adminRouter } from "./routes/admin.js";
import { subgroupsRouter } from "./routes/subgroups.js";
import { usersRouter } from "./routes/users.js";
import { eventsRouter } from "./routes/events.js";
import { tagsRouter } from "./routes/tags.js";
import { emailRouter } from "./routes/email.js";
import { bachecaRouter } from "./routes/bacheca.js";
import { wipRouter } from "./routes/wip.js";

export function createApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(sessionMiddleware);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, app: "intercomunica" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/subgroups", subgroupsRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api/tags", tagsRouter);
  app.use("/api/email", emailRouter);
  app.use("/api/bacheca", bachecaRouter);
  app.use("/api/wip", wipRouter);

  // production: serve the built frontend (SPA fallback for client routes)
  const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  if (config().NODE_ENV === "production" && fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) {
        next();
        return;
      }
      res.sendFile(path.join(webDist, "index.html"));
    });
  }

  // error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof MasterNotConnectedError) {
      res.status(409).json({ error: err.message, code: "MASTER_NOT_CONNECTED" });
      return;
    }
    const googleError = mapGoogleError(err);
    if (googleError) {
      console.error(`Google API error → ${googleError.body.code}:`, err.message);
      res.status(googleError.httpStatus).json(googleError.body);
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Errore interno del server" });
  });

  return app;
}

const isMain = process.argv[1]?.endsWith("index.ts") || process.argv[1]?.endsWith("index.js");
if (isMain) {
  const app = createApp();
  const port = config().PORT;
  app.listen(port, () => {
    console.log(`Intercomunica server → http://localhost:${port}`);
  });
}
