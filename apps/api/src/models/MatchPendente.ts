import { DataTypes, Model, InferAttributes, InferCreationAttributes } from 'sequelize';
import { sequelize } from '@/db/sequelize';

export class MatchPendente extends Model<
  InferAttributes<MatchPendente>,
  InferCreationAttributes<MatchPendente>
> {
  declare id_match: number;
  declare origem: string;
  declare cpf_extraido: string | null;
  declare filename: string | null;
  declare chave_origem: string | null;
  declare dt_carga: Date;
}

MatchPendente.init(
  {
    id_match: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true, allowNull: false },
    origem: { type: DataTypes.STRING(50), allowNull: false },
    cpf_extraido: { type: DataTypes.STRING(20), allowNull: true },
    filename: { type: DataTypes.STRING(255), allowNull: true },
    chave_origem: { type: DataTypes.TEXT, allowNull: true },
    dt_carga: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('now()') },
  },
  {
    sequelize,
    schema: 'core',
    tableName: 'tb_match_pendente',
    timestamps: false,
  }
);