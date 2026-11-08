import { Router, type IRouter } from "express";
import healthRouter from "./health";
import negotiatorRouter from "./negotiator";

const router: IRouter = Router();

router.use(healthRouter);
router.use(negotiatorRouter);

export default router;
