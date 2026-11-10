import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { passkeyCredentials } from "@db/schema";
import { getDb } from "./queries/connection";
import { env } from "./lib/env";
import { getSessionCookieOptions } from "./lib/cookies";
import { authenticateRequest, identity, issueSession } from "./local-auth";

const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const googleCookie = "private_google_nonce";
const passkeyCookie = "private_passkey_challenge";
const rpID = new URL(env.appOrigin).hostname;
const key = new TextEncoder().encode(env.appSecret);

function trustedOrigin(c: Context) {
  return c.req.header("origin") === env.appOrigin && c.req.header("host") === new URL(env.appOrigin).host;
}

function shortCookie(c: Context) {
  return { ...getSessionCookieOptions(c.req.raw.headers), maxAge: 300 };
}

async function remember(c: Context, name: string, kind: string, challenge: string) {
  const token = await new SignJWT({ kind, challenge })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("sravantix-private-auth")
    .setAudience(env.appOrigin)
    .setSubject(identity())
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);
  setCookie(c, name, token, shortCookie(c));
}

async function consume(c: Context, name: string, kind: string) {
  const token = getCookie(c, name);
  deleteCookie(c, name, { path: "/" });
  if (!token) throw new Error("Missing challenge");
  const { payload } = await jwtVerify(token, key, {
    algorithms: ["HS256"], issuer: "sravantix-private-auth", audience: env.appOrigin,
  });
  if (payload.sub !== identity() || payload.kind !== kind || typeof payload.challenge !== "string") {
    throw new Error("Invalid challenge");
  }
  return payload.challenge;
}

async function passkeys() {
  return getDb().select().from(passkeyCredentials);
}

export async function signInOptions(c: Context) {
  if (!env.googleClientId) return c.json({ googleClientId: null, googleNonce: null });
  const nonce = randomBytes(32).toString("base64url");
  await remember(c, googleCookie, "google", nonce);
  return c.json({ googleClientId: env.googleClientId, googleNonce: nonce });
}

export async function googleLogin(c: Context) {
  if (!env.googleClientId) return c.json({ error: "Google sign-in is unavailable" }, 503);
  if (!trustedOrigin(c)) return c.json({ error: "Invalid origin" }, 403);
  try {
    const nonce = await consume(c, googleCookie, "google");
    const body = await c.req.json() as { credential?: unknown };
    if (typeof body.credential !== "string" || body.credential.length > 8192) throw new Error("Invalid credential");
    const { payload } = await jwtVerify(body.credential, googleKeys, {
      audience: env.googleClientId,
      issuer: ["https://accounts.google.com", "accounts.google.com"],
    });
    if (payload.nonce !== nonce || payload.email_verified !== true ||
        typeof payload.email !== "string" || payload.email.toLowerCase() !== env.adminEmail.toLowerCase() ||
        typeof payload.sub !== "string" || !payload.sub) throw new Error("Account not allowed");
    return issueSession(c);
  } catch {
    return c.json({ error: "Google sign-in failed or this account is not allowed" }, 401);
  }
}

export async function passkeyList(c: Context) {
  try {
    await authenticateRequest(c.req.raw.headers);
    const rows = await passkeys();
    return c.json({ passkeys: rows.map(row => ({ id: row.id, createdAt: row.createdAt, lastUsedAt: row.lastUsedAt })) });
  } catch { return c.json({ error: "Sign in required" }, 401); }
}

export async function passkeyRegisterOptions(c: Context) {
  if (!trustedOrigin(c)) return c.json({ error: "Invalid origin" }, 403);
  try {
    await authenticateRequest(c.req.raw.headers);
    const rows = await passkeys();
    const options = await generateRegistrationOptions({
      rpName: "M.E.R.I.T.", rpID, userName: env.adminEmail,
      userID: new TextEncoder().encode(identity()),
      attestationType: "none",
      excludeCredentials: rows.map(row => ({ id: row.id })),
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      supportedAlgorithmIDs: [-7, -257],
    });
    await remember(c, passkeyCookie, "register", options.challenge);
    return c.json(options);
  } catch { return c.json({ error: "Sign in required" }, 401); }
}

export async function passkeyRegisterVerify(c: Context) {
  if (!trustedOrigin(c)) return c.json({ error: "Invalid origin" }, 403);
  try {
    await authenticateRequest(c.req.raw.headers);
    const challenge = await consume(c, passkeyCookie, "register");
    const response = await c.req.json() as RegistrationResponseJSON;
    const result = await verifyRegistrationResponse({
      response, expectedChallenge: challenge, expectedOrigin: env.appOrigin,
      expectedRPID: rpID, requireUserVerification: true,
    });
    if (!result.verified || !result.registrationInfo) throw new Error("Verification failed");
    const { credential } = result.registrationInfo;
    await getDb().insert(passkeyCredentials).values({
      id: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      transports: JSON.stringify(credential.transports ?? []),
    });
    return c.json({ success: true });
  } catch { return c.json({ error: "Passkey registration failed" }, 400); }
}

export async function passkeyLoginOptions(c: Context) {
  if (!trustedOrigin(c)) return c.json({ error: "Invalid origin" }, 403);
  const rows = await passkeys();
  if (!rows.length) return c.json({ error: "Sign in with Google or password, then add a passkey on this device." }, 404);
  const options = await generateAuthenticationOptions({
    rpID, userVerification: "required",
    allowCredentials: rows.map(row => ({ id: row.id })),
  });
  await remember(c, passkeyCookie, "authenticate", options.challenge);
  return c.json(options);
}

export async function passkeyLoginVerify(c: Context) {
  if (!trustedOrigin(c)) return c.json({ error: "Invalid origin" }, 403);
  try {
    const challenge = await consume(c, passkeyCookie, "authenticate");
    const response = await c.req.json() as AuthenticationResponseJSON;
    if (typeof response.id !== "string" || response.id.length > 255) throw new Error("Invalid credential");
    const [row] = await getDb().select().from(passkeyCredentials).where(eq(passkeyCredentials.id, response.id)).limit(1);
    if (!row) throw new Error("Unknown credential");
    const result = await verifyAuthenticationResponse({
      response, expectedChallenge: challenge, expectedOrigin: env.appOrigin,
      expectedRPID: rpID, requireUserVerification: true,
      credential: { id: row.id, publicKey: Buffer.from(row.publicKey, "base64url"), counter: row.counter },
    });
    if (!result.verified) throw new Error("Verification failed");
    await getDb().update(passkeyCredentials)
      .set({ counter: result.authenticationInfo.newCounter, lastUsedAt: new Date() })
      .where(eq(passkeyCredentials.id, row.id));
    return issueSession(c);
  } catch { return c.json({ error: "Passkey sign-in failed" }, 401); }
}

export async function passkeyRemove(c: Context) {
  if (!trustedOrigin(c)) return c.json({ error: "Invalid origin" }, 403);
  try {
    await authenticateRequest(c.req.raw.headers);
    const body = await c.req.json() as { id?: unknown };
    if (typeof body.id !== "string" || body.id.length > 255) return c.json({ error: "Invalid passkey" }, 400);
    await getDb().delete(passkeyCredentials).where(eq(passkeyCredentials.id, body.id));
    return c.json({ success: true });
  } catch { return c.json({ error: "Sign in required" }, 401); }
}
