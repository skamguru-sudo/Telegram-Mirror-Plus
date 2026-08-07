import { TelegramClient, Api } from "telegram";
import { db, copyJobsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

// Track active jobs to allow stopping
const activeJobs = new Map<string, { stop: boolean }>();

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

    await db.update(copyJobsTable).set({ status: "running" }).where(eq(copyJobsTable.id, jobId));

    // Resolve entities
    const srcEntity = await client.getEntity(job.sourceChannel);
    const dstEntity = await client.getEntity(job.destChannel);

    // Collect all messages from source channel oldest-first
    const allMessages: Api.Message[] = [];
    let offsetId = 0;
    const limit = 100;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const history = await client.invoke(
        new Api.messages.GetHistory({
          peer: srcEntity,
          offsetId,
          offsetDate: 0,
          addOffset: 0,
          limit,
          maxId: 0,
          minId: 0,
          hash: BigInt(0),
        })
      );

      const msgs =
        "messages" in history
          ? (history.messages as Api.Message[]).filter((m) => m instanceof Api.Message)
          : [];

      if (msgs.length === 0) break;

      allMessages.push(...msgs);
      offsetId = msgs[msgs.length - 1]!.id;

      if (msgs.length < limit) break;
      // Small delay to avoid flood
      await new Promise((r) => setTimeout(r, 500));
    }

    // Reverse so we go oldest-first
    allMessages.reverse();

    await db
      .update(copyJobsTable)
      .set({ totalPosts: allMessages.length })
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
