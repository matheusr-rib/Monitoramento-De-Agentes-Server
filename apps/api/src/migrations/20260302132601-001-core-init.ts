import {
  BIGINT,
  BOOLEAN,
  DATE,
  DATEONLY,
  DECIMAL,
  INTEGER,
  JSONB,
  QueryInterface,
  STRING,
  TEXT,
  UUID,
  literal,
} from 'sequelize';

const CORE = { schema: 'core' as const };

export const up = async (queryInterface: QueryInterface) => {
  await queryInterface.sequelize.query(`CREATE SCHEMA IF NOT EXISTS core;`);
  await queryInterface.sequelize.query(`CREATE EXTENSION IF NOT EXISTS unaccent;`);

  await queryInterface.createTable(
    { ...CORE, tableName: 'tb_agente' },
    {
      cd_agente: {
        type: BIGINT,
        primaryKey: true,
        allowNull: false,
      },
      cpf_cnpj: {
        type: STRING(14),
        allowNull: true,
      },
      nome: {
        type: STRING(255),
        allowNull: false,
      },
      ds_status: {
        type: STRING(50),
        allowNull: false,
      },
      dt_atualizacao: {
        type: DATE,
        allowNull: false,
        defaultValue: literal('now()'),
      },
    }
  );

  // índice útil p/ admin e match
  await queryInterface.addIndex(
    { ...CORE, tableName: 'tb_agente' },
    ['cpf_cnpj'],
    { name: 'ix_agente_cpf_cnpj' }
  );

  await queryInterface.createTable(
    { ...CORE, tableName: 'tb_regra' },
    {
      id_regra: {
        type: BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      tp_evento: {
        type: STRING(30),
        allowNull: false,
      },
      tp_regra: {
        type: STRING(20),
        allowNull: false,
      },
      ds_regra: {
        type: STRING(200),
        allowNull: false,
      },
      ds_descricao: {
        type: STRING(255),
        allowNull: false,
      },
      ativo: {
        type: BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      dt_cadastro: {
        type: DATE,
        allowNull: false,
        defaultValue: literal('now()'),
      },
    }
  );
  await queryInterface.sequelize.query(`
    ALTER TABLE core.tb_regra
    DROP CONSTRAINT IF EXISTS ck_tp_evento;
    ALTER TABLE core.tb_regra
    ADD CONSTRAINT ck_tp_evento
    CHECK (tp_evento::text = ANY (ARRAY[
      'POSVENDA','FRAUDE','NUVIDEO','ESTEIRA','DOCUMENTACAO','AUTORREGULACAO'
    ]::text[]));
  `);

  await queryInterface.sequelize.query(`
    ALTER TABLE core.tb_regra
    DROP CONSTRAINT IF EXISTS ck_tp_regra;
    ALTER TABLE core.tb_regra
    ADD CONSTRAINT ck_tp_regra
    CHECK (tp_regra::text = ANY (ARRAY[
      'POR_OCORRENCIA','BOOLEAN'
    ]::text[]));
  `);


  await queryInterface.addConstraint(
    { ...CORE, tableName: 'tb_regra' },
    {
      type: 'unique',
      name: 'uq_regra',
      fields: ['tp_evento', 'tp_regra', 'ds_regra'],
    }
  );

  await queryInterface.createTable(
    { ...CORE, tableName: 'tb_regra_faixa' },
    {
      id_regra_faixa: {
        type: BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      id_regra: {
        type: BIGINT,
        allowNull: false,
        references: {
          model: { ...CORE, tableName: 'tb_regra' },
          key: 'id_regra',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      qtd_ini: {
        type: DECIMAL(10, 6),
        allowNull: true,
      },
      qtd_fim: {
        type: DECIMAL(10, 6),
        allowNull: true,
      },
      vl_desconto: {
        type: INTEGER,
        allowNull: false,
      },
    }
  );

  await queryInterface.sequelize.query(`
    ALTER TABLE core.tb_regra_faixa
    DROP CONSTRAINT IF EXISTS ck_faixa_intervalo;
    ALTER TABLE core.tb_regra_faixa
    ADD CONSTRAINT ck_faixa_intervalo
    CHECK (
      (qtd_ini IS NULL AND qtd_fim IS NULL)
      OR
      (qtd_ini IS NOT NULL AND qtd_fim IS NOT NULL AND qtd_ini <= qtd_fim)
    );
  `);

  await queryInterface.addIndex(
    { ...CORE, tableName: 'tb_regra_faixa' },
    ['id_regra'],
    { name: 'ix_regra_faixa_id_regra' }
  );

  await queryInterface.createTable(
    { ...CORE, tableName: 'tb_documento_clicksign' },
    {
      id_documento: {
        type: BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      clicksign_document_key: {
        type: UUID,
        allowNull: false,
        unique: true,
      },

      filename: {
        type: TEXT,
        allowNull: true,
      },

      cpf_extraido: {
        type: STRING(11),
        allowNull: true,
      },
      cnpj_extraido: {
        type: STRING(14),
        allowNull: true,
      },

      cd_agente: {
        type: BIGINT,
        allowNull: true,
        references: {
          model: { ...CORE, tableName: 'tb_agente' },
          key: 'cd_agente',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },

      status: {
        type: TEXT,
        allowNull: true,
      },
      folder_id: {
        type: TEXT,
        allowNull: true,
      },

      uploaded_at: {
        type: DATE,
        allowNull: true,
      },
      updated_at: {
        type: DATE,
        allowNull: true,
      },
      finished_at: {
        type: DATE,
        allowNull: true,
      },
      deadline_at: {
        type: DATE,
        allowNull: true,
      },

      dt_assinatura: {
        type: DATE,
        allowNull: true,
      },

      dt_carga: {
        type: DATE,
        allowNull: false,
        defaultValue: literal('now()'),
      },

      last_list_seen_at: {
        type: DATE,
        allowNull: true,
      },

      raw_payload: {
        type: JSONB,
        allowNull: true,
      },
    }
  );

  // índices p/ match/admin
  await queryInterface.addIndex(
    { ...CORE, tableName: 'tb_documento_clicksign' },
    ['cd_agente'],
    { name: 'ix_documento_agente' }
  );

  await queryInterface.addIndex(
    { ...CORE, tableName: 'tb_documento_clicksign' },
    ['cpf_extraido'],
    { name: 'ix_documento_cpf_extraido' }
  );

  await queryInterface.addIndex(
    { ...CORE, tableName: 'tb_documento_clicksign' },
    ['cnpj_extraido'],
    { name: 'ix_documento_cnpj_extraido' }
  );

  await queryInterface.addIndex(
    { ...CORE, tableName: 'tb_documento_clicksign' },
    ['last_list_seen_at'],
    { name: 'ix_documento_last_seen' }
  );

  // tb_match_pendente
  await queryInterface.createTable(
    { ...CORE, tableName: 'tb_match_pendente' },
    {
      id_match: {
        type: BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      origem: {
        type: STRING(50),
        allowNull: false,
      },
      cpf_extraido: {
        type: STRING(20),
        allowNull: true,
      },
      filename: {
        type: STRING(255),
        allowNull: true,
      },
      chave_origem: {
        type: TEXT,
        allowNull: true,
      },
      dt_carga: {
        type: DATE,
        allowNull: false,
        defaultValue: literal('now()'),
      },
    }
  );

  await queryInterface.addIndex(
    { ...CORE, tableName: 'tb_match_pendente' },
    ['origem', 'chave_origem'],
    { name: 'uq_match_pendente_origem_chave', unique: true }
  );

  // tb_esteira
  await queryInterface.createTable(
    { ...CORE, tableName: 'tb_esteira' },
    {
      id_esteira_agente: {
        type: BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      cd_agente: {
        type: BIGINT,
        allowNull: false,
        references: {
          model: { ...CORE, tableName: 'tb_agente' },
          key: 'cd_agente',
        },
      },
      ds_esteira: {
        type: STRING(20),
        allowNull: false,
      },
      dt_atualizacao: {
        type: DATE,
        allowNull: false,
        defaultValue: literal('now()'),
      },
    }
  );

  await queryInterface.addIndex(
    { ...CORE, tableName: 'tb_esteira' },
    ['cd_agente'],
    { name: 'ix_esteira_agente' }
  );

  // tb_posvenda
  await queryInterface.createTable(
    { ...CORE, tableName: 'tb_posvenda' },
    {
      id_posvenda: {
        type: BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      cd_agente: {
        type: BIGINT,
        allowNull: false,
        references: {
          model: { ...CORE, tableName: 'tb_agente' },
          key: 'cd_agente',
        },
      },
      dt_evento: {
        type: DATE,
        allowNull: false,
      },
      ds_resultado: {
        type: STRING(50),
        allowNull: false,
      },
      ds_motivo: {
        type: STRING(255),
        allowNull: true,
      },
      nr_proposta: {
        type: STRING(30),
        allowNull: true,
      },
      dt_carga: {
        type: DATE,
        allowNull: false,
        defaultValue: literal('now()'),
      },
    }
  );

  // UNIQUE por expressão (COALESCE) -> SQL cru (necessário p/ ON CONFLICT DO NOTHING funcionar certo)
  await queryInterface.sequelize.query(`
    CREATE UNIQUE INDEX uq_posvenda_evento
    ON core.tb_posvenda
    USING btree (
      cd_agente,
      dt_evento,
      ds_resultado,
      COALESCE(ds_motivo, '__SEM_MOTIVO__'::character varying),
      COALESCE(nr_proposta, '__SEM_PROPOSTA__'::character varying)
    );
  `);

  // tb_nuvideo
  await queryInterface.createTable(
    { ...CORE, tableName: 'tb_nuvideo' },
    {
      id_nuvideo: {
        type: BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      cd_agente: {
        type: BIGINT,
        allowNull: false,
        references: {
          model: { ...CORE, tableName: 'tb_agente' },
          key: 'cd_agente',
        },
      },
      dt_evento: {
        type: DATE,
        allowNull: false,
      },
      ds_tag: {
        type: STRING(255),
        allowNull: false,
      },
      nr_protocolo: {
        type: STRING(50),
        allowNull: true,
      },
      dt_carga: {
        type: DATE,
        allowNull: false,
        defaultValue: literal('now()'),
      },
    }
  );

  await queryInterface.sequelize.query(`
    CREATE UNIQUE INDEX uq_nuvideo_evento
    ON core.tb_nuvideo
    USING btree (
      cd_agente,
      dt_evento,
      ds_tag,
      COALESCE(nr_protocolo, '__SEM_PROTOCOLO__'::character varying)
    );
  `);

  // tb_fraude
  await queryInterface.createTable(
    { ...CORE, tableName: 'tb_fraude' },
    {
      id_fraude: {
        type: BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      cd_agente: {
        type: BIGINT,
        allowNull: false,
        references: {
          model: { ...CORE, tableName: 'tb_agente' },
          key: 'cd_agente',
        },
      },
      dt_evento: {
        type: DATEONLY,
        allowNull: false,
      },
      ds_motivo: {
        type: STRING(255),
        allowNull: false,
      },
      nr_proposta: {
        type: STRING(30),
        allowNull: true,
      },
      dt_carga: {
        type: DATE,
        allowNull: false,
        defaultValue: literal('now()'),
      },
    }
  );

  await queryInterface.sequelize.query(`
    CREATE UNIQUE INDEX uq_fraude_evento
    ON core.tb_fraude
    USING btree (
      cd_agente,
      dt_evento,
      ds_motivo,
      COALESCE(nr_proposta, '__SEM_PROPOSTA__'::character varying)
    );
  `);

  await queryInterface.addIndex(
    { ...CORE, tableName: 'tb_fraude' },
    ['cd_agente', 'dt_evento'],
    { name: 'ix_fraude_agente_data' }
  );
  await queryInterface.addIndex(
    { ...CORE, tableName: 'tb_fraude' },
    ['ds_motivo'],
    { name: 'ix_fraude_motivo' }
  );
  await queryInterface.addIndex(
    { ...CORE, tableName: 'tb_fraude' },
    ['nr_proposta'],
    { name: 'ix_fraude_proposta' }
  );

  // tb_autorregulacao
  await queryInterface.createTable(
    { ...CORE, tableName: 'tb_autorregulacao' },
    {
      id_autorregulacao: {
        type: BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      cd_agente: {
        type: BIGINT,
        allowNull: false,
        references: {
          model: { ...CORE, tableName: 'tb_agente' },
          key: 'cd_agente',
        },
      },
      dt_evento: {
        type: DATE,
        allowNull: false,
      },
      convenio: {
        type: STRING(255),
        allowNull: false,
      },
      prazo: {
        type: BIGINT,
        allowNull: true,
      },
      houve_violacao: {
        type: BOOLEAN,
        allowNull: true,
      },
      nr_proposta: {
        type: STRING(30),
        allowNull: true,
      },
      dt_carga: {
        type: DATE,
        allowNull: false,
        defaultValue: literal('now()'),
      },
    }
  );

  // UNIQUE por expressão (COALESCE) necessário para o loader fazer upsert com NULL-safe
  await queryInterface.sequelize.query(`
    CREATE UNIQUE INDEX uq_autorreg_evento
    ON core.tb_autorregulacao
    USING btree (
      cd_agente,
      dt_evento,
      convenio,
      COALESCE(prazo, ('-1'::integer)::bigint),
      COALESCE(nr_proposta, '__SEM_PROPOSTA__'::character varying)
    );
  `);

  // tb_convenio_prazo
  await queryInterface.createTable(
    { ...CORE, tableName: 'tb_convenio_prazo' },
    {
      id_convenio: {
        type: BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      ds_convenio: {
        type: TEXT,
        allowNull: false,
      },
      ds_convenio_norm: {
        type: TEXT,
        allowNull: false,
        unique: true,
      },
      nr_prazo_max: {
        type: INTEGER,
        allowNull: false,
      },
      dt_carga: {
        type: DATE,
        allowNull: false,
        defaultValue: literal('now()'),
      },
    }
  );

  // CHECK via SQL (idempotente)
  await queryInterface.sequelize.query(`
    ALTER TABLE core.tb_convenio_prazo
    DROP CONSTRAINT IF EXISTS ck_convenio_prazo_max_gt0;
    ALTER TABLE core.tb_convenio_prazo
    ADD CONSTRAINT ck_convenio_prazo_max_gt0
    CHECK (nr_prazo_max > 0);
  `);

  await queryInterface.addIndex(
    { ...CORE, tableName: 'tb_convenio_prazo' },
    ['ds_convenio_norm'],
    { name: 'ix_convenio_norm' }
  );

  // tb_score_monitoramento_agente
  await queryInterface.createTable(
    { ...CORE, tableName: 'tb_score_monitoramento_agente' },
    {
      id_score: {
        type: BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      cd_agente: {
        type: BIGINT,
        allowNull: false,
        references: {
          model: { ...CORE, tableName: 'tb_agente' },
          key: 'cd_agente',
        },
      },
      dt_inicio_periodo: {
        type: DATEONLY,
        allowNull: false,
      },
      dt_fim_periodo: {
        type: DATEONLY,
        allowNull: false,
      },
      vl_score_inicial: {
        type: INTEGER,
        allowNull: false,
        defaultValue: 1000,
      },
      vl_desc_esteira: {
        type: INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      vl_desc_documentacao: {
        type: INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      vl_desc_nuvideo: {
        type: INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      vl_desc_autorreg: {
        type: INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      vl_desc_posvenda: {
        type: INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      vl_desc_fraude: {
        type: INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      vl_score_final: {
        type: INTEGER,
        allowNull: false,
      },
      dt_calculo: {
        type: DATE,
        allowNull: false,
        defaultValue: literal('now()'),
      },
      ds_esteira_periodo: {
        type: STRING(20),
        allowNull: true,
      },
    }
  );

  await queryInterface.addConstraint(
    { ...CORE, tableName: 'tb_score_monitoramento_agente' },
    {
      type: 'unique',
      name: 'uq_score',
      fields: ['cd_agente', 'dt_inicio_periodo', 'dt_fim_periodo'],
    }
  );

  await queryInterface.addIndex(
    { ...CORE, tableName: 'tb_score_monitoramento_agente' },
    ['cd_agente', 'dt_inicio_periodo', 'dt_fim_periodo'],
    { name: 'ix_score_agente_periodo' }
  );
  await queryInterface.addIndex(
    { ...CORE, tableName: 'tb_score_monitoramento_agente' },
    ['dt_inicio_periodo', 'dt_fim_periodo'],
    { name: 'ix_score_periodo' }
  );
  await queryInterface.addIndex(
    { ...CORE, tableName: 'tb_score_monitoramento_agente' },
    ['vl_score_final'],
    { name: 'ix_score_final' }
  );

  // tb_score_monitoramento_detalhe
  await queryInterface.createTable(
    { ...CORE, tableName: 'tb_score_monitoramento_detalhe' },
    {
      id_detalhe: {
        type: BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      id_score: {
        type: BIGINT,
        allowNull: false,
        references: {
          model: { ...CORE, tableName: 'tb_score_monitoramento_agente' },
          key: 'id_score',
        },
      },
      id_regra: {
        type: BIGINT,
        allowNull: false,
        references: {
          model: { ...CORE, tableName: 'tb_regra' },
          key: 'id_regra',
        },
      },
      chave_evento: {
        type: STRING(200),
        allowNull: true,
      },
      qtd_ocorrencias: {
        type: INTEGER,
        allowNull: false,
      },
      vl_desconto_aplicado: {
        type: INTEGER,
        allowNull: false,
      },
      observacao: {
        type: TEXT,
        allowNull: true,
      },
    }
  );

  await queryInterface.addIndex(
    { ...CORE, tableName: 'tb_score_monitoramento_detalhe' },
    ['id_score'],
    { name: 'ix_detalhe_score' }
  );
  await queryInterface.addIndex(
    { ...CORE, tableName: 'tb_score_monitoramento_detalhe' },
    ['id_regra'],
    { name: 'ix_detalhe_regra' }
  );

  // tb_score_monitoramento_fraude_motivo (PK composta)
  await queryInterface.createTable(
    { ...CORE, tableName: 'tb_score_monitoramento_fraude_motivo' },
    {
      id_score: {
        type: BIGINT,
        allowNull: false,
        primaryKey: true,
        references: {
          model: { ...CORE, tableName: 'tb_score_monitoramento_agente' },
          key: 'id_score',
        },
        onDelete: 'CASCADE',
      },
      id_regra: {
        type: BIGINT,
        allowNull: false,
        primaryKey: true,
        references: {
          model: { ...CORE, tableName: 'tb_regra' },
          key: 'id_regra',
        },
      },
      ds_classificacao: {
        type: TEXT,
        allowNull: false,
      },
      ds_motivo: {
        type: TEXT,
        allowNull: false,
        primaryKey: true,
      },
      qtd_ocorrencias: {
        type: INTEGER,
        allowNull: false,
      },
    }
  );

    // =========================
  // TABELAS AUXILIARES (public)
  // =========================
  // sync_state (necessário para o backfill retomar página)
  await queryInterface.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.sync_state (
      id integer PRIMARY KEY,
      backfill_done boolean NOT NULL DEFAULT false,
      last_backfill_page integer NOT NULL DEFAULT 1,
      updated_at timestamp NOT NULL DEFAULT now()
    );

    INSERT INTO public.sync_state (id, backfill_done, last_backfill_page, updated_at)
    VALUES (1, false, 1, now())
    ON CONFLICT (id) DO NOTHING;
  `);
};

export const down = async (queryInterface: QueryInterface) => {
  // Drop em ordem segura
  await queryInterface.dropTable('sync_state');

  // schema core (CASCADE derruba tabelas + índices)
  await queryInterface.sequelize.query(`DROP SCHEMA IF EXISTS core CASCADE;`);
};