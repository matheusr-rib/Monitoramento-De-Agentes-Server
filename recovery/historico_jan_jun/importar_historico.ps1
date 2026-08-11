$ErrorActionPreference = "Stop"

function Assert-ExitCode {
    param([string]$Step)

    if ($LASTEXITCODE -ne 0) {
        throw "$Step falhou com exit code $LASTEXITCODE"
    }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$csvDir = Join-Path $scriptDir "csv"
$sqlFile = Join-Path $scriptDir "importar_historico.sql"

Set-Location $projectRoot

if (-not (Test-Path ".\docker-compose.yml")) {
    throw "docker-compose.yml nao encontrado em $projectRoot"
}

$requiredFiles = @(
    "vw_score_resumo_periodo.csv",
    "vw_score_detalhe_descontos.csv",
    "vw_score_fraude_motivos.csv",
    "core_vw_score_detalhe_evento_item.csv"
)

foreach ($fileName in $requiredFiles) {
    $filePath = Join-Path $csvDir $fileName

    if (-not (Test-Path $filePath)) {
        throw "CSV obrigatorio nao encontrado: $filePath"
    }

    if ((Get-Item $filePath).Length -eq 0) {
        throw "CSV vazio: $filePath"
    }
}

if (-not (Test-Path $sqlFile)) {
    throw "Script SQL nao encontrado: $sqlFile"
}

$dbContainer = (docker compose ps -q db).Trim()
Assert-ExitCode "Localizacao do container db"

if ([string]::IsNullOrWhiteSpace($dbContainer)) {
    throw "Container do PostgreSQL nao esta em execucao"
}

$migrationCheck = @'
SELECT CASE
  WHEN to_regclass('core.tb_bi_score_resumo_historico') IS NOT NULL
  THEN 'OK'
  ELSE 'MISSING'
END;
'@ | docker compose exec -T db sh -lc 'psql -tA -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
Assert-ExitCode "Verificacao da migration"

if (($migrationCheck | Out-String).Trim() -ne "OK") {
    throw "Migration de historico ainda nao foi aplicada"
}

Write-Host "[historico] preparando arquivos no container $dbContainer"
docker exec $dbContainer sh -lc "rm -rf /tmp/score_historico && mkdir -p /tmp/score_historico"
Assert-ExitCode "Preparacao do diretorio temporario"

try {
    foreach ($fileName in $requiredFiles) {
        $source = Join-Path $csvDir $fileName
        docker cp $source "${dbContainer}:/tmp/score_historico/$fileName"
        Assert-ExitCode "Copia de $fileName"
    }

    docker cp $sqlFile "${dbContainer}:/tmp/score_historico/importar_historico.sql"
    Assert-ExitCode "Copia do script SQL"

    Write-Host "[historico] executando importacao transacional"
    docker exec -i $dbContainer sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /tmp/score_historico/importar_historico.sql'
    Assert-ExitCode "Importacao historica"

    Write-Host "[historico] importacao finalizada com sucesso"
}
finally {
    docker exec $dbContainer sh -lc "rm -rf /tmp/score_historico" | Out-Null
}
