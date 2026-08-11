# Manifesto do patch de servidor

Base analisada: projeto `score-admin` no commit `0d4526f774345c5c2a0afa568580b1876a9735cc`.

## Arquivos alterados

- `.env.example`
- `.gitignore`
- `.npmrc.example`
- `README.md`
- `docker-compose.yml`
- `apps/api/Dockerfile`
- `apps/api/src/index.ts`
- `apps/api/src/migrations/20260723170000-create-bi-historical-recovery.ts`
- `apps/web/Dockerfile`
- `apps/web/src/app/(app)/operacoes/score/page.tsx`

## Arquivo removido

- `apps/api/.npmrc`

O arquivo continha credencial. O token antigo deve ser revogado porque a remoção do arquivo atual não limpa o histórico Git.

## Arquivos novos

- `.env.server.example`
- `docker-compose.server.yml`
- `apps/api/.dockerignore`
- `apps/web/.dockerignore`
- `ops/server/README.md`
- `ops/server/preflight.sh`
- `ops/server/prepare-infra.sh`
- `ops/server/restore-history.sh`
- `ops/server/validate-history.sh`
- `ops/server/validate-score-july.sh`
- `ops/server/backup-db.sh`

## Arquivos de recuperação que passam a ser versionáveis

- `recovery/historico_jan_jun/importar_historico.sql`
- `recovery/historico_jan_jun/validar_historico.sql`

## Artefato histórico usado no deploy

- `recovery/historico_jan_jun/backups/score_monitoramento_com_historico_20260723_144345.dump`
- SHA256: `272E66603C5AA1EBB4BCEAFDDAF29040561F0A395912E1EE5E29E07AACFF4461`

O dump não deve ser commitado no Git. Ele é incluído apenas no bundle completo de implantação.

## Mudanças funcionais

1. Compose de servidor separado do ambiente local.
2. Rede Docker externa fixa `172.30.250.0/28`.
3. Volumes PostgreSQL/MinIO externos ao ciclo de vida do Compose.
4. Portas de servidor fixadas em `192.168.1.115` sem usar `0.0.0.0`.
5. API em `3002`, pois `3000` já está ocupada no servidor.
6. CORS da API configurável por `CORS_ORIGINS`.
7. CORS do MinIO configurado por `MINIO_API_CORS_ALLOW_ORIGIN` sem reinício administrativo durante init.
8. GitHub Packages passa a usar BuildKit secret em vez de ARG/token em layer.
9. Frontend deixa de receber GitHub token, pois não possui dependência privada.
10. Migration histórica passa a funcionar em banco realmente novo removendo a consulta a tabelas ainda inexistentes.
11. Tela de score sempre fecha a competência no último dia do mês, evitando períodos parciais duplicados.
12. Scripts de restore/validação/backup mantêm o histórico Jan-Jun verificável antes do Power BI.

## Validacoes executadas nesta entrega

- `npm run build` da API: aprovado.
- `tsc --noEmit` do frontend: aprovado.
- `bash -n` em todos os scripts `ops/server/*.sh`: aprovado.
- Parse YAML de `docker-compose.yml` e `docker-compose.server.yml`: aprovado.
- Verificacao de que o guard invalido foi removido do `up` da migration historica: aprovado.
- SHA256 do dump historico incluído: aprovado e igual ao registro original.
- Varredura do bundle por token GitHub literal: nenhuma credencial encontrada.

O build completo do Next.js nao foi concluido neste ambiente de montagem porque o runtime nao possui acesso de rede e o Next tentou baixar o binario SWC Linux. O typecheck do frontend passou. O servidor fará o `npm install` dentro da imagem Linux durante o build, onde o pacote opcional Linux está previsto no `package-lock.json`.

Este ambiente de montagem nao possui Docker Engine, portanto a execucao real de `docker compose config/build/up` deve ser feita no `srv-teste` seguindo `ops/server/README.md`.
