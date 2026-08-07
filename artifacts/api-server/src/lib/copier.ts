import { TelegramClient, Api } from "telegram";
import { db, copyJobsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

// Track active jobs to allow stopping
const activeJobs = new Map<string, { stop: boolean }>();

/**
 * Resolves a channel identifier to a Telegram entity.
 * Supports:
 *   - Numeric IDs: -1001234567890 or 1234567890
 *   - Invite links: https://t.me/+xxxx or https://t.me/joinchat/xxxx
 *   - Usernames: @channel or channel
 */
async function resolveChannel(client: TelegramClient, identifier: string): Promise<Api.TypeEntityLike> {
  const trimmed = identifier.trim();

  // Numeric ID (with or without -100 prefix)
  if (/^-?\d+$/.test(trimmed)) {
    return BigInt(trimmed);
  }

  // Invite link: t.me/+ or t.me/joinchat/
  const inviteMatch = trimmed.match(/t\.me\/(?:\+|joinchat\/)([A-Za-z0-9_-]+)/);
  if (inviteMatch) {
    const hash = inviteMatch[1]!;
    // Try to join (if already a member, Telegram returns the chat anyway)
    try {
      const result = await client.invoke(new Api.messages.ImportChatInvite({ hash }));
      if ("chats" in result && result.chats.length > 0) {
        return result.chats[0]!;
      }
    } catch (err: unknown) {
      // ALREADY_PARTICIPANT is fine — just resolve normally
      const msg = err instanceof Error ? err.message : "";
      if (!msg.includes("ALREADY_PARTICIPANT") && !msg.includes("USER_ALREADY_PARTICIPANT")) {
        throw err;
      }
    }
    // Already a member: check invite to get the chat
    const info = await client.invoke(new Api.messages.CheckChatInvite({ hash }));
    if (info instanceof Api.ChatInviteAlready || info instanceof Api.ChatInvitePeek) {
      return info.chat;
    }
    throw new Error("Could not resolve invite link — chat info unavailable");
  }

  // Username (@channel or channel)
  return trimmed;
}

/**
 * Removes spoiler entities from the entities list.
 */
function removeSpoilerEntities(entities: Api.TypeMessageEntity[] | undefined): Api.TypeMessageEntity[] | undefined {
  if (!entities) return undefined;
  const filtered = entities.filter((e) => !(e instanceof Api.MessageEntitySpoiler));
  return filtered.length > 0 ? filtered : undefined;
}

export function requestJobStop(jobId: string): void {
  const ctrl = activeJobs.get(jobId);
  if (ctrl) ctrl.stop = true;
}

export async function runCopyJob(client: TelegramClient, jobId: string): Promise<void> {
  const ctrl = { stop: false };
  activeJobs.set(jobId, ctrl);

  try {
    const [job] = await db.select().from(copyJobsTable).where(eq(copyJobsTable.id, jobId));
    if (!job) throw new Error("Job not found");

    // Phase 1: SCANNING — collect all messages first, before copying anything
    await db.update(copyJobsTable).set({ status: "scanning" }).where(eq(copyJobsTable.id, jobId));

    // Resolve entities (supports IDs, invite links, usernames)
    const srcEntity = await resolveChannel(client, job.sourceChannel);
    const dstEntity = await resolveChannel(client, job.destChannel);

    // Paginate through ALL messages from source, oldest-first.
    // IMPORTANT: paginate using raw message count (includes MessageService /
    // MessageEmpty), but only collect Api.Message instances for copying.
    // Breaking on filtered count causes early exit when service messages are present.
    const allMessages: Api.Message[] = [];
    let offsetId = 0;
    const batchSize = 100;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const history = await client.invoke(
        new Api.messages.GetHistory({
          peer: srcEntity,
          offsetId,
          offsetDate: 0,
          addOffset: 0,
          limit: batchSize,
          maxId: 0,
          minId: 0,
          hash: BigInt(0),
        })
      );

      if (!("messages" in history)) break;

      const rawBatch = history.messages; // all types including service/empty
      if (rawBatch.length === 0) break;

      // Collect only regular messages for copying
      for (const m of rawBatch) {
        if (m instanceof Api.Message) allMessages.push(m);
      }

      // Advance cursor using the LAST raw message ID (not filtered)
      offsetId = rawBatch[rawBatch.length - 1]!.id;

      // Stop when API returned fewer than requested — we've reached the beginning
      if (rawBatch.length < batchSize) break;

      // Small delay to respect flood limits
      await new Promise((r) => setTimeout(r, 400));
    }

    // Reverse so we process oldest → newest
    allMessages.reverse();

    // Scan complete — record total and transition to copying phase
    await db
      .update(copyJobsTable)
      .set({ status: "running", totalPosts: allMessages.length })
      .where(eq(copyJobsTable.id, jobId));

    logger.info({ jobId, total: allMessages.length }, "Starting copy");

    let i = 0;
    while (i < allMessages.length) {
      if (ctrl.stop) {
        await db.update(copyJobsTable).set({ status: "stopped", finishedAt: new Date() }).where(eq(copyJobsTable.id, jobId));
        logger.info({ jobId }, "Job stopped by user");
        return;
      }

      const msg = allMessages[i]!;

      // Check if this message is part of a grouped album
      const groupedId = msg.groupedId;

      if (groupedId) {
        // Collect all messages of this group
        const groupMsgs: Api.Message[] = [msg];
        let j = i + 1;
        while (j < allMessages.length && allMessages[j]!.groupedId?.toString() === groupedId.toString()) {
          groupMsgs.push(allMessages[j]!);
          j++;
        }

        try {
          await sendAlbum(client, dstEntity, groupMsgs);
          await db
            .update(copyJobsTable)
            .set({ copiedPosts: job.copiedPosts + (j - i) })
            .where(eq(copyJobsTable.id, jobId));
          // Re-fetch to avoid stale copiedPosts
          const [updated] = await db.select().from(copyJobsTable).where(eq(copyJobsTable.id, jobId));
          if (updated) {
            await db.update(copyJobsTable).set({ copiedPosts: updated.copiedPosts + (j - i) }).where(eq(copyJobsTable.id, jobId));
          }
        } catch (err) {
          logger.warn({ jobId, groupedId: groupedId.toString(), err }, "Failed to copy album");
          const [cur] = await db.select().from(copyJobsTable).where(eq(copyJobsTable.id, jobId));
          await db.update(copyJobsTable).set({ failedPosts: (cur?.failedPosts ?? 0) + (j - i) }).where(eq(copyJobsTable.id, jobId));
        }

        i = j;
      } else {
        // Single message
        try {
          await sendSingle(client, dstEntity, msg);
          const [cur] = await db.select().from(copyJobsTable).where(eq(copyJobsTable.id, jobId));
          await db.update(copyJobsTable).set({ copiedPosts: (cur?.copiedPosts ?? 0) + 1 }).where(eq(copyJobsTable.id, jobId));
        } catch (err) {
          logger.warn({ jobId, msgId: msg.id, err }, "Failed to copy message");
          const [cur] = await db.select().from(copyJobsTable).where(eq(copyJobsTable.id, jobId));
          await db.update(copyJobsTable).set({ failedPosts: (cur?.failedPosts ?? 0) + 1 }).where(eq(copyJobsTable.id, jobId));
        }

        i++;
      }

      // Small delay to avoid Telegram flood limits
      await new Promise((r) => setTimeout(r, 300));
    }

    await db
      .update(copyJobsTable)
      .set({ status: "completed", finishedAt: new Date() })
      .where(eq(copyJobsTable.id, jobId));

    logger.info({ jobId }, "Job completed");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ jobId, err }, "Job failed");
    await db
      .update(copyJobsTable)
      .set({ status: "failed", error: msg, finishedAt: new Date() })
      .where(eq(copyJobsTable.id, jobId));
  } finally {
    activeJobs.delete(jobId);
  }
}

async function sendSingle(client: TelegramClient, dst: Api.TypeInputPeer | Api.TypeEntityLike, msg: Api.Message): Promise<void> {
  const caption = msg.message ?? "";
  const entities = removeSpoilerEntities(msg.entities as Api.TypeMessageEntity[] | undefined);

  if (msg.media) {
    await client.sendFile(dst, {
      file: msg.media,
      caption,
      formattingEntities: entities,
      parseMode: undefined,
    });
  } else if (caption) {
    await client.sendMessage(dst, {
      message: caption,
      formattingEntities: entities,
      parseMode: undefined,
    });
  }
}

async function sendAlbum(client: TelegramClient, dst: Api.TypeInputPeer | Api.TypeEntityLike, msgs: Api.Message[]): Promise<void> {
  // Get media files from all messages; last message usually has the caption
  const captionMsg = msgs[msgs.length - 1]!;
  const caption = captionMsg.message ?? "";
  const entities = removeSpoilerEntities(captionMsg.entities as Api.TypeMessageEntity[] | undefined);

  const mediaFiles = msgs.filter((m) => m.media).map((m) => m.media!);

  if (mediaFiles.length === 0) return;

  if (mediaFiles.length === 1) {
    await client.sendFile(dst, {
      file: mediaFiles[0],
      caption,
      formattingEntities: entities,
      parseMode: undefined,
    });
    return;
  }

  // Send as album
  await client.sendFile(dst, {
    file: mediaFiles,
    caption,
    formattingEntities: entities,
    parseMode: undefined,
  });
}
