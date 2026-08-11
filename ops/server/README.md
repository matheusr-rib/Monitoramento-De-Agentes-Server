# Deploy do Score Admin no srv-teste

Este diretório contém o procedimento de produção para o servidor interno `192.168.1.115`.

## Arquitetura fixa

- Frontend: `http://192.168.1.115:3001`
- API: `http://192.168.1.115:3002`
- PostgreSQL para Power BI: `192.168.1.115:5430`
- MinIO API para upload do navegador: `http://192.168.1.115:9000`
- MinIO Console: `127.0.0.1:9001`
- Rede Docker externa: `score_admin_net` / `172.30.250.0/28`
- Volumes externos: `score_pgdata` e `score_minio_data`

A rede e os volumes são criados fora do ciclo de vida do Compose. O Compose de servidor apenas os utiliza.

## 1. Antes do deploy

O token que já esteve em `apps/api/.npmrc` deve ser revogado no GitHub. O arquivo foi removido do projeto atual, mas a remoção não apaga um token que já tenha existido no histórico Git.

Crie a configuração de servidor:

```bash
cp .env.server.example .env.server
nano .env.server
```

Preencha, no mínimo:

- `PGPASSWORD`
- `ADMIN_TOKEN`
- `CLICKSIGN_ACCESS_TOKEN`, se a sincronização Clicksign for usada
- `WORKBANK_API_URL`
- `MINIO_ROOT_USER`
- `MINIO_ROOT_PASSWORD`

Não altere os valores de rede/portas definidos para este servidor sem refazer o preflight.

Crie o segredo usado somente durante o build da API:

```bash
mkdir -p .secrets
chmod 700 .secrets
printf '%s' 'SEU_NOVO_TOKEN_GITHUB_PACKAGES' > .secrets/github_token
chmod 600 .secrets/github_token
```

O token precisa conseguir ler o pacote privado `@lewe-negocios/api-core`.

## 2. Preflight sem alteração do servidor

```bash
./ops/server/preflight.sh
```

O script confirma:

- IP `192.168.1.115` presente;
- subnet `172.30.250.0/28` sem conflito com rotas e redes Docker existentes;
- portas `3001`, `3002`, `5430`, `9000` e `9001` livres.

Não prossiga se houver erro.

## 3. Criar infraestrutura persistente

```bash
./ops/server/prepare-infra.sh
```

Esse comando cria, se ainda não existirem:

```text
score_admin_net   172.30.250.0/28
score_pgdata
score_minio_data
```

São recursos `external` no `docker-compose.server.yml`; `docker compose down -v` não remove recursos externos.

## 4. Restaurar o histórico Jan-Jun

O arquivo esperado é:

```text
recovery/historico_jan_jun/backups/score_monitoramento_com_historico_20260723_144345.dump
```

SHA256 esperado:

```text
272E66603C5AA1EBB4BCEAFDDAF29040561F0A395912E1EE5E29E07AACFF4461
```

Execute:

```bash
./ops/server/restore-history.sh
```

O script:

1. valida o SHA256;
2. sobe somente o PostgreSQL;
3. recusa restaurar se o banco já possuir o schema `core` ou `SequelizeMeta`;
4. restaura o dump;
5. executa `validate-history.sh`.

A base restaurada deve terminar com:

```text
resumo histórico       167547
detalhe histórico      310210
fraude/alerta histórico    43
evento/item histórico  310210
períodos históricos         6
```

## 5. Subir aplicação

Depois do histórico validado:

```bash
docker compose --env-file .env.server -f docker-compose.server.yml build bootstrap api web
```

```bash
docker compose --env-file .env.server -f docker-compose.server.yml up -d
```

Confira:

```bash
docker compose --env-file .env.server -f docker-compose.server.yml ps
```

```bash
docker compose --env-file .env.server -f docker-compose.server.yml logs bootstrap
```

```bash
curl http://192.168.1.115:3002/api/v1/health
```

Resposta esperada:

```json
{"status":"ok"}
```

Abra no navegador da rede interna:

```text
http://192.168.1.115:3001
```

## 6. Carregar dados operacionais

Os arquivos dos loaders podem conter meses anteriores. A procedure de score filtra os eventos pelo período calculado.

Ordem operacional recomendada:

1. Agentes completo;
2. Esteira que deve valer para julho;
3. Convênio/Prazo que deve valer para julho;
4. Pós-venda;
5. Fraude/Alerta;
6. Nuvídeo;
7. Autorregulação;
8. Clicksign/documentação.

### Atenção: Esteira

O loader de Esteira executa `TRUNCATE` e mantém uma fotografia atual. Não existe histórico mensal nessa tabela. Para calcular julho, a fotografia carregada precisa representar a esteira que deve ser aplicada ao score de julho.

### Atenção: Convênio/Prazo e Autorregulação

A Autorregulação é classificada no carregamento usando o conteúdo vigente de `tb_convenio_prazo`. Carregue Convênio/Prazo antes da Autorregulação e use a configuração que deve valer para julho.

### Atenção: documentação Clicksign

A procedure atual considera documentação no intervalo do próprio período. Antes do cálculo de julho, confirme a regra de negócio desejada para contratos assinados antes de julho. Essa regra não foi alterada pelo patch de servidor.

## 7. Calcular somente julho/2026

A tela de score foi corrigida para sempre calcular competência mensal fechada.

Selecione:

```text
Julho / 2026
```

O período enviado será exatamente:

```text
2026-07-01 a 2026-07-31
```

Não recalcule janeiro a junho.

## 8. Validar antes do Power BI

Depois do score de julho:

```bash
./ops/server/validate-score-july.sh
```

O script recusa o estado se:

- as contagens históricas Jan-Jun mudaram;
- julho não possui exatamente um período;
- julho não é `01/07/2026` a `31/07/2026`;
- houver mais de uma linha de resumo por agente em julho.

## 9. Backup após julho

```bash
./ops/server/backup-db.sh
```

Por padrão o dump é salvo em:

```text
/home/dev/backups/score-admin
```

O script também gera um `.sha256` ao lado do dump.

Esse diretório está fora do volume Docker, mas ainda está no mesmo servidor. Para disaster recovery real, copie os dumps para outro equipamento/NAS/armazenamento corporativo.

## 10. Power BI

Somente depois de `validate-score-july.sh` e do backup novo:

Troque a fonte PostgreSQL do Power BI de:

```text
localhost:5430
```

para:

```text
192.168.1.115:5430
```

Banco:

```text
score_monitoramento
```

Mantenha modo `Importar` e as mesmas cinco views `core.vw_*`.

As views retornam:

- janeiro a junho: tabelas históricas recuperadas e protegidas;
- julho em diante: tabelas operacionais calculadas no servidor.

## Comandos de rotina

Status:

```bash
docker compose --env-file .env.server -f docker-compose.server.yml ps
```

Logs da API:

```bash
docker compose --env-file .env.server -f docker-compose.server.yml logs --tail 200 api
```

Parar containers sem tocar nos dados:

```bash
docker compose --env-file .env.server -f docker-compose.server.yml down
```

Subir novamente:

```bash
docker compose --env-file .env.server -f docker-compose.server.yml up -d
```

Os volumes e a rede são externos ao Compose e permanecem existentes.

## Limitação de autenticação já existente

O frontend usa `NEXT_PUBLIC_ADMIN_TOKEN`, portanto esse token é entregue ao navegador e pode ser inspecionado por qualquer usuário que tenha acesso à aplicação. Isso já faz parte da arquitetura atual e não foi ampliado neste patch. Como o deploy é restrito à LAN, mantivemos compatibilidade. Se a aplicação passar a exigir autenticação por usuário, auditoria individual ou exposição fora da rede interna, esse mecanismo deve ser substituído por autenticação server-side.
