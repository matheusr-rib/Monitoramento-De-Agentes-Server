$ErrorActionPreference = "Stop"

function Assert-ExitCode {
    param([string]$Step)

    if ($LASTEXITCODE -ne 0) {
        throw "$Step falhou com exit code $LASTEXITCODE"
    }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$sqlFile = Join-Path $scriptDir "validar_historico.sql"

Set-Location $projectRoot

if (-not (Test-Path $sqlFile)) {
    throw "Script SQL nao encontrado: $sqlFile"
}

$dbContainer = (docker compose ps -q db).Trim()
Assert-ExitCode "Localizacao do container db"

if ([string]::IsNullOrWhiteSpace($dbContainer)) {
    throw "Container do PostgreSQL nao esta em execucao"
}

try {
    docker cp $sqlFile "${dbContainer}:/tmp/validar_historico.sql"
    Assert-ExitCode "Copia do script de validacao"

    docker exec -i $dbContainer sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /tmp/validar_historico.sql'
    Assert-ExitCode "Validacao do historico"
}
finally {
    docker exec $dbContainer sh -lc "rm -f /tmp/validar_historico.sql" | Out-Null
}
