# Score Admin

Monorepo do Monitoramento de Parceiros / Score Admin.

## Estrutura

```text
apps/api   API Node.js + TypeScript + Express + Sequelize
apps/web   Frontend Next.js
docker-compose.yml         ambiente local
docker-compose.server.yml  ambiente do servidor interno
ops/server                 deploy, restore, validação e backup do servidor
recovery/historico_jan_jun recuperação consolidada Jan-Jun/2026
```

## Desenvolvimento local com Docker

### 1. Configuração

```bash
cp .env.example .env
```

Crie o segredo de build para o pacote privado da API:

```bash
mkdir -p .secrets
printf '%s' 'SEU_TOKEN_GITHUB_PACKAGES' > .secrets/github_token
```

No Windows, crie o mesmo arquivo em:

```text
.secrets/github_token
```

O token não deve ser commitado.

### 2. Subir

```bash
docker compose build
```

```bash
docker compose up -d
```

O serviço `bootstrap` executa migrations e aplica o seed de regras apenas quando `core.tb_regra` está vazia.

Health da API:

```text
GET http://localhost:3000/api/v1/health
```

Frontend:

```text
http://localhost:3001
```

## Desenvolvimento local sem Docker

A API depende do pacote privado `@lewe-negocios/api-core`.

Copie `.npmrc.example` para `apps/api/.npmrc`, exporte `GITHUB_TOKEN` no seu terminal e então execute:

```bash
cd apps/api
npm install
npm run dev
```

Frontend:

```bash
cd apps/web
npm install
npm run dev
```

`apps/api/.npmrc` é ignorado pelo Git.

## Servidor interno

O servidor `192.168.1.115` possui configuração separada para não misturar requisitos de produção com o Compose local.

Procedimento completo:

```text
ops/server/README.md
```

A produção utiliza:

- rede Docker externa `score_admin_net` com subnet fixa `172.30.250.0/28`;
- volumes externos `score_pgdata` e `score_minio_data`;
- PostgreSQL em `192.168.1.115:5430`;
- API em `192.168.1.115:3002`;
- Web em `192.168.1.115:3001`;
- MinIO API em `192.168.1.115:9000`.

## Histórico do Power BI

Janeiro a junho de 2026 são preservados em tabelas históricas `core.tb_bi_*_historico`.

As views `core.vw_*` consolidam:

```text
Jan-Jun/2026  -> histórico recuperado
Jul/2026+     -> cálculo operacional normal
```

O histórico não deve ser recalculado.
