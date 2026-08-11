import { Request, Response } from "express";
import { Op } from "sequelize";
import { sequelize } from "@/db/sequelize";
import { MatchPendente } from "@/models/MatchPendente";
import { DocumentoClicksign } from "@/models/DocumentoClicksign";
import { Agente } from "@/models/Agente";

function toInt(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export class PendenciasController {
  static async listDocumentos(req: Request, res: Response) {
    const origem = String(req.query.origem || "CLICKSIGN").trim();
    const q = String(req.query.q || "").trim();

    const page = clamp(toInt(req.query.page, 1), 1, 1_000_000);
    const pageSize = clamp(toInt(req.query.pageSize, 25), 1, 200);

    const where: any = { origem };

    if (q) {
      where[Op.or] = [
        { cpf_extraido: { [Op.iLike]: `%${q}%` } },
        { filename: { [Op.iLike]: `%${q}%` } },
        { chave_origem: { [Op.iLike]: `%${q}%` } },
      ];
    }

    const { count, rows } = await MatchPendente.findAndCountAll({
      where,
      order: [
        ["dt_carga", "DESC"],
        ["id_match", "DESC"],
      ],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    return res.json({
      data: rows,
      meta: {
        origem,
        q,
        page,
        pageSize,
        total: count,
        totalPages: Math.ceil(count / pageSize),
      },
    });
  }

  static async getDocumento(req: Request, res: Response) {
    const id = Number(req.params.id_match);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id_match" });

    const pendencia = await MatchPendente.findByPk(id);
    if (!pendencia) return res.status(404).json({ error: "Not found" });

    const chave = (pendencia.chave_origem || "").trim();

    const documento = chave
      ? await DocumentoClicksign.findOne({
          where: { clicksign_document_key: chave as any },
          include: [{ model: Agente, as: "agente" }],
        })
      : null;

    const cpf = (pendencia.cpf_extraido || "").trim();
    const sugestoes =
      cpf && (cpf.length === 11 || cpf.length === 14)
        ? await Agente.findAll({
            where: { cpf_cnpj: cpf },
            limit: 20,
            order: [["cd_agente", "ASC"]],
          })
        : [];

    return res.json({
      data: {
        pendencia,
        documento,
        sugestoesAgentes: sugestoes,
      },
    });
  }

  static async resolveDocumento(req: Request, res: Response) {
    const id = Number(req.params.id_match);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id_match" });

    const cdAgente = Number(req.body?.cd_agente);
    if (!Number.isFinite(cdAgente)) return res.status(400).json({ error: "Invalid cd_agente" });

    const tx = await sequelize.transaction();
    try {
      const pendencia = await MatchPendente.findByPk(id, { transaction: tx });
      if (!pendencia) {
        await tx.rollback();
        return res.status(404).json({ error: "Not found" });
      }

      const chave = (pendencia.chave_origem || "").trim();
      if (!chave) {
        await tx.rollback();
        return res.status(400).json({ error: "chave_origem vazia" });
      }

      const agente = await Agente.findByPk(cdAgente, { transaction: tx });
      if (!agente) {
        await tx.rollback();
        return res.status(404).json({ error: "Agente not found" });
      }

      const [updated] = await DocumentoClicksign.update(
        { cd_agente: cdAgente },
        { where: { clicksign_document_key: chave as any }, transaction: tx }
      );

      if (!updated) {
        await tx.rollback();
        return res.status(404).json({ error: "DocumentoClicksign not found" });
      }

      await MatchPendente.destroy({ where: { id_match: id }, transaction: tx });

      await tx.commit();
      return res.json({ ok: true, data: { id_match: id, cd_agente: cdAgente, chave_origem: chave } });
    } catch (e: any) {
      await tx.rollback();
      return res.status(500).json({ error: e?.message || "Internal error" });
    }
  }
}