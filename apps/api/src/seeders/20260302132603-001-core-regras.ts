import type { QueryInterface } from 'sequelize';

type Regra = {
  id_regra: number;
  tp_evento: string;
  tp_regra: string;
  ds_regra: string;
  ds_descricao: string;
  ativo: boolean;
};

type Faixa = {
  id_regra: number;
  qtd_ini: number;
  qtd_fim: number;
  vl_desconto: number;
};

const CORE = { schema: 'core', tableName: 'tb_regra' } as const;
const CORE_FAIXA = { schema: 'core', tableName: 'tb_regra_faixa' } as const;

const TETO = 1000;

function normalizeFaixas(input: Faixa[]): Faixa[] {
  const step1 = input.map((f) => {
    if (f.qtd_ini === 5 && f.qtd_fim >= 5) {
      return { ...f, qtd_ini: 6, qtd_fim: Math.max(6, f.qtd_fim) };
    }
    return { ...f };
  });

  const byRegra = new Map<number, Faixa[]>();
  for (const f of step1) {
    const arr = byRegra.get(f.id_regra) ?? [];
    arr.push(f);
    byRegra.set(f.id_regra, arr);
  }

  const out: Faixa[] = [];
  for (const [id_regra, faixas] of byRegra.entries()) {
    faixas.sort((a, b) => a.qtd_ini - b.qtd_ini || a.qtd_fim - b.qtd_fim);

    const dedup = new Map<string, Faixa>();
    for (const f of faixas) {
      const k = `${f.qtd_ini}|${f.qtd_fim}`;
      const prev = dedup.get(k);
      if (!prev || f.vl_desconto > prev.vl_desconto) dedup.set(k, f);
    }

    const compact = Array.from(dedup.values()).sort(
      (a, b) => a.qtd_ini - b.qtd_ini || a.qtd_fim - b.qtd_fim
    );

    let last = -Infinity;
    for (const f of compact) {
      if (f.vl_desconto < last) f.vl_desconto = last;
      last = f.vl_desconto;
      out.push({ ...f, id_regra });
    }
  }

  return out;
}

export const up = async (queryInterface: QueryInterface) => {
  await queryInterface.sequelize.query(`DELETE FROM core.tb_regra_faixa;`);
  await queryInterface.sequelize.query(`DELETE FROM core.tb_regra;`);

  const regras: Regra[] = [
    { id_regra: 16, tp_evento: 'POSVENDA', tp_regra: 'POR_OCORRENCIA', ds_regra: 'RECONHECE_OPERACAO_NAO', ds_descricao: 'RECONHECE_OPERACAO_NAO', ativo: true },
    { id_regra: 17, tp_evento: 'POSVENDA', tp_regra: 'POR_OCORRENCIA', ds_regra: 'COMPREENDEU_PRODUTO_NAO', ds_descricao: 'COMPREENDEU_PRODUTO_NAO', ativo: true },
    { id_regra: 18, tp_evento: 'POSVENDA', tp_regra: 'POR_OCORRENCIA', ds_regra: 'PROMESSA_INDEVIDA_SIM', ds_descricao: 'PROMESSA_INDEVIDA_SIM', ativo: true },
    { id_regra: 19, tp_evento: 'POSVENDA', tp_regra: 'POR_OCORRENCIA', ds_regra: 'COBRANCA_TAXA_SIM', ds_descricao: 'COBRANCA_TAXA_SIM', ativo: true },

    { id_regra: 20, tp_evento: 'FRAUDE', tp_regra: 'POR_OCORRENCIA', ds_regra: 'OPERACIONAL ROTINA', ds_descricao: 'OPERACIONAL ROTINA', ativo: true },
    { id_regra: 21, tp_evento: 'FRAUDE', tp_regra: 'POR_OCORRENCIA', ds_regra: 'RISCO CONTROLADO', ds_descricao: 'RISCO CONTROLADO', ativo: true },
    { id_regra: 22, tp_evento: 'FRAUDE', tp_regra: 'POR_OCORRENCIA', ds_regra: 'RISCO CRITICO', ds_descricao: 'RISCO CRITICO', ativo: true },

    { id_regra: 23, tp_evento: 'NUVIDEO', tp_regra: 'POR_OCORRENCIA', ds_regra: 'INDICIO DE INDUCAO OU COACAO NUVIDEO', ds_descricao: 'INDICIO DE INDUCAO OU COACAO NUVIDEO', ativo: true },
    { id_regra: 24, tp_evento: 'NUVIDEO', tp_regra: 'POR_OCORRENCIA', ds_regra: 'TERCEIRO SE PASSANDO PECO CLIENTE NUVIDEO', ds_descricao: 'TERCEIRO SE PASSANDO PECO CLIENTE NUVIDEO', ativo: true },
    { id_regra: 25, tp_evento: 'NUVIDEO', tp_regra: 'POR_OCORRENCIA', ds_regra: 'CLIENTE DESCONHECE A OPERACAO', ds_descricao: 'CLIENTE DESCONHECE A OPERACAO', ativo: true },
    { id_regra: 26, tp_evento: 'NUVIDEO', tp_regra: 'POR_OCORRENCIA', ds_regra: 'SUSPEITA DE FRAUDE', ds_descricao: 'SUSPEITA DE FRAUDE', ativo: true },

    { id_regra: 27, tp_evento: 'ESTEIRA', tp_regra: 'BOOLEAN', ds_regra: 'ESTEIRA BRONZE', ds_descricao: 'ESTEIRA BRONZE', ativo: true },
    { id_regra: 28, tp_evento: 'ESTEIRA', tp_regra: 'BOOLEAN', ds_regra: 'ESTEIRA COBRE', ds_descricao: 'ESTEIRA COBRE', ativo: true },

    { id_regra: 29, tp_evento: 'DOCUMENTACAO', tp_regra: 'BOOLEAN', ds_regra: 'NAO TEM DOCUMENTACAO ASSINADA', ds_descricao: 'NAO TEM DOCUMENTACAO ASSINADA', ativo: true },

    { id_regra: 30, tp_evento: 'AUTORREGULACAO', tp_regra: 'POR_OCORRENCIA', ds_regra: 'AUTORREGULACAO', ds_descricao: 'AUTORREGULACAO', ativo: true },
  ];

  await queryInterface.bulkInsert(
    CORE,
    regras.map((r) => ({
      ...r,
      dt_cadastro: new Date(),
    }))
  );

  const faixasBase: Faixa[] = [
    { id_regra: 16, qtd_ini: 1, qtd_fim: 1, vl_desconto: 4 },
    { id_regra: 16, qtd_ini: 2, qtd_fim: 2, vl_desconto: 8 },
    { id_regra: 16, qtd_ini: 3, qtd_fim: 5, vl_desconto: 14 },
    { id_regra: 16, qtd_ini: 5, qtd_fim: TETO, vl_desconto: 20 },

    { id_regra: 17, qtd_ini: 1, qtd_fim: 1, vl_desconto: 3 },
    { id_regra: 17, qtd_ini: 2, qtd_fim: 2, vl_desconto: 6 },
    { id_regra: 17, qtd_ini: 3, qtd_fim: 5, vl_desconto: 11 },
    { id_regra: 17, qtd_ini: 5, qtd_fim: TETO, vl_desconto: 15 },

    { id_regra: 18, qtd_ini: 1, qtd_fim: 1, vl_desconto: 3 },
    { id_regra: 18, qtd_ini: 2, qtd_fim: 2, vl_desconto: 6 },
    { id_regra: 18, qtd_ini: 3, qtd_fim: 5, vl_desconto: 11 },
    { id_regra: 18, qtd_ini: 5, qtd_fim: TETO, vl_desconto: 15 },

    { id_regra: 19, qtd_ini: 1, qtd_fim: 1, vl_desconto: 2 },
    { id_regra: 19, qtd_ini: 2, qtd_fim: 2, vl_desconto: 4 },
    { id_regra: 19, qtd_ini: 3, qtd_fim: 5, vl_desconto: 7 },
    { id_regra: 19, qtd_ini: 5, qtd_fim: TETO, vl_desconto: 10 },

    { id_regra: 20, qtd_ini: 1, qtd_fim: 1, vl_desconto: 10 },
    { id_regra: 20, qtd_ini: 2, qtd_fim: 2, vl_desconto: 20 },
    { id_regra: 20, qtd_ini: 3, qtd_fim: 5, vl_desconto: 35 },
    { id_regra: 20, qtd_ini: 5, qtd_fim: TETO, vl_desconto: 50 },

    { id_regra: 21, qtd_ini: 1, qtd_fim: 1, vl_desconto: 20 },
    { id_regra: 21, qtd_ini: 2, qtd_fim: 2, vl_desconto: 40 },
    { id_regra: 21, qtd_ini: 3, qtd_fim: 5, vl_desconto: 70 },
    { id_regra: 21, qtd_ini: 5, qtd_fim: TETO, vl_desconto: 100 },

    { id_regra: 22, qtd_ini: 1, qtd_fim: 1, vl_desconto: 30 },
    { id_regra: 22, qtd_ini: 2, qtd_fim: 2, vl_desconto: 60 },
    { id_regra: 22, qtd_ini: 3, qtd_fim: 5, vl_desconto: 105 },
    { id_regra: 22, qtd_ini: 5, qtd_fim: TETO, vl_desconto: 150 },

    { id_regra: 23, qtd_ini: 1, qtd_fim: 1, vl_desconto: 20 },
    { id_regra: 23, qtd_ini: 2, qtd_fim: 2, vl_desconto: 40 },
    { id_regra: 23, qtd_ini: 3, qtd_fim: 5, vl_desconto: 70 },
    { id_regra: 23, qtd_ini: 5, qtd_fim: TETO, vl_desconto: 100 },

    { id_regra: 24, qtd_ini: 1, qtd_fim: 1, vl_desconto: 20 },
    { id_regra: 24, qtd_ini: 2, qtd_fim: 2, vl_desconto: 40 },
    { id_regra: 24, qtd_ini: 3, qtd_fim: 5, vl_desconto: 70 },
    { id_regra: 24, qtd_ini: 5, qtd_fim: TETO, vl_desconto: 100 },

    { id_regra: 25, qtd_ini: 1, qtd_fim: 1, vl_desconto: 12 },
    { id_regra: 25, qtd_ini: 2, qtd_fim: 2, vl_desconto: 24 },
    { id_regra: 25, qtd_ini: 3, qtd_fim: 5, vl_desconto: 42 },
    { id_regra: 25, qtd_ini: 5, qtd_fim: TETO, vl_desconto: 60 },

    { id_regra: 26, qtd_ini: 1, qtd_fim: 1, vl_desconto: 8 },
    { id_regra: 26, qtd_ini: 2, qtd_fim: 2, vl_desconto: 16 },
    { id_regra: 26, qtd_ini: 3, qtd_fim: 5, vl_desconto: 28 },
    { id_regra: 26, qtd_ini: 5, qtd_fim: TETO, vl_desconto: 40 },

    { id_regra: 30, qtd_ini: 1, qtd_fim: 1, vl_desconto: 36 },
    { id_regra: 30, qtd_ini: 2, qtd_fim: 2, vl_desconto: 72 },
    { id_regra: 30, qtd_ini: 3, qtd_fim: 5, vl_desconto: 126 },
    { id_regra: 30, qtd_ini: 5, qtd_fim: TETO, vl_desconto: 180 },

    { id_regra: 27, qtd_ini: 0, qtd_fim: 0, vl_desconto: 0 },
    { id_regra: 27, qtd_ini: 1, qtd_fim: 1, vl_desconto: 40 },

    { id_regra: 28, qtd_ini: 0, qtd_fim: 0, vl_desconto: 0 },
    { id_regra: 28, qtd_ini: 1, qtd_fim: 1, vl_desconto: 80 },

    { id_regra: 29, qtd_ini: 0, qtd_fim: 0, vl_desconto: 0 },
    { id_regra: 29, qtd_ini: 1, qtd_fim: 1, vl_desconto: 40 },
  ];

  const faixas = normalizeFaixas(faixasBase);

  await queryInterface.bulkInsert(
    CORE_FAIXA,
    faixas.map((f) => ({
      id_regra: f.id_regra,
      qtd_ini: f.qtd_ini,
      qtd_fim: f.qtd_fim,
      vl_desconto: f.vl_desconto,
    }))
  );

  await queryInterface.sequelize.query(`
    SELECT setval(pg_get_serial_sequence('core.tb_regra','id_regra'),
      (SELECT COALESCE(MAX(id_regra),1) FROM core.tb_regra)
    );
  `);

  await queryInterface.sequelize.query(`
    SELECT setval(pg_get_serial_sequence('core.tb_regra_faixa','id_regra_faixa'),
      (SELECT COALESCE(MAX(id_regra_faixa),1) FROM core.tb_regra_faixa)
    );
  `);
};

export const down = async (queryInterface: QueryInterface) => {
  await queryInterface.sequelize.query(`DELETE FROM core.tb_regra_faixa;`);
  await queryInterface.sequelize.query(`DELETE FROM core.tb_regra;`);

  await queryInterface.sequelize.query(`
    SELECT setval(pg_get_serial_sequence('core.tb_regra','id_regra'), 1);
  `);
  await queryInterface.sequelize.query(`
    SELECT setval(pg_get_serial_sequence('core.tb_regra_faixa','id_regra_faixa'), 1);
  `);
};