import type { Request, Response, NextFunction, RequestHandler } from "express";
import { z } from "zod";

/** Wrap an async handler so rejections reach the Express error middleware. */
export function h(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/** Parse request body against a zod schema; responds 400 on failure. */
export function parseBody<T extends z.ZodTypeAny>(schema: T, req: Request, res: Response): z.infer<T> | undefined {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dati non validi", issues: parsed.error.issues });
    return undefined;
  }
  return parsed.data;
}
