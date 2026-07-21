# Faz backup do banco SQLite (persistido no volume Docker) para
# ./backups/, com timestamp. Mantém os últimos 30 backups.
#
# Uso manual:  powershell -File scripts/backup-db.ps1
# Uso agendado: Agendador de Tarefas do Windows -> Ação:
#   powershell.exe -ExecutionPolicy Bypass -File "C:\Users\Usuario\Desktop\Financer V2\scripts\backup-db.ps1"

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$backupDir = Join-Path $root 'backups'
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$timestamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$destFile = Join-Path $backupDir "dev_$timestamp.db"

docker cp financerv2-server-1:/data/dev.db $destFile

if ($LASTEXITCODE -ne 0) {
    Write-Error "Falha ao copiar o banco do container. O container 'financerv2-server-1' está rodando?"
    exit 1
}

Write-Host "Backup salvo em $destFile"

# Mantém só os 30 backups mais recentes.
Get-ChildItem -Path $backupDir -Filter 'dev_*.db' |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip 30 |
    Remove-Item -Force
