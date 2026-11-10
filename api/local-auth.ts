import { scryptSync, timingSafeEqual } from "node:crypto";
import * as cookie from "cookie";
import { setCookie } from "hono/cookie";
import type { Context } from "hono";
import { SignJWT, jwtVerify } from "jose";
import { Session } from "@contracts/constants";
import { Errors } from "@contracts/errors";
import { env } from "./lib/env";
import { getSessionCookieOptions } from "./lib/cookies";
import { findUserByUnionId, upsertUser } from "./queries/users";

export const identity = () => `local:${env.adminEmail.toLowerCase()}`;
const secret = () => new TextEncoder().encode(env.appSecret);

export async function authenticateRequest(headers: Headers) {
  const token = cookie.parse(headers.get("cookie") || "")[Session.cookieName];
  if (!token) throw Errors.forbidden("Authentication required.");
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (payload.sub !== identity()) throw new Error("Invalid session");
    const user = await findUserByUnionId(identity());
    if (!user) throw new Error("User not found");
    return user;
  } catch {
    throw Errors.forbidden("Invalid session. Please sign in again.");
  }
}

const attempts = new Map<string, { count: number; until: number }>();
export async function issueSession(c: Context) {
  await upsertUser({ unionId: identity(), email: env.adminEmail, name: env.adminEmail, role: "admin", lastSignInAt: new Date() });
  const token = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(identity()).setIssuedAt().setExpirationTime("12h").sign(secret());
  setCookie(c, Session.cookieName, token, { ...getSessionCookieOptions(c.req.raw.headers), maxAge: Session.maxAgeMs / 1000 });
  return c.json({ success: true });
}

export async function login(c: Context) {
  const origin = c.req.header("origin");
  const host = c.req.header("host");
  if (origin) {
    try { if (!host || new URL(origin).host !== host) return c.json({ error: "Invalid origin" }, 403); }
    catch { return c.json({ error: "Invalid origin" }, 403); }
  }
  const address = c.req.header("x-real-ip") || "unknown";
  const now = Date.now();
  const attempt = attempts.get(address);
  if (attempt && attempt.until > now && attempt.count >= 5) return c.json({ error: "Too many attempts. Try again later." }, 429);
  let body: { email?: unknown; password?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid request" }, 400); }
  const hash = env.adminPasswordScrypt;
  const [salt, expectedHex] = hash.split(":");
  const expected = /^[a-f0-9]{128}$/i.test(expectedHex || "") ? Buffer.from(expectedHex, "hex") : Buffer.alloc(64);
  const actual = scryptSync(typeof body.password === "string" ? body.password : "", salt || "invalid", 64);
  const valid = timingSafeEqual(actual, expected) && body.email === env.adminEmail;
  if (!valid) {
    attempts.set(address, { count: (attempt?.until && attempt.until > now ? attempt.count : 0) + 1, until: now + 15 * 60_000 });
    return c.json({ error: "Invalid email or password" }, 401);
  }
  attempts.delete(address);
  return issueSession(c);
}
