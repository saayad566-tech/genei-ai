import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

const LOCAL_DESKTOP_USER: User = {
  id: 0,
  openId: "desktop-local-guest",
  name: "Local Creator",
  email: null,
  loginMethod: "desktop-local",
  role: "user",
  createdAt: new Date(0),
  updatedAt: new Date(0),
  lastSignedIn: new Date(),
};

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  // The installed desktop application is a local workspace, not a hosted
  // account portal. Only its embedded server may use this guest identity;
  // hosted deployments continue to require their normal session cookie.
  if (!user && process.env.GENEI_DESKTOP === "1") {
    user = LOCAL_DESKTOP_USER;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
