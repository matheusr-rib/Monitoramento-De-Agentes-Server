import { DataTypes, Model, InferAttributes, InferCreationAttributes } from 'sequelize';
import { sequelize } from '@/db/sequelize';
import { Regra } from '@/models/Regra';

export class RegraFaixa extends Model<InferAttributes<RegraFaixa>, InferCreationAttributes<RegraFaixa>> {
  declare id_regra_faixa: number;
  declare id_regra: number;
  declare qtd_ini: string | null; // DECIMAL
  declare qtd_fim: string | null; // DECIMAL
  declare vl_desconto: number;
}

RegraFaixa.init(
  {
    id_regra_faixa: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true, allowNull: false },
    id_regra: { type: DataTypes.BIGINT, allowNull: false },
    qtd_ini: { type: DataTypes.DECIMAL(10, 6), allowNull: true },
    qtd_fim: { type: DataTypes.DECIMAL(10, 6), allowNull: true },
    vl_desconto: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    sequelize,
    schema: 'core',
    tableName: 'tb_regra_faixa',
    timestamps: false,
  }
);


Regra.hasMany(RegraFaixa, { foreignKey: 'id_regra', as: 'faixas' });
RegraFaixa.belongsTo(Regra, { foreignKey: 'id_regra', as: 'regra' });