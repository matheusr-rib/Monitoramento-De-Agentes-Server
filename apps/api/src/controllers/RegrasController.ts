import { Request, Response, NextFunction } from "express";
import { Op } from "sequelize";
import { BadRequestError } from "@lewe-negocios/api-core";
import { sequelize } from "@/db/sequelize";
import { Regra } from "@/models/Regra";
import { RegraFaixa } from "@/models/RegraFaixa";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function parsePositiveInt(x: unknown, fallback: number) {
  const n = Number(x);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function parseIntRangeValue(v: unknown, field: string): number {
  if (v === null || v === undefined || v === "") {
    throw new BadRequestError(`${field.toUpperCase()}_REQUIRED`);
  }

  // aceita number ou string tipo "10" ou "10.000000"
  const s = String(v).trim();
  if (!/^\d+(\.0+)?$/.test(s)) {
    throw new BadRequestError(`${field.toUpperCase()}_MUST_BE_INTEGER`);
  }

  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) {
    throw new BadRequestError(`${field.toUpperCase()}_INVALID`);
  }

  return Math.trunc(n);
}

type FaixaInput = { qtd_ini: any; qtd_fim: any; vl_desconto: any };

function validateFaixas(faixas: FaixaInput[]) {
  if (!Array.isArray(faixas) || faixas.length === 0) {
    throw new BadRequestError("FAIXAS_REQUIRED");
  }

  const normalized = faixas.map((f, idx) => {
    const ini = parseIntRangeValue(f.qtd_ini, `qtd_ini_${idx}`);
    const fim = parseIntRangeValue(f.qtd_fim, `qtd_fim_${idx}`);
    const desc = Number(f.vl_desconto);

    if (!Number.isFinite(desc) || !Number.isInteger(desc)) {
      throw new BadRequestError(`VL_DESCONTO_${idx}_MUST_BE_INT`);
    }
    if (fim < ini) {
      throw new BadRequestError(`FAIXA_${idx}_FIM_MENOR_QUE_INI`);
    }

    return { ini, fim, vl_desconto: desc };
  });

  normalized.sort((a, b) => a.ini - b.ini);


  // regra: contíguo sem buraco e sem encostar (overlap inclusive)
  for (let i = 1; i < normalized.length; i++) {
    const prev = normalized[i - 1];
    const cur = normalized[i];

    const expectedIni = prev.fim + 1;
    if (cur.ini !== expectedIni) {
      throw new BadRequestError(
        `FAIXAS_GAP_OR_OVERLAP_AT_INDEX_${i}_EXPECTED_INI_${expectedIni}_GOT_${cur.ini}`
      );
    }
  }

  return normalized;
}

export class RegrasController {
  /**
   * GET /api/v1/regras?q?&tp_evento?&tp_regra?&ativo?&page?&pageSize?
   */
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const q = String(req.query.q || "").trim();
      const tp_evento = String(req.query.tp_evento || "").trim();
      const tp_regra = String(req.query.tp_regra || "").trim();
      const ativoRaw = req.query.ativo;

      const page = clamp(parsePositiveInt(req.query.page, 1), 1, 100000);
      const pageSize = clamp(parsePositiveInt(req.query.pageSize, 20), 5, 100);

      const where: any = {};
      if (tp_evento) where.tp_evento = tp_evento;
      if (tp_regra) where.tp_regra = tp_regra;
      if (typeof ativoRaw === "string" && ativoRaw.length) {
        where.ativo = ativoRaw === "true" || ativoRaw === "1";
      }

      if (q) {
        where[Op.or] = [
          { ds_regra: { [Op.iLike]: `%${q}%` } },
          { ds_descricao: { [Op.iLike]: `%${q}%` } },
          { tp_evento: { [Op.iLike]: `%${q}%` } },
          { tp_regra: { [Op.iLike]: `%${q}%` } },
        ];
      }

      const { rows, count } = await Regra.findAndCountAll({
        where,
        limit: pageSize,
        offset: (page - 1) * pageSize,
        order: [
          ["tp_evento", "ASC"],
          ["tp_regra", "ASC"],
          ["id_regra", "ASC"],
        ],
      });

      const totalPages = Math.max(1, Math.ceil(count / pageSize));

      return res.json({
        data: rows,
        meta: { q, tp_evento, tp_regra, page, pageSize, total: count, totalPages },
      });
    } catch (err) {
      return next(err);
    }
  }

  /**
   * GET /api/v1/regras/:id_regra
   * inclui faixas
   */
  static async get(req: Request, res: Response, next: NextFunction) {
    try {
      const id_regra = Number(req.params.id_regra);
      if (!Number.isFinite(id_regra)) throw new BadRequestError("INVALID_ID_REGRA");

      const regra = await Regra.findByPk(id_regra, {
        include: [{ model: RegraFaixa, as: "faixas" }],
        order: [[{ model: RegraFaixa, as: "faixas" }, "qtd_ini", "ASC"]],
      });

      if (!regra) throw new BadRequestError("REGRA_NOT_FOUND");

      return res.json({ data: regra });
    } catch (err) {
      return next(err);
    }
  }

  /**
   * PATCH /api/v1/regras/:id_regra
   * body: { ds_regra?, ds_descricao?, ativo? }
   */
  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id_regra = Number(req.params.id_regra);
      if (!Number.isFinite(id_regra)) throw new BadRequestError("INVALID_ID_REGRA");

      const regra = await Regra.findByPk(id_regra);
      if (!regra) throw new BadRequestError("REGRA_NOT_FOUND");

      const body = req.body || {};
      const patch: any = {};

      if (typeof body.ds_regra === "string") patch.ds_regra = body.ds_regra.trim();
      if (typeof body.ds_descricao === "string") patch.ds_descricao = body.ds_descricao.trim();
      if (typeof body.ativo === "boolean") patch.ativo = body.ativo;

      await regra.update(patch);

      return res.json({ data: regra });
    } catch (err) {
      return next(err);
    }
  }

  static async replaceFaixas(req: Request, res: Response, next: NextFunction) {
    const t = await sequelize.transaction();
    try {
      const id_regra = Number(req.params.id_regra);
      if (!Number.isFinite(id_regra)) throw new BadRequestError("INVALID_ID_REGRA");

      const regra = await Regra.findByPk(id_regra, { transaction: t });
      if (!regra) throw new BadRequestError("REGRA_NOT_FOUND");

      const faixasInput = (req.body as any)?.faixas as FaixaInput[];
      const normalized = validateFaixas(faixasInput);

      // substitui tudo pra evitar drift e facilitar auditoria
      await RegraFaixa.destroy({ where: { id_regra }, transaction: t });

      const rows = normalized.map((f) => ({
        id_regra,
        qtd_ini: String(f.ini), // DECIMAL
        qtd_fim: String(f.fim),
        vl_desconto: f.vl_desconto,
        }));

        await RegraFaixa.bulkCreate(rows as any, { transaction: t });

      await t.commit();

      const refreshed = await Regra.findByPk(id_regra, {
        include: [{ model: RegraFaixa, as: "faixas" }],
        order: [[{ model: RegraFaixa, as: "faixas" }, "qtd_ini", "ASC"]],
      });

      return res.json({ data: refreshed });
    } catch (err: any) {
      await t.rollback();

      // se bater constraint do banco (overlap), deixa mensagem menos críptica
      const msg = String(err?.message || "");
      if (msg.includes("ex_regra_faixa_no_overlap")) {
        return next(new BadRequestError("FAIXAS_OVERLAP_NOT_ALLOWED"));
      }

      return next(err);
    }
  }
}