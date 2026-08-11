import { BadRequestError, BaseError } from '@lewe-negocios/api-core';
import type { LoaderType } from '@/services/LoaderTypes';
import type { TaskExecutionContext } from '@/services/TaskExecutor';

import { AgentesLoader } from '@/loaders/AgentesLoader';
import { AutorregulacaoLoader } from '@/loaders/AutorregulacaoLoader';
import { NuvideoLoader } from '@/loaders/NuvideoLoader';

import { EsteiraLoader } from '@/loaders/EsteiraLoader';
import { FraudeLoader } from '@/loaders/FraudeLoader';
import { PosvendaLoader } from '@/loaders/PosvendaLoader';
import { ConvenioPrazoLoader } from '@/loaders/ConvenioPrazoLoader';

export class LoaderService {
  private agentes = new AgentesLoader();
  private autorreg = new AutorregulacaoLoader();
  private nuvideo = new NuvideoLoader();

  private esteira = new EsteiraLoader();
  private fraude = new FraudeLoader();
  private posvenda = new PosvendaLoader();
  private convenioPrazo = new ConvenioPrazoLoader();

  async run(type: LoaderType, filePath: string, ctx: TaskExecutionContext) {
    if (!filePath) throw new BadRequestError('NO_FILE_UPLOADED');

    switch (type) {
      case 'AGENTES':
        return this.agentes.run(filePath, ctx);

      case 'AUTORREGULACAO':
        return this.autorreg.run(filePath, ctx);

      case 'NUVIDEO':
        return this.nuvideo.run(filePath, ctx);

      case 'ESTEIRA':
        return this.esteira.run(filePath, ctx);

      case 'FRAUDE':
        return this.fraude.run(filePath, ctx);

      case 'POSVENDA':
        return this.posvenda.run(filePath, ctx);

      case 'CONVENIO_PRAZO':
        return this.convenioPrazo.run(filePath, ctx);

      default:
        throw new BadRequestError(`Loader não implementado: ${type}`);
    }
  }
}