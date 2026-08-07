import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import jobsRouter from "./jobs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(jobsRouter);

export default router;
