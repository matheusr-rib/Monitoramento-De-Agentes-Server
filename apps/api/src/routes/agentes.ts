import { Router } from "express";
import { AgentesController } from "@/controllers/AgentesController";

const router = Router();


router.get("/", AgentesController.list);
router.get("/search", AgentesController.search);
router.patch("/:cd_agente", AgentesController.update);

export default router;