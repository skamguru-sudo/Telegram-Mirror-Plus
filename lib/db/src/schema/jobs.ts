import { pgTable, text, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const jobStatusEnum = pgEnum("job_status", ["pending", "scanning", "running", "completed", "stopped", "failed"]);

export const tgSessionTable = pgTable("tg_session", {
  id: integer("id").primaryKey().default(1),
  sessionString: text("session_string").notNull().default(""),
  phone: text("phone"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const copyJobsTable = pgTable("copy_jobs", {
  id: text("id").primaryKey(),
  sourceChannel: text("source_channel").notNull(),
  destChannel: text("dest_channel").notNull(),
  status: jobStatusEnum("status").notNull().default("pending"),
  totalPosts: integer("total_posts").notNull().default(0),
  copiedPosts: integer("copied_posts").notNull().default(0),
  failedPosts: integer("failed_posts").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  error: text("error"),
});

export const insertCopyJobSchema = createInsertSchema(copyJobsTable);
export type InsertCopyJob = z.infer<typeof insertCopyJobSchema>;
export type CopyJob = typeof copyJobsTable.$inferSelect;
export type TgSession = typeof tgSessionTable.$inferSelect;
