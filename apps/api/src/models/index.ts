import { sequelize } from '@/db/sequelize';

import { Agente } from '@/models/Agente';
import { Regra } from '@/models/Regra';
import { RegraFaixa } from '@/models/RegraFaixa';
import { JobRun } from '@/models/JobRun';
import { JobRunLog } from '@/models/JobRunLog';
import { DocumentoClicksign } from '@/models/DocumentoClicksign';
import { MatchPendente } from '@/models/MatchPendente';

export function initModels() {
  return { sequelize, Agente, Regra, RegraFaixa, JobRun, JobRunLog, DocumentoClicksign, MatchPendente };
}