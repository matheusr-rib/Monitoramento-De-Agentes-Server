import { sequelize } from '@/db/sequelize';
import type { TaskExecutionContext } from '@/services/TaskExecutor';

export class ProceduresService {
  static async matchClicksign(ctx: TaskExecutionContext) {
    await ctx.logInfo('CALL core.sp_match_documentos_clicksign()');
    await sequelize.query(`CALL core.sp_match_documentos_clicksign();`);
    await ctx.logOk('Procedure match finished');
    return { ok: true };
  }

  static async calcularScorePeriodo(
    params: { dtInicio: string; dtFim: string },
    ctx: TaskExecutionContext
  ) {
    const { dtInicio, dtFim } = params;
    if (!dtInicio || !dtFim) throw new Error('dtInicio e dtFim são obrigatórios');

    await ctx.logInfo('CALL core.sp_calcular_score_periodo', { dtInicio, dtFim });

    await sequelize.query(`CALL core.sp_calcular_score_periodo(:dtInicio::date, :dtFim::date);`, {
      replacements: { dtInicio, dtFim },
    });

    await ctx.logOk('Procedure score finished', { dtInicio, dtFim });
    return { ok: true };
  }
}
