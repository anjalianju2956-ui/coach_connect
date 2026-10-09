import type { NextFunction, Request, RequestHandler, Response } from "express";
import { env } from "../config/env";
import { resolveUserFromToken } from "../config/supabase";
import { unauthorized } from "../lib/errors";

export interface AuthContext {
  userId: string;
  token?: string;
  demo: boolean;
  phone?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/**
 * In demo mode (no Supabase credentials) every request runs as one clearly
 * labelled demo passenger so the whole flow stays testable.
 * With Supabase configured, the caller's bearer token is verified server-side;
 * the browser's claims are never trusted on their own.
 */
export const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";

export const attachAuth: RequestHandler = async (req, _res, next) => {
  try {
    if (!env.supabase.configured) {
      req.auth = { userId: DEMO_USER_ID, demo: true };
      next();
      return;
    }

    const header = req.headers.authorization;
    const token = header && header.startsWith("Bearer ") ? header.slice(7).trim() : undefined;
    if (!token) {
      next();
      return;
    }

    const user = await resolveUserFromToken(token);
    if (user) {
      req.auth = { userId: user.id, token, demo: false, phone: user.phone };
    }
    next();
  } catch (error) {
    next(error);
  }
};

export const requireAuth: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.auth) {
    next(unauthorized("Please log in to continue."));
    return;
  }
  next();
};
