import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { db, tgSessionTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const apiId = parseInt(process.env.TELEGRAM_API_ID ?? "", 10);
const apiHash = process.env.TELEGRAM_API_HASH ?? "";

if (!apiId || !apiHash) {
  logger.warn("TELEGRAM_API_ID or TELEGRAM_API_HASH not set");
}

let client: TelegramClient | null = null;

async function loadSessionString(): Promise<string> {
  try {
    const [row] = await db.select().from(tgSessionTable).where(eq(tgSessionTable.id, 1));
    return row?.sessionString ?? "";
  } catch {
    return "";
  }
}

async function saveSessionString(sessionString: string, phone?: string): Promise<void> {
  await db
    .insert(tgSessionTable)
    .values({ id: 1, sessionString, phone: phone ?? null })
    .onConflictDoUpdate({
      target: tgSessionTable.id,
      set: { sessionString, phone: phone ?? null, updatedAt: new Date() },
    });
}

export async function getClient(): Promise<TelegramClient> {
  if (client && client.connected) {
    return client;
  }

  const sessionString = await loadSessionString();
  const session = new StringSession(sessionString);

  client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.connect();
  logger.info("Telegram client connected");
  return client;
}

export async function isAuthenticated(): Promise<boolean> {
  try {
    const c = await getClient();
    return await c.isUserAuthorized();
  } catch {
    return false;
  }
}

export async function getPhone(): Promise<string | null> {
  try {
    const [row] = await db.select().from(tgSessionTable).where(eq(tgSessionTable.id, 1));
    return row?.phone ?? null;
  } catch {
    return null;
  }
}

export async function persistSession(phone?: string): Promise<void> {
  if (!client) return;
  const sessionString = (client.session as StringSession).save();
  await saveSessionString(sessionString, phone);
}

export async function clearSession(): Promise<void> {
  if (client) {
    try {
      await client.destroy();
    } catch {}
    client = null;
  }
  await saveSessionString("");
}
