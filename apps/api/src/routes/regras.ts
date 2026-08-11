import { Router } from "express";
import { RegrasController } from "@/controllers/RegrasController";

const router = Router();

router.get("/", RegrasController.list);
router.get("/:id_regra", RegrasController.get);
router.patch("/:id_regra", RegrasController.update);
router.put("/:id_regra/faixas", RegrasController.replaceFaixas);

export default router;