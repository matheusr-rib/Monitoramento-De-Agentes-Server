import { Router } from "express";
import { PendenciasController } from "@/controllers/PendenciasController";

const router = Router();

router.get("/documentos", PendenciasController.listDocumentos);
router.get("/documentos/:id_match", PendenciasController.getDocumento);
router.post("/documentos/:id_match/resolve", PendenciasController.resolveDocumento);

export default router;