import { Request, Response, NextFunction } from "express";
import { Op } from "sequelize";
import { BadRequestError } from "@lewe-negocios/api-core";
import { Agente } from "@/models/Agente";
import { normalizeCpfCnpj } from "@/utils/normalize";
import { JobQueueService } from "@/services/JobQueueService";
import { JOB_TYPES } from "@/constants/jobTypes";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function parsePositiveInt(x: unknown, fallback: number) {
  const n = Number(x);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function buildWhereFromQuery(qRaw: string) {
  const q = qRaw.trim();
  if (!q) return null;

  const asNumber = Number(q);

  const where: any = {
    [Op.or]: [
      { cpf_cnpj: { [Op.iLike]: `%${q}%` } },
      { nome: { [Op.iLike]: `%${q}%` } },
    ],
  };

  if (Number.isFinite(asNumber)) {
    where[Op.or].push({ cd_agente: asNumber });
  }

  return where;
}

export class AgentesController {
  /**
   * GET /api/v1/agentes
   * query: q?, page?, pageSize?
   * retorna paginado
   */
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const q = String(req.query.q || "");
      const page = clamp(parsePositiveInt(req.query.page, 1), 1, 10_000);
      const pageSize = clamp(parsePositiveInt(req.query.pageSize, 20), 5, 100);

      const where = buildWhereFromQuery(q);

      const { rows, count } = await Agente.findAndCountAll({
        where: where ?? undefined,
        limit: pageSize,
        offset: (page - 1) * pageSize,
        order: [
          ["nome", "ASC"],
          ["cd_agente", "ASC"],
        ],
      });

      const totalPages = Math.max(1, Math.ceil(count / pageSize));

      return res.json({
        data: rows,
        meta: {
          q: q.trim(),
          page,
          pageSize,
          total: count,
          totalPages,
        },
      });
    } catch (err) {
      return next(err);
    }
  }

  /**
   * GET /api/v1/agentes/search?q=...
   * (mantido para compatibilidade com pendências)
   */
  static async search(req: Request, res: Response, next: NextFunction) {
    try {
      const q = String(req.query.q || "").trim();
      const limit = clamp(Number(req.query.limit || 20), 1, 50);

      if (!q) return res.json({ data: [] });

      const where = buildWhereFromQuery(q);
      const data = await Agente.findAll({
        where: where ?? undefined,
        limit,
        order: [["nome", "ASC"]],
      });

      return res.json({ data });
    } catch (err) {
      return next(err);
    }
  }

  /**
   * PATCH /api/v1/agentes/:cd_agente
   * body: { cpf_cnpj: string|null, runMatch?: boolean }
   */
  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const cd_agente = Number(req.params.cd_agente);
      if (!Number.isFinite(cd_agente)) throw new BadRequestError("INVALID_CD_AGENTE");

      const runMatch = Boolean((req.body as any)?.runMatch);

      // normaliza cpf/cnpj (somente dígitos). permite null.
      const cpfCnpjNorm = normalizeCpfCnpj((req.body as any)?.cpf_cnpj);

      // se veio string vazia / lixo -> vira null. mas se vier algo, valida tamanho.
      if (cpfCnpjNorm !== null && cpfCnpjNorm.length !== 11 && cpfCnpjNorm.length !== 14) {
        throw new BadRequestError("CPF_CNPJ_INVALID_LENGTH");
      }

      const agente = await Agente.findByPk(cd_agente);
      if (!agente) throw new BadRequestError("AGENTE_NOT_FOUND");

      await agente.update({
        cpf_cnpj: cpfCnpjNorm,
        dt_atualizacao: new Date(),
      });

      let jobId: string | null = null;

      if (runMatch) {
        const requestedBy =
          ((req.headers["x-user"] as string | undefined) ?? "system").trim() || "system";

        const enq = await JobQueueService.enqueue({
          jobType: JOB_TYPES.PROC_MATCH,
          requestedBy,
          payload: null,
        });

        jobId = String(enq.jobId);
      }

      return res.json({ data: agente, jobId });
    } catch (err) {
      return next(err);
    }
  }
}