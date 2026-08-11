import { DataTypes, Model, InferAttributes, InferCreationAttributes } from 'sequelize';
import { sequelize } from '@/db/sequelize';

export class Regra extends Model<InferAttributes<Regra>, InferCreationAttributes<Regra>> {
  declare id_regra: number;
  declare tp_evento: string;
  declare tp_regra: string;
  declare ds_regra: string;
  declare ds_descricao: string;
  declare ativo: boolean;
  declare dt_cadastro: Date;
}

Regra.init(
  {
    id_regra: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true, allowNull: false },
    tp_evento: { type: DataTypes.STRING(30), allowNull: false },
    tp_regra: { type: DataTypes.STRING(20), allowNull: false },
    ds_regra: { type: DataTypes.STRING(200), allowNull: false },
    ds_descricao: { type: DataTypes.STRING(255), allowNull: false },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    dt_cadastro: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('now()') },
  },
  {
    sequelize,
    schema: 'core',
    tableName: 'tb_regra',
    timestamps: false,
  }
);