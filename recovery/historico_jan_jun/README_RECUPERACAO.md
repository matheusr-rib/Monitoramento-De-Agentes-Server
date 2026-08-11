# Recuperacao do historico do Power BI - janeiro a junho de 2026

## Objetivo

Preservar os resultados consolidados de janeiro a junho de 2026 e unir esses dados aos scores calculados no banco novo a partir de julho de 2026.

## Regra de corte

- Historico recuperado: 2026-01-01 ate 2026-06-30.
- Banco operacional novo: a partir de 2026-07-01.
- IDs historicos de score sao gravados como negativos para nao colidir com os novos IDs positivos.
- Janeiro a junho nao sao recalculados.

## Arquivos

- `apps/api/src/migrations/20260723170000-create-bi-historical-recovery.ts`
  - cria quatro tabelas historicas;
  - protege UPDATE e DELETE;
  - recria as cinco views do Power BI unindo historico e dados atuais.
- `recovery/historico_jan_jun/importar_historico.sql`
  - importa os quatro CSVs necessarios em uma unica transacao;
  - bloqueia uma segunda importacao se qualquer tabela historica ja possuir dados;
  - valida contagens, periodos, formulas e colisoes.
- `recovery/historico_jan_jun/importar_historico.ps1`
  - copia os CSVs para o container PostgreSQL e executa a importacao.
- `recovery/historico_jan_jun/validar_historico.sql`
  - consultas de auditoria.
- `recovery/historico_jan_jun/validar_historico.ps1`
  - executa as consultas de auditoria.

## Pasta de CSVs esperada

Os arquivos ja extraidos devem permanecer em:

`recovery/historico_jan_jun/csv`

Arquivos obrigatorios:

- `vw_score_resumo_periodo.csv`
- `vw_score_detalhe_descontos.csv`
- `vw_score_fraude_motivos.csv`
- `core_vw_score_detalhe_evento_item.csv`

O arquivo `vw_dim_periodo_score.csv` e mantido como evidencia, mas nao precisa ser importado. A dimensao de periodo e reconstruida pelas views.

## Ordem de execucao

1. Extrair o patch na raiz do projeto.
2. Conferir `git diff`.
3. Recriar apenas a imagem de bootstrap.
4. Executar o bootstrap para aplicar a nova migration.
5. Confirmar a migration no `SequelizeMeta`.
6. Executar `importar_historico.ps1`.
7. Executar `validar_historico.ps1`.
8. Nao atualizar o Power BI antes da validacao final.

## Contagens historicas esperadas

- resumo: 167547
- detalhe de descontos: 310210
- motivos de alerta: 43
- evento item: 310210
- periodos: 6

## Protecoes destrutivas

- UPDATE e DELETE sao bloqueados por triggers.
- TRUNCATE e bloqueado por uma migration adicional.
- O importador nao limpa nem substitui historico existente.
- Rollback das migrations de recuperacao e bloqueado quando houver dados historicos.
