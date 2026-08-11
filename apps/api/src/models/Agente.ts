import { DataTypes, Model, InferAttributes, InferCreationAttributes } from 'sequelize';
import { sequelize } from '@/db/sequelize';

export class Agente extends Model<InferAttributes<Agente>, InferCreationAttributes<Agente>> {
  declare cd_agente: number;
  declare cpf_cnpj: string | null;
  declare nome: string;
  declare ds_status: string;
  declare dt_atualizacao: Date;
}

Agente.init(
  {
    cd_agente: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true },
    cpf_cnpj: { type: DataTypes.STRING(14), allowNull: true },
    nome: { type: DataTypes.STRING(255), allowNull: false },
    ds_status: { type: DataTypes.STRING(50), allowNull: false },
    dt_atualizacao: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('now()') },
  },
  {
    sequelize,
    schema: 'core',
    tableName: 'tb_agente',
    timestamps: false,
  }
);