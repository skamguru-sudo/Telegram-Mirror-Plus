import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import { db, copyJobsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  ListJobsResponse,
  CreateJobBody,
  CreateJobResponse,
  GetJobParams,
  GetJobResponse,
  StopJobParams,
  StopJobResponse,
} from "@workspace/api-zod";
import { getClient, isAuthenticated } from "../lib/telegram";
import { runCopyJob, requestJobStop } from "../lib/copier";

const router: IRouter = Router();

function serializeJob(job: {
  id: string;
  sourceChannel: string;
  destChannel: string;
  status: string;
  totalPosts: number;
  copiedPosts: number;
  failedPosts: number;
  createdAt: Date;
  finishedAt: Date | null;
  error: string | null;
}) {
  return {
    id: job.id,
    sourceChannel: job.sourceChannel,
    destChannel: job.destChannel,
    status: job.status,
    totalPosts: job.totalPosts,
    copiedPosts: job.copiedPosts,
    failedPosts: job.failedPosts,
    createdAt: job.createdAt.toISOString(),
    finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
    error: job.error ?? null,
  };
}

router.get("/jobs", async (_req, res): Promise<void> => {
  const jobs = await db.select().from(copyJobsTable).orderBy(desc(copyJobsTable.createdAt));
  res.json(ListJobsResponse.parse(jobs.map(serializeJob)));
});

router.post("/jobs", async (req, res): Promise<void> => {
  const parsed = CreateJobBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const authenticated = await isAuthenticated();
  if (!authenticated) {
    res.status(400).json({ error: "Not authenticated with Telegram. Please log in first." });
    return;
  }

  const id = randomUUID();
  const [job] = await db
    .insert(copyJobsTable)
    .values({
      id,
      sourceChannel: parsed.data.sourceChannel,
      destChannel: parsed.data.destChannel,
      status: "pending",
    })
    .returning();

  if (!job) {
    res.status(500).json({ error: "Failed to create job" });
    return;
  }

  // Start copy in background
  getClient().then((client) => {
    runCopyJob(client, id).catch((err) => {
      req.log.error({ err, jobId: id }, "Copy job crashed");
    });
  });

  res.status(201).json(CreateJobResponse.parse(serializeJob(job)));
});

router.get("/jobs/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetJobParams.safeParse({ id: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [job] = await db.select().from(copyJobsTable).where(eq(copyJobsTable.id, params.data.id));
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.json(GetJobResponse.parse(serializeJob(job)));
});

router.post("/jobs/:id/stop", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = StopJobParams.safeParse({ id: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [job] = await db.select().from(copyJobsTable).where(eq(copyJobsTable.id, params.data.id));
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  requestJobStop(params.data.id);
  res.json(StopJobResponse.parse(serializeJob(job)));
});

export default router;
