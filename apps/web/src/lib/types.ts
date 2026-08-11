export type JobStatus = "QUEUED" | "RUNNING" | "SUCCESS" | "FAILED" | string;

export type Job = {
  id_job_run: number;
  job_type: string;
  status: JobStatus;
  requested_by: string | null;
  input_filename: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  meta: any;
  error_message: string | null;
};

export type JobLog = {
  id_job_run_log: number;
  id_job_run: number;
  level: "INFO" | "WARN" | "ERROR" | "OK";
  message: string;
  meta: any;
  created_at: string;
};

/** ===== Pendências (Documentos sem match) ===== */

export type MatchPendente = {
  id_match: number;
  origem: string;
  cpf_extraido: string | null;
  filename: string | null;
  chave_origem: string | null;
  dt_carga: string;
};

export type Agente = {
  cd_agente: number;
  cpf_cnpj: string | null;
  nome: string;
  ds_status: string;
  dt_atualizacao: string;
};

export type DocumentoClicksign = {
  id_documento: number;
  clicksign_document_key: string;
  filename: string | null;

  cpf_extraido: string | null;
  cnpj_extraido: string | null;

  cd_agente: number | null;

  status: string | null;
  folder_id: string | null;

  uploaded_at: string | null;
  updated_at: string | null;
  finished_at: string | null;
  deadline_at: string | null;

  dt_assinatura: string | null;
  dt_carga: string;

  last_list_seen_at: string | null;
  raw_payload: any;

  agente?: Agente | null;
};

export type ListPendenciasResponse = {
  data: MatchPendente[];
  meta: {
    origem: string;
    q: string;
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type GetPendenciaResponse = {
  data: {
    pendencia: MatchPendente;
    documento: DocumentoClicksign | null;
    sugestoesAgentes: Agente[];
  };
};

export type SearchAgentesResponse = {
  data: Agente[];
};

export type ListAgentesResponse = {
  data: Agente[];
  meta: {
    q: string;
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type UpdateAgenteResponse = {
  data: Agente;
  jobId: string | null;
};


export type RegraFaixa = {
  id_regra_faixa: number;
  id_regra: number;
  qtd_ini: string | null; // vem como string do DECIMAL
  qtd_fim: string | null;
  vl_desconto: number;
};

export type Regra = {
  id_regra: number;
  tp_evento: string;
  tp_regra: string;
  ds_regra: string;
  ds_descricao: string;
  ativo: boolean;
  dt_cadastro: string;
  faixas?: RegraFaixa[];
};

export type ListRegrasResponse = {
  data: Regra[];
  meta: {
    q: string;
    tp_evento: string;
    tp_regra: string;
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type GetRegraResponse = { data: Regra };
export type UpdateRegraResponse = { data: Regra };
export type ReplaceFaixasResponse = { data: Regra };