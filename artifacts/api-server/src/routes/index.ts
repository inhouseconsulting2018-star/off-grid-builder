import { Router, type IRouter } from "express";
import healthRouter from "./health";
import projectsRouter from "./projects";
import settingsRouter from "./settings";
import proposalsRouter from "./proposals";

const router: IRouter = Router();

router.use(healthRouter);
router.use(projectsRouter);
router.use(settingsRouter);
router.use(proposalsRouter);

export default router;
