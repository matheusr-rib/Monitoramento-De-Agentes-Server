--
-- PostgreSQL database dump
--

\restrict VKVg24xqSBnhVyBFYpL2M0fPNXnPmz9LObIuIbrrTq9p7rkMdaQ5Mvrwt6TXF2K

-- Dumped from database version 15.18 (Debian 15.18-1.pgdg13+1)
-- Dumped by pg_dump version 15.18 (Debian 15.18-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: core; Type: SCHEMA; Schema: -; Owner: score_user
--

CREATE SCHEMA core;


ALTER SCHEMA core OWNER TO score_user;

--
-- Name: sp_calcular_score_periodo(date, date); Type: PROCEDURE; Schema: core; Owner: score_user
--

CREATE PROCEDURE core.sp_calcular_score_periodo(IN p_dt_inicio date, IN p_dt_fim date)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_dummy int;
BEGIN
  DELETE FROM core.tb_score_monitoramento_fraude_motivo fm
  USING core.tb_score_monitoramento_agente s
  WHERE fm.id_score = s.id_score
    AND s.dt_inicio_periodo = p_dt_inicio
    AND s.dt_fim_periodo = p_dt_fim;

  DELETE FROM core.tb_score_monitoramento_detalhe d
  USING core.tb_score_monitoramento_agente s
  WHERE d.id_score = s.id_score
    AND s.dt_inicio_periodo = p_dt_inicio
    AND s.dt_fim_periodo = p_dt_fim;

  DELETE FROM core.tb_score_monitoramento_agente s
  WHERE s.dt_inicio_periodo = p_dt_inicio
    AND s.dt_fim_periodo = p_dt_fim;

  WITH agentes AS (
    SELECT a.cd_agente
    FROM core.tb_agente a
  ),
  esteira_atual AS (
    SELECT x.cd_agente, x.ds_esteira
    FROM (
      SELECT
        e.cd_agente,
        e.ds_esteira,
        ROW_NUMBER() OVER (
          PARTITION BY e.cd_agente
          ORDER BY e.dt_atualizacao DESC NULLS LAST, e.id_esteira_agente DESC
        ) AS rn
      FROM core.tb_esteira e
    ) x
    WHERE x.rn = 1
  ),
  posvenda_cnt AS (
    SELECT
      p.cd_agente,
      unaccent(upper(p.ds_motivo)) AS chave_norm,
      COUNT(*)::int AS qtd
    FROM core.tb_posvenda p
    WHERE p.dt_evento::date BETWEEN p_dt_inicio AND p_dt_fim
      AND p.ds_motivo IS NOT NULL
    GROUP BY p.cd_agente, unaccent(upper(p.ds_motivo))
  ),
  nuvideo_cnt AS (
    SELECT
      n.cd_agente,
      unaccent(upper(n.ds_tag)) AS chave_norm,
      COUNT(*)::int AS qtd
    FROM core.tb_nuvideo n
    WHERE n.dt_evento::date BETWEEN p_dt_inicio AND p_dt_fim
      AND n.ds_tag IS NOT NULL
    GROUP BY n.cd_agente, unaccent(upper(n.ds_tag))
  ),
  autorreg_cnt AS (
    SELECT
      ar.cd_agente,
      unaccent(upper('AUTORREGULA├ç├âO')) AS chave_norm,
      COUNT(*)::int AS qtd
    FROM core.tb_autorregulacao ar
    WHERE ar.dt_evento::date BETWEEN p_dt_inicio AND p_dt_fim
      AND ar.houve_violacao = true
    GROUP BY ar.cd_agente
  ),
  fraude_base AS (
    SELECT
      f.cd_agente,
      f.ds_motivo,
      unaccent(upper(
        CASE
          WHEN unaccent(upper(f.ds_motivo)) IN (
            unaccent(upper('DESCONHECIMENTO DA OPERA├ç├âO')),
            unaccent(upper('CANCELAMENTO RECLAMA├ç├âO CLIENTE')),
            unaccent(upper('REVISE ATUA├ç├âO AGENTE VENDEDOR DIFERENTE DO AGENTE QUE NEGOCIOU')),
            unaccent(upper('RECLAMA├ç├âO')),
            unaccent(upper('CLIENTE SOLICITA CONTATO')),
            unaccent(upper('VOLUME CONSULTAS ROB├ö')),
            unaccent(upper('REVISE ATUA├ç├âO QTD MAXIMA DE DIGITA├ç├âO ESTRAPOLADA POR LOGIN')),
            unaccent(upper('INFORMA├ç├âO CONFIRMA├ç├âO OPERA├ç├âO')),
            unaccent(upper('POLITICA INTERNA')),
            unaccent(upper('REVISE ATUA├ç├âO DIGITA├ç├òES FORA DA ├üREA DE FORMALIZA├ç├âO DO CLIENTE')),
            unaccent(upper('REVISE ATUA├ç├âO CADASTRO TELEFONE P V├üRIOS CPF')),
            unaccent(upper('SOLICITA├ç├âO DE EVID├èNCIAS')),
            unaccent(upper('SEM MAIORES INFORMA├ç├òES')),
            unaccent(upper('RETORNADO E AGUARDANDO INFORMA├ç├òES'))
          ) THEN 'OPERACIONAL ROTINA'
          WHEN unaccent(upper(f.ds_motivo)) IN (
            unaccent(upper('IRREGULARIDADE EM PROPOSTA DOCUMENTO')),
            unaccent(upper('VOLUME CONTESTA├ç├òES LIQUIDA├ç├âO ANTECIPADA')),
            unaccent(upper('N├âO PERTURBE')),
            unaccent(upper('ATUA├ç├âO INDEVIDA EM PROPOSTA')),
            unaccent(upper('USUARIO HACKEADO')),
            unaccent(upper('SUSPENSO TEMPORARIAMENTE CONTESTA├ç├âO')),
            unaccent(upper('PLANO DE QUALIDADE')),
            unaccent(upper('INDICADOR DE QUALIDADE')),
            unaccent(upper('REVISE ATUA├ç├âO DIGITA├ç├òES EXCESSIVAS PARA O MESMO CPF')),
            unaccent(upper('REVISE ATUA├ç├âO M├ü VENDA OFERTA'))
          ) THEN 'RISCO CONTROLADO'
          WHEN unaccent(upper(f.ds_motivo)) IN (
            unaccent(upper('DEVOLU├ç├âO TERCEIROS')),
            unaccent(upper('SUSPEITA DE FRAUDE')),
            unaccent(upper('PORTABILIDADE POR FORA'))
          ) THEN 'RISCO CRITICO'
          ELSE NULL
        END
      )) AS chave_norm
    FROM core.tb_fraude f
    WHERE f.dt_evento::date BETWEEN p_dt_inicio AND p_dt_fim
      AND f.ds_motivo IS NOT NULL
  ),
  fraude_cnt_classificacao AS (
    SELECT
      fb.cd_agente,
      fb.chave_norm,
      COUNT(*)::int AS qtd
    FROM fraude_base fb
    WHERE fb.chave_norm IS NOT NULL
    GROUP BY fb.cd_agente, fb.chave_norm
  ),
  fraude_cnt_motivo AS (
    SELECT
      fb.cd_agente,
      fb.chave_norm,
      fb.ds_motivo,
      COUNT(*)::int AS qtd
    FROM fraude_base fb
    WHERE fb.chave_norm IS NOT NULL
    GROUP BY fb.cd_agente, fb.chave_norm, fb.ds_motivo
  ),
  esteira_bool AS (
    SELECT
      ea.cd_agente,
      unaccent(upper(r.ds_regra)) AS chave_norm,
      1::int AS qtd
    FROM esteira_atual ea
    JOIN core.tb_regra r
      ON r.tp_evento = 'ESTEIRA'
     AND r.tp_regra  = 'BOOLEAN'
     AND r.ativo = true
     AND unaccent(upper(ea.ds_esteira)) = unaccent(upper(r.ds_regra))
  ),
  doc_bool AS (
    SELECT
      a.cd_agente,
      unaccent(upper('NAO TEM DOCUMENTACAO ASSINADA')) AS chave_norm,
      1::int AS qtd
    FROM agentes a
    WHERE NOT EXISTS (
      SELECT 1
      FROM core.tb_documento_clicksign d
      WHERE d.cd_agente = a.cd_agente
        AND d.uploaded_at::date BETWEEN p_dt_inicio AND p_dt_fim
        AND unaccent(upper(d.filename)) LIKE '%CPS CONTRATO DE PRESTACAO DE SERVIC% GRUPO LEV%'
        AND d.status = 'closed'
    )
  ),
  aplicacoes_brutas AS (
    SELECT 'POSVENDA'::text AS tp_evento, p.cd_agente, p.chave_norm, p.qtd FROM posvenda_cnt p
    UNION ALL
    SELECT 'NUVIDEO', n.cd_agente, n.chave_norm, n.qtd FROM nuvideo_cnt n
    UNION ALL
    SELECT 'AUTORREGULACAO', a.cd_agente, a.chave_norm, a.qtd FROM autorreg_cnt a
    UNION ALL
    SELECT 'FRAUDE', f.cd_agente, f.chave_norm, f.qtd FROM fraude_cnt_classificacao f
    UNION ALL
    SELECT 'ESTEIRA', e.cd_agente, e.chave_norm, e.qtd FROM esteira_bool e
    UNION ALL
    SELECT 'DOCUMENTACAO', d.cd_agente, d.chave_norm, d.qtd FROM doc_bool d
  ),
  aplicacoes_com_regra AS (
    SELECT
      ab.tp_evento,
      ab.cd_agente,
      r.id_regra,
      r.ds_regra,
      ab.qtd,
      ab.chave_norm
    FROM aplicacoes_brutas ab
    JOIN core.tb_regra r
      ON r.tp_evento = ab.tp_evento
     AND r.ativo = true
     AND unaccent(upper(r.ds_regra)) = ab.chave_norm
  ),
  aplicacoes_com_faixa AS (
    SELECT
      acr.cd_agente,
      acr.id_regra,
      acr.tp_evento,
      acr.ds_regra,
      acr.qtd,
      rf.qtd_ini,
      rf.qtd_fim,
      rf.vl_desconto
    FROM aplicacoes_com_regra acr
    JOIN core.tb_regra_faixa rf
      ON rf.id_regra = acr.id_regra
     AND (acr.qtd::numeric BETWEEN rf.qtd_ini AND rf.qtd_fim)
  ),
  ins_score AS (
    INSERT INTO core.tb_score_monitoramento_agente (
      cd_agente,
      dt_inicio_periodo,
      dt_fim_periodo,
      vl_score_inicial,
      ds_esteira_periodo,
      vl_desc_esteira,
      vl_desc_documentacao,
      vl_desc_nuvideo,
      vl_desc_autorreg,
      vl_desc_posvenda,
      vl_desc_fraude,
      vl_score_final
    )
    SELECT
      a.cd_agente,
      p_dt_inicio,
      p_dt_fim,
      1000,
      ea.ds_esteira,
      COALESCE(SUM(CASE WHEN acf.tp_evento = 'ESTEIRA' THEN acf.vl_desconto ELSE 0 END),0)::int,
      COALESCE(SUM(CASE WHEN acf.tp_evento = 'DOCUMENTACAO' THEN acf.vl_desconto ELSE 0 END),0)::int,
      COALESCE(SUM(CASE WHEN acf.tp_evento = 'NUVIDEO' THEN acf.vl_desconto ELSE 0 END),0)::int,
      COALESCE(SUM(CASE WHEN acf.tp_evento = 'AUTORREGULACAO' THEN acf.vl_desconto ELSE 0 END),0)::int,
      COALESCE(SUM(CASE WHEN acf.tp_evento = 'POSVENDA' THEN acf.vl_desconto ELSE 0 END),0)::int,
      COALESCE(SUM(CASE WHEN acf.tp_evento = 'FRAUDE' THEN acf.vl_desconto ELSE 0 END),0)::int,
      (1000 - COALESCE(SUM(acf.vl_desconto),0))::int AS vl_score_final
    FROM agentes a
    LEFT JOIN esteira_atual ea ON ea.cd_agente = a.cd_agente
    LEFT JOIN aplicacoes_com_faixa acf ON acf.cd_agente = a.cd_agente
    GROUP BY a.cd_agente, ea.ds_esteira
    RETURNING id_score, cd_agente
  ),
  ins_detalhe AS (
    INSERT INTO core.tb_score_monitoramento_detalhe (
      id_score,
      id_regra,
      chave_evento,
      qtd_ocorrencias,
      vl_desconto_aplicado,
      observacao
    )
    SELECT
      s.id_score,
      acf.id_regra,
      acf.ds_regra,
      acf.qtd,
      acf.vl_desconto,
      NULL::text
    FROM aplicacoes_com_faixa acf
    JOIN ins_score s ON s.cd_agente = acf.cd_agente
    RETURNING 1
  ),
  ins_fraude_motivo AS (
    INSERT INTO core.tb_score_monitoramento_fraude_motivo (
      id_score,
      id_regra,
      ds_classificacao,
      ds_motivo,
      qtd_ocorrencias
    )
    SELECT
      s.id_score,
      r.id_regra,
      r.ds_regra AS ds_classificacao,
      fm.ds_motivo,
      fm.qtd
    FROM fraude_cnt_motivo fm
    JOIN ins_score s
      ON s.cd_agente = fm.cd_agente
    JOIN core.tb_regra r
      ON r.tp_evento = 'FRAUDE'
     AND r.ativo = true
     AND unaccent(upper(r.ds_regra)) = fm.chave_norm
    RETURNING 1
  )
  SELECT 1 INTO v_dummy;

END;
$$;


ALTER PROCEDURE core.sp_calcular_score_periodo(IN p_dt_inicio date, IN p_dt_fim date) OWNER TO score_user;

--
-- Name: sp_match_documentos_clicksign(); Type: PROCEDURE; Schema: core; Owner: score_user
--

CREATE PROCEDURE core.sp_match_documentos_clicksign()
    LANGUAGE plpgsql
    AS $$
BEGIN
  TRUNCATE TABLE core.tb_match_pendente;

  WITH unicos AS (
    SELECT cpf_cnpj, MIN(cd_agente) AS cd_agente
    FROM core.tb_agente
    WHERE cpf_cnpj IS NOT NULL
      AND length(cpf_cnpj) = 11
    GROUP BY cpf_cnpj
    HAVING COUNT(*) = 1
  )
  UPDATE core.tb_documento_clicksign d
  SET cd_agente = u.cd_agente
  FROM unicos u
  WHERE d.cd_agente IS NULL
    AND d.uploaded_at::date > DATE '2025-12-31'
    AND d.filename IS NOT NULL
    AND unaccent(regexp_replace(upper(d.filename), '[^A-Z0-9 ]+', ' ', 'g'))
        LIKE '%CPS CONTRATO DE PRESTACAO DE SERVIC% GRUPO LEV%'
    AND d.cpf_extraido IS NOT NULL
    AND u.cpf_cnpj = d.cpf_extraido;

  WITH unicos AS (
    SELECT cpf_cnpj, MIN(cd_agente) AS cd_agente
    FROM core.tb_agente
    WHERE cpf_cnpj IS NOT NULL
      AND length(cpf_cnpj) = 14
    GROUP BY cpf_cnpj
    HAVING COUNT(*) = 1
  )
  UPDATE core.tb_documento_clicksign d
  SET cd_agente = u.cd_agente
  FROM unicos u
  WHERE d.cd_agente IS NULL
    AND d.uploaded_at::date > DATE '2025-12-31'
    AND d.filename IS NOT NULL
    AND unaccent(regexp_replace(upper(d.filename), '[^A-Z0-9 ]+', ' ', 'g'))
        LIKE '%CPS CONTRATO DE PRESTACAO DE SERVIC% GRUPO LEV%'
    AND d.cnpj_extraido IS NOT NULL
    AND u.cpf_cnpj = d.cnpj_extraido;

  INSERT INTO core.tb_match_pendente (origem, chave_origem, cpf_extraido, filename)
  SELECT
    'CLICKSIGN' AS origem,
    d.clicksign_document_key::text AS chave_origem,
    COALESCE(d.cpf_extraido, d.cnpj_extraido) AS cpf_extraido,
    d.filename
  FROM core.tb_documento_clicksign d
  WHERE d.cd_agente IS NULL
    AND d.uploaded_at::date > DATE '2025-12-31'
    AND d.filename IS NOT NULL
    AND unaccent(regexp_replace(upper(d.filename), '[^A-Z0-9 ]+', ' ', 'g'))
        LIKE '%CPS CONTRATO DE PRESTACAO DE SERVIC% GRUPO LEV%'
    AND (d.cpf_extraido IS NOT NULL OR d.cnpj_extraido IS NOT NULL);

END;
$$;


ALTER PROCEDURE core.sp_match_documentos_clicksign() OWNER TO score_user;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: tb_agente; Type: TABLE; Schema: core; Owner: score_user
--

CREATE TABLE core.tb_agente (
    cd_agente bigint NOT NULL,
    cpf_cnpj character varying(14),
    nome character varying(255) NOT NULL,
    ds_status character varying(50) NOT NULL,
    dt_atualizacao timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE core.tb_agente OWNER TO score_user;

--
-- Name: tb_autorregulacao; Type: TABLE; Schema: core; Owner: score_user
--

CREATE TABLE core.tb_autorregulacao (
    id_autorregulacao bigint NOT NULL,
    cd_agente bigint NOT NULL,
    dt_evento timestamp with time zone NOT NULL,
    convenio character varying(255) NOT NULL,
    prazo bigint,
    houve_violacao boolean,
    nr_proposta character varying(30),
    dt_carga timestamp with time zone DEFAULT now() NOT NULL,
    prazo_key bigint DEFAULT '-1'::integer NOT NULL,
    nr_proposta_key character varying(30) DEFAULT '__SEM_PROPOSTA__'::character varying NOT NULL
);


ALTER TABLE core.tb_autorregulacao OWNER TO score_user;

--
-- Name: tb_autorregulacao_id_autorregulacao_seq; Type: SEQUENCE; Schema: core; Owner: score_user
--

CREATE SEQUENCE core.tb_autorregulacao_id_autorregulacao_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE core.tb_autorregulacao_id_autorregulacao_seq OWNER TO score_user;

--
-- Name: tb_autorregulacao_id_autorregulacao_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: score_user
--

ALTER SEQUENCE core.tb_autorregulacao_id_autorregulacao_seq OWNED BY core.tb_autorregulacao.id_autorregulacao;


--
-- Name: tb_convenio_prazo; Type: TABLE; Schema: core; Owner: score_user
--

CREATE TABLE core.tb_convenio_prazo (
    id_convenio bigint NOT NULL,
    ds_convenio text NOT NULL,
    ds_convenio_norm text NOT NULL,
    nr_prazo_max integer NOT NULL,
    dt_carga timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_convenio_prazo_max_gt0 CHECK ((nr_prazo_max > 0))
);


ALTER TABLE core.tb_convenio_prazo OWNER TO score_user;

--
-- Name: tb_convenio_prazo_id_convenio_seq; Type: SEQUENCE; Schema: core; Owner: score_user
--

CREATE SEQUENCE core.tb_convenio_prazo_id_convenio_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE core.tb_convenio_prazo_id_convenio_seq OWNER TO score_user;

--
-- Name: tb_convenio_prazo_id_convenio_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: score_user
--

ALTER SEQUENCE core.tb_convenio_prazo_id_convenio_seq OWNED BY core.tb_convenio_prazo.id_convenio;


--
-- Name: tb_documento_clicksign; Type: TABLE; Schema: core; Owner: score_user
--

CREATE TABLE core.tb_documento_clicksign (
    id_documento bigint NOT NULL,
    clicksign_document_key uuid NOT NULL,
    filename text,
    cpf_extraido character varying(11),
    cnpj_extraido character varying(14),
    cd_agente bigint,
    status text,
    folder_id text,
    uploaded_at timestamp with time zone,
    updated_at timestamp with time zone,
    finished_at timestamp with time zone,
    deadline_at timestamp with time zone,
    dt_assinatura timestamp with time zone,
    dt_carga timestamp with time zone DEFAULT now() NOT NULL,
    last_list_seen_at timestamp with time zone,
    raw_payload jsonb
);


ALTER TABLE core.tb_documento_clicksign OWNER TO score_user;

--
-- Name: tb_documento_clicksign_id_documento_seq; Type: SEQUENCE; Schema: core; Owner: score_user
--

CREATE SEQUENCE core.tb_documento_clicksign_id_documento_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE core.tb_documento_clicksign_id_documento_seq OWNER TO score_user;

--
-- Name: tb_documento_clicksign_id_documento_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: score_user
--

ALTER SEQUENCE core.tb_documento_clicksign_id_documento_seq OWNED BY core.tb_documento_clicksign.id_documento;


--
-- Name: tb_esteira; Type: TABLE; Schema: core; Owner: score_user
--

CREATE TABLE core.tb_esteira (
    id_esteira_agente bigint NOT NULL,
    cd_agente bigint NOT NULL,
    ds_esteira character varying(20) NOT NULL,
    dt_atualizacao timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE core.tb_esteira OWNER TO score_user;

--
-- Name: tb_esteira_id_esteira_agente_seq; Type: SEQUENCE; Schema: core; Owner: score_user
--

CREATE SEQUENCE core.tb_esteira_id_esteira_agente_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE core.tb_esteira_id_esteira_agente_seq OWNER TO score_user;

--
-- Name: tb_esteira_id_esteira_agente_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: score_user
--

ALTER SEQUENCE core.tb_esteira_id_esteira_agente_seq OWNED BY core.tb_esteira.id_esteira_agente;


--
-- Name: tb_fraude; Type: TABLE; Schema: core; Owner: score_user
--

CREATE TABLE core.tb_fraude (
    id_fraude bigint NOT NULL,
    cd_agente bigint NOT NULL,
    dt_evento date NOT NULL,
    ds_motivo character varying(255) NOT NULL,
    nr_proposta character varying(30),
    dt_carga timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE core.tb_fraude OWNER TO score_user;

--
-- Name: tb_fraude_id_fraude_seq; Type: SEQUENCE; Schema: core; Owner: score_user
--

CREATE SEQUENCE core.tb_fraude_id_fraude_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE core.tb_fraude_id_fraude_seq OWNER TO score_user;

--
-- Name: tb_fraude_id_fraude_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: score_user
--

ALTER SEQUENCE core.tb_fraude_id_fraude_seq OWNED BY core.tb_fraude.id_fraude;


--
-- Name: tb_job_run; Type: TABLE; Schema: core; Owner: score_user
--

CREATE TABLE core.tb_job_run (
    id_job_run bigint NOT NULL,
    job_type character varying(40) NOT NULL,
    status character varying(10) DEFAULT 'RUNNING'::character varying NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    requested_by character varying(255) NOT NULL,
    input_filename character varying(255),
    input_meta jsonb,
    stats jsonb,
    error text,
    CONSTRAINT ck_job_run_status CHECK (((status)::text = ANY ((ARRAY['QUEUED'::character varying, 'RUNNING'::character varying, 'SUCCESS'::character varying, 'FAILED'::character varying])::text[]))),
    CONSTRAINT ck_job_run_type CHECK ((((job_type)::text ~~ 'LOADER_%'::text) OR ((job_type)::text = ANY ((ARRAY['BACKFILL'::character varying, 'PROC_MATCH'::character varying, 'PROC_SCORE'::character varying])::text[]))))
);


ALTER TABLE core.tb_job_run OWNER TO score_user;

--
-- Name: tb_job_run_id_job_run_seq; Type: SEQUENCE; Schema: core; Owner: score_user
--

CREATE SEQUENCE core.tb_job_run_id_job_run_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE core.tb_job_run_id_job_run_seq OWNER TO score_user;

--
-- Name: tb_job_run_id_job_run_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: score_user
--

ALTER SEQUENCE core.tb_job_run_id_job_run_seq OWNED BY core.tb_job_run.id_job_run;


--
-- Name: tb_job_run_log; Type: TABLE; Schema: core; Owner: score_user
--

CREATE TABLE core.tb_job_run_log (
    id_job_run_log bigint NOT NULL,
    id_job_run bigint NOT NULL,
    level character varying(10) DEFAULT 'INFO'::character varying NOT NULL,
    message text NOT NULL,
    meta jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_job_run_log_level CHECK (((level)::text = ANY ((ARRAY['INFO'::character varying, 'WARN'::character varying, 'ERROR'::character varying, 'OK'::character varying])::text[])))
);


ALTER TABLE core.tb_job_run_log OWNER TO score_user;

--
-- Name: tb_job_run_log_id_job_run_log_seq; Type: SEQUENCE; Schema: core; Owner: score_user
--

CREATE SEQUENCE core.tb_job_run_log_id_job_run_log_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE core.tb_job_run_log_id_job_run_log_seq OWNER TO score_user;

--
-- Name: tb_job_run_log_id_job_run_log_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: score_user
--

ALTER SEQUENCE core.tb_job_run_log_id_job_run_log_seq OWNED BY core.tb_job_run_log.id_job_run_log;


--
-- Name: tb_match_pendente; Type: TABLE; Schema: core; Owner: score_user
--

CREATE TABLE core.tb_match_pendente (
    id_match bigint NOT NULL,
    origem character varying(50) NOT NULL,
    cpf_extraido character varying(20),
    filename character varying(255),
    chave_origem text,
    dt_carga timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE core.tb_match_pendente OWNER TO score_user;

--
-- Name: tb_match_pendente_id_match_seq; Type: SEQUENCE; Schema: core; Owner: score_user
--

CREATE SEQUENCE core.tb_match_pendente_id_match_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE core.tb_match_pendente_id_match_seq OWNER TO score_user;

--
-- Name: tb_match_pendente_id_match_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: score_user
--

ALTER SEQUENCE core.tb_match_pendente_id_match_seq OWNED BY core.tb_match_pendente.id_match;


--
-- Name: tb_nuvideo; Type: TABLE; Schema: core; Owner: score_user
--

CREATE TABLE core.tb_nuvideo (
    id_nuvideo bigint NOT NULL,
    cd_agente bigint NOT NULL,
    dt_evento timestamp with time zone NOT NULL,
    ds_tag character varying(255) NOT NULL,
    nr_protocolo character varying(50),
    dt_carga timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE core.tb_nuvideo OWNER TO score_user;

--
-- Name: tb_nuvideo_id_nuvideo_seq; Type: SEQUENCE; Schema: core; Owner: score_user
--

CREATE SEQUENCE core.tb_nuvideo_id_nuvideo_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE core.tb_nuvideo_id_nuvideo_seq OWNER TO score_user;

--
-- Name: tb_nuvideo_id_nuvideo_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: score_user
--

ALTER SEQUENCE core.tb_nuvideo_id_nuvideo_seq OWNED BY core.tb_nuvideo.id_nuvideo;


--
-- Name: tb_posvenda; Type: TABLE; Schema: core; Owner: score_user
--

CREATE TABLE core.tb_posvenda (
    id_posvenda bigint NOT NULL,
    cd_agente bigint NOT NULL,
    dt_evento timestamp with time zone NOT NULL,
    ds_resultado character varying(50) NOT NULL,
    ds_motivo character varying(255),
    nr_proposta character varying(30),
    dt_carga timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE core.tb_posvenda OWNER TO score_user;

--
-- Name: tb_posvenda_id_posvenda_seq; Type: SEQUENCE; Schema: core; Owner: score_user
--

CREATE SEQUENCE core.tb_posvenda_id_posvenda_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE core.tb_posvenda_id_posvenda_seq OWNER TO score_user;

--
-- Name: tb_posvenda_id_posvenda_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: score_user
--

ALTER SEQUENCE core.tb_posvenda_id_posvenda_seq OWNED BY core.tb_posvenda.id_posvenda;


--
-- Name: tb_regra; Type: TABLE; Schema: core; Owner: score_user
--

CREATE TABLE core.tb_regra (
    id_regra bigint NOT NULL,
    tp_evento character varying(30) NOT NULL,
    tp_regra character varying(20) NOT NULL,
    ds_regra character varying(200) NOT NULL,
    ds_descricao character varying(255) NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    dt_cadastro timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_tp_evento CHECK (((tp_evento)::text = ANY (ARRAY['POSVENDA'::text, 'FRAUDE'::text, 'NUVIDEO'::text, 'ESTEIRA'::text, 'DOCUMENTACAO'::text, 'AUTORREGULACAO'::text]))),
    CONSTRAINT ck_tp_regra CHECK (((tp_regra)::text = ANY (ARRAY['POR_OCORRENCIA'::text, 'BOOLEAN'::text])))
);


ALTER TABLE core.tb_regra OWNER TO score_user;

--
-- Name: tb_regra_faixa; Type: TABLE; Schema: core; Owner: score_user
--

CREATE TABLE core.tb_regra_faixa (
    id_regra_faixa bigint NOT NULL,
    id_regra bigint NOT NULL,
    qtd_ini numeric(10,6),
    qtd_fim numeric(10,6),
    vl_desconto integer NOT NULL,
    CONSTRAINT ck_faixa_intervalo CHECK ((((qtd_ini IS NULL) AND (qtd_fim IS NULL)) OR ((qtd_ini IS NOT NULL) AND (qtd_fim IS NOT NULL) AND (qtd_ini <= qtd_fim))))
);


ALTER TABLE core.tb_regra_faixa OWNER TO score_user;

--
-- Name: tb_regra_faixa_id_regra_faixa_seq; Type: SEQUENCE; Schema: core; Owner: score_user
--

CREATE SEQUENCE core.tb_regra_faixa_id_regra_faixa_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE core.tb_regra_faixa_id_regra_faixa_seq OWNER TO score_user;

--
-- Name: tb_regra_faixa_id_regra_faixa_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: score_user
--

ALTER SEQUENCE core.tb_regra_faixa_id_regra_faixa_seq OWNED BY core.tb_regra_faixa.id_regra_faixa;


--
-- Name: tb_regra_id_regra_seq; Type: SEQUENCE; Schema: core; Owner: score_user
--

CREATE SEQUENCE core.tb_regra_id_regra_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE core.tb_regra_id_regra_seq OWNER TO score_user;

--
-- Name: tb_regra_id_regra_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: score_user
--

ALTER SEQUENCE core.tb_regra_id_regra_seq OWNED BY core.tb_regra.id_regra;


--
-- Name: tb_score_monitoramento_agente; Type: TABLE; Schema: core; Owner: score_user
--

CREATE TABLE core.tb_score_monitoramento_agente (
    id_score bigint NOT NULL,
    cd_agente bigint NOT NULL,
    dt_inicio_periodo date NOT NULL,
    dt_fim_periodo date NOT NULL,
    vl_score_inicial integer DEFAULT 1000 NOT NULL,
    vl_desc_esteira integer DEFAULT 0,
    vl_desc_documentacao integer DEFAULT 0,
    vl_desc_nuvideo integer DEFAULT 0,
    vl_desc_autorreg integer DEFAULT 0,
    vl_desc_posvenda integer DEFAULT 0,
    vl_desc_fraude integer DEFAULT 0,
    vl_score_final integer NOT NULL,
    dt_calculo timestamp with time zone DEFAULT now() NOT NULL,
    ds_esteira_periodo character varying(20)
);


ALTER TABLE core.tb_score_monitoramento_agente OWNER TO score_user;

--
-- Name: tb_score_monitoramento_agente_id_score_seq; Type: SEQUENCE; Schema: core; Owner: score_user
--

CREATE SEQUENCE core.tb_score_monitoramento_agente_id_score_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE core.tb_score_monitoramento_agente_id_score_seq OWNER TO score_user;

--
-- Name: tb_score_monitoramento_agente_id_score_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: score_user
--

ALTER SEQUENCE core.tb_score_monitoramento_agente_id_score_seq OWNED BY core.tb_score_monitoramento_agente.id_score;


--
-- Name: tb_score_monitoramento_detalhe; Type: TABLE; Schema: core; Owner: score_user
--

CREATE TABLE core.tb_score_monitoramento_detalhe (
    id_detalhe bigint NOT NULL,
    id_score bigint NOT NULL,
    id_regra bigint NOT NULL,
    chave_evento character varying(200),
    qtd_ocorrencias integer NOT NULL,
    vl_desconto_aplicado integer NOT NULL,
    observacao text
);


ALTER TABLE core.tb_score_monitoramento_detalhe OWNER TO score_user;

--
-- Name: tb_score_monitoramento_detalhe_id_detalhe_seq; Type: SEQUENCE; Schema: core; Owner: score_user
--

CREATE SEQUENCE core.tb_score_monitoramento_detalhe_id_detalhe_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE core.tb_score_monitoramento_detalhe_id_detalhe_seq OWNER TO score_user;

--
-- Name: tb_score_monitoramento_detalhe_id_detalhe_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: score_user
--

ALTER SEQUENCE core.tb_score_monitoramento_detalhe_id_detalhe_seq OWNED BY core.tb_score_monitoramento_detalhe.id_detalhe;


--
-- Name: tb_score_monitoramento_fraude_motivo; Type: TABLE; Schema: core; Owner: score_user
--

CREATE TABLE core.tb_score_monitoramento_fraude_motivo (
    id_score bigint NOT NULL,
    id_regra bigint NOT NULL,
    ds_classificacao text NOT NULL,
    ds_motivo text NOT NULL,
    qtd_ocorrencias integer NOT NULL
);


ALTER TABLE core.tb_score_monitoramento_fraude_motivo OWNER TO score_user;

--
-- Name: vw_dim_periodo_score; Type: VIEW; Schema: core; Owner: score_user
--

CREATE VIEW core.vw_dim_periodo_score AS
 SELECT DISTINCT s.dt_inicio_periodo,
    s.dt_fim_periodo,
    ((to_char((s.dt_inicio_periodo)::timestamp with time zone, 'YYYY-MM-DD'::text) || ' a '::text) || to_char((s.dt_fim_periodo)::timestamp with time zone, 'YYYY-MM-DD'::text)) AS ds_periodo
   FROM core.tb_score_monitoramento_agente s;


ALTER TABLE core.vw_dim_periodo_score OWNER TO score_user;

--
-- Name: vw_score_detalhe_descontos; Type: VIEW; Schema: core; Owner: score_user
--

CREATE VIEW core.vw_score_detalhe_descontos AS
 SELECT s.id_score,
    s.dt_inicio_periodo,
    s.dt_fim_periodo,
    s.cd_agente,
    a.nome,
        CASE
            WHEN ((r.tp_evento)::text = 'FRAUDE'::text) THEN 'ALERTA'::character varying
            ELSE r.tp_evento
        END AS tp_evento,
    r.tp_regra,
    r.id_regra,
    r.ds_regra,
    r.ds_descricao,
    d.qtd_ocorrencias,
    d.vl_desconto_aplicado,
    d.observacao
   FROM (((core.tb_score_monitoramento_detalhe d
     JOIN core.tb_score_monitoramento_agente s ON ((s.id_score = d.id_score)))
     JOIN core.tb_agente a ON ((a.cd_agente = s.cd_agente)))
     JOIN core.tb_regra r ON ((r.id_regra = d.id_regra)));


ALTER TABLE core.vw_score_detalhe_descontos OWNER TO score_user;

--
-- Name: vw_score_detalhe_evento_item; Type: VIEW; Schema: core; Owner: score_user
--

CREATE VIEW core.vw_score_detalhe_evento_item AS
 WITH base_detalhe AS (
         SELECT s.id_score,
            s.dt_inicio_periodo,
            s.dt_fim_periodo,
            s.cd_agente,
            a.nome,
                CASE
                    WHEN ((r.tp_evento)::text = 'FRAUDE'::text) THEN 'ALERTA'::character varying
                    ELSE r.tp_evento
                END AS tp_evento,
            r.id_regra,
            r.ds_regra,
            d.qtd_ocorrencias,
            d.vl_desconto_aplicado
           FROM (((core.tb_score_monitoramento_detalhe d
             JOIN core.tb_score_monitoramento_agente s ON ((s.id_score = d.id_score)))
             JOIN core.tb_regra r ON ((r.id_regra = d.id_regra)))
             JOIN core.tb_agente a ON ((a.cd_agente = s.cd_agente)))
        ), fraude_motivo_rateio AS (
         SELECT s.id_score,
            s.dt_inicio_periodo,
            s.dt_fim_periodo,
            s.cd_agente,
            a.nome,
            'ALERTA'::text AS tp_evento,
            fm.id_regra,
            fm.ds_classificacao,
            fm.ds_motivo AS ds_item_exibido,
            fm.qtd_ocorrencias,
            d.vl_desconto_aplicado AS vl_desconto_classificacao,
            sum(fm.qtd_ocorrencias) OVER (PARTITION BY fm.id_score, fm.id_regra) AS qtd_total_classificacao
           FROM (((core.tb_score_monitoramento_fraude_motivo fm
             JOIN core.tb_score_monitoramento_agente s ON ((s.id_score = fm.id_score)))
             JOIN core.tb_agente a ON ((a.cd_agente = s.cd_agente)))
             JOIN core.tb_score_monitoramento_detalhe d ON (((d.id_score = fm.id_score) AND (d.id_regra = fm.id_regra))))
        )
 SELECT bd.id_score,
    bd.dt_inicio_periodo,
    bd.dt_fim_periodo,
    bd.cd_agente,
    bd.nome,
    bd.tp_evento,
    bd.ds_regra AS ds_item_exibido,
    bd.qtd_ocorrencias,
    bd.vl_desconto_aplicado,
    NULL::text AS ds_classificacao
   FROM base_detalhe bd
  WHERE ((bd.tp_evento)::text <> 'ALERTA'::text)
UNION ALL
 SELECT fmr.id_score,
    fmr.dt_inicio_periodo,
    fmr.dt_fim_periodo,
    fmr.cd_agente,
    fmr.nome,
    fmr.tp_evento,
    fmr.ds_item_exibido,
    fmr.qtd_ocorrencias,
        CASE
            WHEN (fmr.qtd_total_classificacao > 0) THEN round((((fmr.vl_desconto_classificacao)::numeric * (fmr.qtd_ocorrencias)::numeric) / (fmr.qtd_total_classificacao)::numeric), 2)
            ELSE (0)::numeric
        END AS vl_desconto_aplicado,
    fmr.ds_classificacao
   FROM fraude_motivo_rateio fmr;


ALTER TABLE core.vw_score_detalhe_evento_item OWNER TO score_user;

--
-- Name: vw_score_fraude_motivos; Type: VIEW; Schema: core; Owner: score_user
--

CREATE VIEW core.vw_score_fraude_motivos AS
 SELECT s.id_score,
    s.dt_inicio_periodo,
    s.dt_fim_periodo,
    s.cd_agente,
    a.nome,
    fm.id_regra,
    fm.ds_classificacao,
    fm.ds_motivo,
    fm.qtd_ocorrencias
   FROM ((core.tb_score_monitoramento_fraude_motivo fm
     JOIN core.tb_score_monitoramento_agente s ON ((s.id_score = fm.id_score)))
     JOIN core.tb_agente a ON ((a.cd_agente = s.cd_agente)));


ALTER TABLE core.vw_score_fraude_motivos OWNER TO score_user;

--
-- Name: vw_score_resumo_periodo; Type: VIEW; Schema: core; Owner: score_user
--

CREATE VIEW core.vw_score_resumo_periodo AS
 SELECT s.id_score,
    s.dt_inicio_periodo,
    s.dt_fim_periodo,
    s.cd_agente,
    a.nome,
    a.cpf_cnpj,
    a.ds_status,
    s.ds_esteira_periodo,
    s.vl_score_inicial,
    s.vl_desc_esteira,
    s.vl_desc_documentacao,
    s.vl_desc_nuvideo,
    s.vl_desc_autorreg,
    s.vl_desc_posvenda,
    s.vl_desc_fraude,
    (s.vl_score_inicial - s.vl_score_final) AS vl_desconto_total,
    s.vl_score_final,
    s.dt_calculo
   FROM (core.tb_score_monitoramento_agente s
     JOIN core.tb_agente a ON ((a.cd_agente = s.cd_agente)));


ALTER TABLE core.vw_score_resumo_periodo OWNER TO score_user;

--
-- Name: tb_autorregulacao id_autorregulacao; Type: DEFAULT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_autorregulacao ALTER COLUMN id_autorregulacao SET DEFAULT nextval('core.tb_autorregulacao_id_autorregulacao_seq'::regclass);


--
-- Name: tb_convenio_prazo id_convenio; Type: DEFAULT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_convenio_prazo ALTER COLUMN id_convenio SET DEFAULT nextval('core.tb_convenio_prazo_id_convenio_seq'::regclass);


--
-- Name: tb_documento_clicksign id_documento; Type: DEFAULT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_documento_clicksign ALTER COLUMN id_documento SET DEFAULT nextval('core.tb_documento_clicksign_id_documento_seq'::regclass);


--
-- Name: tb_esteira id_esteira_agente; Type: DEFAULT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_esteira ALTER COLUMN id_esteira_agente SET DEFAULT nextval('core.tb_esteira_id_esteira_agente_seq'::regclass);


--
-- Name: tb_fraude id_fraude; Type: DEFAULT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_fraude ALTER COLUMN id_fraude SET DEFAULT nextval('core.tb_fraude_id_fraude_seq'::regclass);


--
-- Name: tb_job_run id_job_run; Type: DEFAULT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_job_run ALTER COLUMN id_job_run SET DEFAULT nextval('core.tb_job_run_id_job_run_seq'::regclass);


--
-- Name: tb_job_run_log id_job_run_log; Type: DEFAULT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_job_run_log ALTER COLUMN id_job_run_log SET DEFAULT nextval('core.tb_job_run_log_id_job_run_log_seq'::regclass);


--
-- Name: tb_match_pendente id_match; Type: DEFAULT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_match_pendente ALTER COLUMN id_match SET DEFAULT nextval('core.tb_match_pendente_id_match_seq'::regclass);


--
-- Name: tb_nuvideo id_nuvideo; Type: DEFAULT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_nuvideo ALTER COLUMN id_nuvideo SET DEFAULT nextval('core.tb_nuvideo_id_nuvideo_seq'::regclass);


--
-- Name: tb_posvenda id_posvenda; Type: DEFAULT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_posvenda ALTER COLUMN id_posvenda SET DEFAULT nextval('core.tb_posvenda_id_posvenda_seq'::regclass);


--
-- Name: tb_regra id_regra; Type: DEFAULT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_regra ALTER COLUMN id_regra SET DEFAULT nextval('core.tb_regra_id_regra_seq'::regclass);


--
-- Name: tb_regra_faixa id_regra_faixa; Type: DEFAULT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_regra_faixa ALTER COLUMN id_regra_faixa SET DEFAULT nextval('core.tb_regra_faixa_id_regra_faixa_seq'::regclass);


--
-- Name: tb_score_monitoramento_agente id_score; Type: DEFAULT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_score_monitoramento_agente ALTER COLUMN id_score SET DEFAULT nextval('core.tb_score_monitoramento_agente_id_score_seq'::regclass);


--
-- Name: tb_score_monitoramento_detalhe id_detalhe; Type: DEFAULT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_score_monitoramento_detalhe ALTER COLUMN id_detalhe SET DEFAULT nextval('core.tb_score_monitoramento_detalhe_id_detalhe_seq'::regclass);


--
-- Name: tb_regra_faixa ex_regra_faixa_no_overlap; Type: CONSTRAINT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_regra_faixa
    ADD CONSTRAINT ex_regra_faixa_no_overlap EXCLUDE USING gist (id_regra WITH =, numrange(qtd_ini, qtd_fim, '[]'::text) WITH &&) WHERE (((qtd_ini IS NOT NULL) AND (qtd_fim IS NOT NULL)));


--
-- Name: tb_agente tb_agente_pkey; Type: CONSTRAINT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_agente
    ADD CONSTRAINT tb_agente_pkey PRIMARY KEY (cd_agente);


--
-- Name: tb_autorregulacao tb_autorregulacao_pkey; Type: CONSTRAINT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_autorregulacao
    ADD CONSTRAINT tb_autorregulacao_pkey PRIMARY KEY (id_autorregulacao);


--
-- Name: tb_convenio_prazo tb_convenio_prazo_ds_convenio_norm_key; Type: CONSTRAINT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_convenio_prazo
    ADD CONSTRAINT tb_convenio_prazo_ds_convenio_norm_key UNIQUE (ds_convenio_norm);


--
-- Name: tb_convenio_prazo tb_convenio_prazo_pkey; Type: CONSTRAINT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_convenio_prazo
    ADD CONSTRAINT tb_convenio_prazo_pkey PRIMARY KEY (id_convenio);


--
-- Name: tb_documento_clicksign tb_documento_clicksign_clicksign_document_key_key; Type: CONSTRAINT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_documento_clicksign
    ADD CONSTRAINT tb_documento_clicksign_clicksign_document_key_key UNIQUE (clicksign_document_key);


--
-- Name: tb_documento_clicksign tb_documento_clicksign_pkey; Type: CONSTRAINT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_documento_clicksign
    ADD CONSTRAINT tb_documento_clicksign_pkey PRIMARY KEY (id_documento);


--
-- Name: tb_esteira tb_esteira_pkey; Type: CONSTRAINT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_esteira
    ADD CONSTRAINT tb_esteira_pkey PRIMARY KEY (id_esteira_agente);


--
-- Name: tb_fraude tb_fraude_pkey; Type: CONSTRAINT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_fraude
    ADD CONSTRAINT tb_fraude_pkey PRIMARY KEY (id_fraude);


--
-- Name: tb_job_run_log tb_job_run_log_pkey; Type: CONSTRAINT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_job_run_log
    ADD CONSTRAINT tb_job_run_log_pkey PRIMARY KEY (id_job_run_log);


--
-- Name: tb_job_run tb_job_run_pkey; Type: CONSTRAINT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_job_run
    ADD CONSTRAINT tb_job_run_pkey PRIMARY KEY (id_job_run);


--
-- Name: tb_match_pendente tb_match_pendente_pkey; Type: CONSTRAINT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_match_pendente
    ADD CONSTRAINT tb_match_pendente_pkey PRIMARY KEY (id_match);


--
-- Name: tb_nuvideo tb_nuvideo_pkey; Type: CONSTRAINT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_nuvideo
    ADD CONSTRAINT tb_nuvideo_pkey PRIMARY KEY (id_nuvideo);


--
-- Name: tb_posvenda tb_posvenda_pkey; Type: CONSTRAINT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_posvenda
    ADD CONSTRAINT tb_posvenda_pkey PRIMARY KEY (id_posvenda);


--
-- Name: tb_regra_faixa tb_regra_faixa_pkey; Type: CONSTRAINT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_regra_faixa
    ADD CONSTRAINT tb_regra_faixa_pkey PRIMARY KEY (id_regra_faixa);


--
-- Name: tb_regra tb_regra_pkey; Type: CONSTRAINT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_regra
    ADD CONSTRAINT tb_regra_pkey PRIMARY KEY (id_regra);


--
-- Name: tb_score_monitoramento_agente tb_score_monitoramento_agente_pkey; Type: CONSTRAINT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_score_monitoramento_agente
    ADD CONSTRAINT tb_score_monitoramento_agente_pkey PRIMARY KEY (id_score);


--
-- Name: tb_score_monitoramento_detalhe tb_score_monitoramento_detalhe_pkey; Type: CONSTRAINT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_score_monitoramento_detalhe
    ADD CONSTRAINT tb_score_monitoramento_detalhe_pkey PRIMARY KEY (id_detalhe);


--
-- Name: tb_score_monitoramento_fraude_motivo tb_score_monitoramento_fraude_motivo_pkey; Type: CONSTRAINT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_score_monitoramento_fraude_motivo
    ADD CONSTRAINT tb_score_monitoramento_fraude_motivo_pkey PRIMARY KEY (id_score, id_regra, ds_motivo);


--
-- Name: tb_regra uq_regra; Type: CONSTRAINT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_regra
    ADD CONSTRAINT uq_regra UNIQUE (tp_evento, tp_regra, ds_regra);


--
-- Name: tb_score_monitoramento_agente uq_score; Type: CONSTRAINT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_score_monitoramento_agente
    ADD CONSTRAINT uq_score UNIQUE (cd_agente, dt_inicio_periodo, dt_fim_periodo);


--
-- Name: ix_agente_cpf_cnpj; Type: INDEX; Schema: core; Owner: score_user
--

CREATE INDEX ix_agente_cpf_cnpj ON core.tb_agente USING btree (cpf_cnpj);


--
-- Name: ix_autorreg_agente_data; Type: INDEX; Schema: core; Owner: score_user
--

CREATE INDEX ix_autorreg_agente_data ON core.tb_autorregulacao USING btree (cd_agente, dt_evento);


--
-- Name: ix_convenio_norm; Type: INDEX; Schema: core; Owner: score_user
--

CREATE INDEX ix_convenio_norm ON core.tb_convenio_prazo USING btree (ds_convenio_norm);


--
-- Name: ix_detalhe_regra; Type: INDEX; Schema: core; Owner: score_user
--

CREATE INDEX ix_detalhe_regra ON core.tb_score_monitoramento_detalhe USING btree (id_regra);


--
-- Name: ix_detalhe_score; Type: INDEX; Schema: core; Owner: score_user
--

CREATE INDEX ix_detalhe_score ON core.tb_score_monitoramento_detalhe USING btree (id_score);


--
-- Name: ix_documento_agente; Type: INDEX; Schema: core; Owner: score_user
--

CREATE INDEX ix_documento_agente ON core.tb_documento_clicksign USING btree (cd_agente);


--
-- Name: ix_documento_cnpj_extraido; Type: INDEX; Schema: core; Owner: score_user
--

CREATE INDEX ix_documento_cnpj_extraido ON core.tb_documento_clicksign USING btree (cnpj_extraido);


--
-- Name: ix_documento_cpf_extraido; Type: INDEX; Schema: core; Owner: score_user
--

CREATE INDEX ix_documento_cpf_extraido ON core.tb_documento_clicksign USING btree (cpf_extraido);


--
-- Name: ix_documento_last_seen; Type: INDEX; Schema: core; Owner: score_user
--

CREATE INDEX ix_documento_last_seen ON core.tb_documento_clicksign USING btree (last_list_seen_at);


--
-- Name: ix_esteira_agente; Type: INDEX; Schema: core; Owner: score_user
--

CREATE INDEX ix_esteira_agente ON core.tb_esteira USING btree (cd_agente);


--
-- Name: ix_fraude_agente_data; Type: INDEX; Schema: core; Owner: score_user
--

CREATE INDEX ix_fraude_agente_data ON core.tb_fraude USING btree (cd_agente, dt_evento);


--
-- Name: ix_fraude_motivo; Type: INDEX; Schema: core; Owner: score_user
--

CREATE INDEX ix_fraude_motivo ON core.tb_fraude USING btree (ds_motivo);


--
-- Name: ix_fraude_proposta; Type: INDEX; Schema: core; Owner: score_user
--

CREATE INDEX ix_fraude_proposta ON core.tb_fraude USING btree (nr_proposta);


--
-- Name: ix_job_run_log_run_created; Type: INDEX; Schema: core; Owner: score_user
--

CREATE INDEX ix_job_run_log_run_created ON core.tb_job_run_log USING btree (id_job_run, created_at);


--
-- Name: ix_job_run_type_started; Type: INDEX; Schema: core; Owner: score_user
--

CREATE INDEX ix_job_run_type_started ON core.tb_job_run USING btree (job_type, started_at);


--
-- Name: ix_regra_faixa_id_regra; Type: INDEX; Schema: core; Owner: score_user
--

CREATE INDEX ix_regra_faixa_id_regra ON core.tb_regra_faixa USING btree (id_regra);


--
-- Name: ix_score_agente_periodo; Type: INDEX; Schema: core; Owner: score_user
--

CREATE INDEX ix_score_agente_periodo ON core.tb_score_monitoramento_agente USING btree (cd_agente, dt_inicio_periodo, dt_fim_periodo);


--
-- Name: ix_score_final; Type: INDEX; Schema: core; Owner: score_user
--

CREATE INDEX ix_score_final ON core.tb_score_monitoramento_agente USING btree (vl_score_final);


--
-- Name: ix_score_periodo; Type: INDEX; Schema: core; Owner: score_user
--

CREATE INDEX ix_score_periodo ON core.tb_score_monitoramento_agente USING btree (dt_inicio_periodo, dt_fim_periodo);


--
-- Name: uq_autorreg_evento; Type: INDEX; Schema: core; Owner: score_user
--

CREATE UNIQUE INDEX uq_autorreg_evento ON core.tb_autorregulacao USING btree (cd_agente, dt_evento, convenio, prazo_key, nr_proposta_key);


--
-- Name: uq_fraude_evento; Type: INDEX; Schema: core; Owner: score_user
--

CREATE UNIQUE INDEX uq_fraude_evento ON core.tb_fraude USING btree (cd_agente, dt_evento, ds_motivo, COALESCE(nr_proposta, '__SEM_PROPOSTA__'::character varying));


--
-- Name: uq_match_pendente_origem_chave; Type: INDEX; Schema: core; Owner: score_user
--

CREATE UNIQUE INDEX uq_match_pendente_origem_chave ON core.tb_match_pendente USING btree (origem, chave_origem);


--
-- Name: uq_nuvideo_evento; Type: INDEX; Schema: core; Owner: score_user
--

CREATE UNIQUE INDEX uq_nuvideo_evento ON core.tb_nuvideo USING btree (cd_agente, dt_evento, ds_tag, COALESCE(nr_protocolo, '__SEM_PROTOCOLO__'::character varying));


--
-- Name: uq_posvenda_evento; Type: INDEX; Schema: core; Owner: score_user
--

CREATE UNIQUE INDEX uq_posvenda_evento ON core.tb_posvenda USING btree (cd_agente, dt_evento, ds_resultado, COALESCE(ds_motivo, '__SEM_MOTIVO__'::character varying), COALESCE(nr_proposta, '__SEM_PROPOSTA__'::character varying));


--
-- Name: tb_autorregulacao tb_autorregulacao_cd_agente_fkey; Type: FK CONSTRAINT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_autorregulacao
    ADD CONSTRAINT tb_autorregulacao_cd_agente_fkey FOREIGN KEY (cd_agente) REFERENCES core.tb_agente(cd_agente);


--
-- Name: tb_documento_clicksign tb_documento_clicksign_cd_agente_fkey; Type: FK CONSTRAINT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_documento_clicksign
    ADD CONSTRAINT tb_documento_clicksign_cd_agente_fkey FOREIGN KEY (cd_agente) REFERENCES core.tb_agente(cd_agente) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: tb_esteira tb_esteira_cd_agente_fkey; Type: FK CONSTRAINT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_esteira
    ADD CONSTRAINT tb_esteira_cd_agente_fkey FOREIGN KEY (cd_agente) REFERENCES core.tb_agente(cd_agente);


--
-- Name: tb_fraude tb_fraude_cd_agente_fkey; Type: FK CONSTRAINT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_fraude
    ADD CONSTRAINT tb_fraude_cd_agente_fkey FOREIGN KEY (cd_agente) REFERENCES core.tb_agente(cd_agente);


--
-- Name: tb_job_run_log tb_job_run_log_id_job_run_fkey; Type: FK CONSTRAINT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_job_run_log
    ADD CONSTRAINT tb_job_run_log_id_job_run_fkey FOREIGN KEY (id_job_run) REFERENCES core.tb_job_run(id_job_run) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: tb_nuvideo tb_nuvideo_cd_agente_fkey; Type: FK CONSTRAINT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_nuvideo
    ADD CONSTRAINT tb_nuvideo_cd_agente_fkey FOREIGN KEY (cd_agente) REFERENCES core.tb_agente(cd_agente);


--
-- Name: tb_posvenda tb_posvenda_cd_agente_fkey; Type: FK CONSTRAINT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_posvenda
    ADD CONSTRAINT tb_posvenda_cd_agente_fkey FOREIGN KEY (cd_agente) REFERENCES core.tb_agente(cd_agente);


--
-- Name: tb_regra_faixa tb_regra_faixa_id_regra_fkey; Type: FK CONSTRAINT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_regra_faixa
    ADD CONSTRAINT tb_regra_faixa_id_regra_fkey FOREIGN KEY (id_regra) REFERENCES core.tb_regra(id_regra) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: tb_score_monitoramento_agente tb_score_monitoramento_agente_cd_agente_fkey; Type: FK CONSTRAINT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_score_monitoramento_agente
    ADD CONSTRAINT tb_score_monitoramento_agente_cd_agente_fkey FOREIGN KEY (cd_agente) REFERENCES core.tb_agente(cd_agente);


--
-- Name: tb_score_monitoramento_detalhe tb_score_monitoramento_detalhe_id_regra_fkey; Type: FK CONSTRAINT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_score_monitoramento_detalhe
    ADD CONSTRAINT tb_score_monitoramento_detalhe_id_regra_fkey FOREIGN KEY (id_regra) REFERENCES core.tb_regra(id_regra);


--
-- Name: tb_score_monitoramento_detalhe tb_score_monitoramento_detalhe_id_score_fkey; Type: FK CONSTRAINT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_score_monitoramento_detalhe
    ADD CONSTRAINT tb_score_monitoramento_detalhe_id_score_fkey FOREIGN KEY (id_score) REFERENCES core.tb_score_monitoramento_agente(id_score);


--
-- Name: tb_score_monitoramento_fraude_motivo tb_score_monitoramento_fraude_motivo_id_regra_fkey; Type: FK CONSTRAINT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_score_monitoramento_fraude_motivo
    ADD CONSTRAINT tb_score_monitoramento_fraude_motivo_id_regra_fkey FOREIGN KEY (id_regra) REFERENCES core.tb_regra(id_regra);


--
-- Name: tb_score_monitoramento_fraude_motivo tb_score_monitoramento_fraude_motivo_id_score_fkey; Type: FK CONSTRAINT; Schema: core; Owner: score_user
--

ALTER TABLE ONLY core.tb_score_monitoramento_fraude_motivo
    ADD CONSTRAINT tb_score_monitoramento_fraude_motivo_id_score_fkey FOREIGN KEY (id_score) REFERENCES core.tb_score_monitoramento_agente(id_score) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict VKVg24xqSBnhVyBFYpL2M0fPNXnPmz9LObIuIbrrTq9p7rkMdaQ5Mvrwt6TXF2K

