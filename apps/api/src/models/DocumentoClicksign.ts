import { DataTypes, Model, InferAttributes, InferCreationAttributes } from 'sequelize';
import { sequelize } from '@/db/sequelize';
import { Agente } from '@/models/Agente';

export class DocumentoClicksign extends Model<
  InferAttributes<DocumentoClicksign>,
  InferCreationAttributes<DocumentoClicksign>
> {
  declare id_documento: number;
  declare clicksign_document_key: string; // UUID
  declare filename: string | null;

  declare cpf_extraido: string | null;
  declare cnpj_extraido: string | null;

  declare cd_agente: number | null;

  declare status: string | null;
  declare folder_id: string | null;

  declare uploaded_at: Date | null;
  declare updated_at: Date | null;
  declare finished_at: Date | null;
  declare deadline_at: Date | null;

  declare dt_assinatura: Date | null;
  declare dt_carga: Date;

  declare last_list_seen_at: Date | null;
  declare raw_payload: object | null;
}

DocumentoClicksign.init(
  {
    id_documento: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true, allowNull: false },
    clicksign_document_key: { type: DataTypes.UUID, allowNull: false, unique: true },
    filename: { type: DataTypes.TEXT, allowNull: true },

    cpf_extraido: { type: DataTypes.STRING(11), allowNull: true },
    cnpj_extraido: { type: DataTypes.STRING(14), allowNull: true },

    cd_agente: { type: DataTypes.BIGINT, allowNull: true },

    status: { type: DataTypes.TEXT, allowNull: true },
    folder_id: { type: DataTypes.TEXT, allowNull: true },

    uploaded_at: { type: DataTypes.DATE, allowNull: true },
    updated_at: { type: DataTypes.DATE, allowNull: true },
    finished_at: { type: DataTypes.DATE, allowNull: true },
    deadline_at: { type: DataTypes.DATE, allowNull: true },

    dt_assinatura: { type: DataTypes.DATE, allowNull: true },
    dt_carga: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('now()') },

    last_list_seen_at: { type: DataTypes.DATE, allowNull: true },
    raw_payload: { type: DataTypes.JSONB, allowNull: true },
  },
  {
    sequelize,
    schema: 'core',
    tableName: 'tb_documento_clicksign',
    timestamps: false,
  }
);

// associações
Agente.hasMany(DocumentoClicksign, { foreignKey: 'cd_agente', as: 'documentos' });
DocumentoClicksign.belongsTo(Agente, { foreignKey: 'cd_agente', as: 'agente' });