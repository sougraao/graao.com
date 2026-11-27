# Sobe a Evolution API no Docker Desktop deste PC e publica pelo Tailscale Funnel.
# Pode rodar de novo quando quiser: não apaga dados e não troca as chaves já geradas.
#
#   powershell -ExecutionPolicy Bypass -File deploy\evolution\start-pc.ps1
# Continue: no PowerShell 5.1, qualquer linha no stderr do docker viraria erro fatal com 'Stop'.
# Cada passo confere $LASTEXITCODE e para com throw quando precisa.
$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath $PSScriptRoot

function Say($msg) { Write-Host "`n==> $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "AVISO: $msg" -ForegroundColor Yellow }
function New-Secret([int]$bytes) {
  $buf = New-Object byte[] $bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buf)
  -join ($buf | ForEach-Object { $_.ToString('x2') })
}
function Set-EnvLine($lines, $key, $value) {
  $found = $false
  $out = foreach ($line in $lines) {
    if ($line -match "^$key=") { $found = $true; "$key=$value" } else { $line }
  }
  if (-not $found) { $out += "$key=$value" }
  return ,$out
}

Say 'Conferindo o Docker'
$docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $docker) {
  # Terminal aberto antes da instalação ainda não tem o PATH novo do Docker.
  foreach ($bin in 'D:\Docker\Desktop\resources\bin', 'C:\Program Files\Docker\Docker\resources\bin') {
    if (Test-Path (Join-Path $bin 'docker.exe')) { $env:Path = "$bin;$env:Path"; break }
  }
  $docker = Get-Command docker -ErrorAction SilentlyContinue
}
if (-not $docker) { throw 'Docker não encontrado. Abra o Docker Desktop (ou reinicie o PC depois de instalar) e rode de novo.' }
docker info --format '{{.ServerVersion}}' *> $null
if ($LASTEXITCODE -ne 0) {
  $virt = (Get-CimInstance Win32_Processor).VirtualizationFirmwareEnabled -or (Get-CimInstance Win32_ComputerSystem).HypervisorPresent
  if (-not $virt) { throw 'A virtualização está desligada na BIOS (SVM no AMD, VT-x na Intel). Ligue-a, reinicie e rode de novo.' }
  throw 'O motor do Docker Desktop não está rodando. Abra o Docker Desktop, espere ficar verde e rode de novo.'
}

Say 'Conferindo o Tailscale'
$ts = Get-Command tailscale -ErrorAction SilentlyContinue
if (-not $ts) { $ts = Get-Item 'C:\Program Files\Tailscale\tailscale.exe' -ErrorAction SilentlyContinue }
if (-not $ts) { throw 'Tailscale não encontrado. Instale e entre na sua conta antes.' }
$tsExe = if ($ts.Source) { $ts.Source } else { $ts.FullName }
$status = & $tsExe status --json | ConvertFrom-Json
if ($status.BackendState -ne 'Running') { throw 'O Tailscale não está conectado. Abra o Tailscale, entre na conta e rode de novo.' }
$domain = $status.Self.DNSName.TrimEnd('.')
Write-Host "Endereço público: https://$domain"

Say 'Configuração (.env)'
if (-not (Test-Path .env)) {
  $lines = Get-Content .env.example
  $lines = Set-EnvLine $lines 'AUTHENTICATION_API_KEY' (New-Secret 32)
  $lines = Set-EnvLine $lines 'POSTGRES_PASSWORD' (New-Secret 24)
  Write-Host '.env criado com chaves novas'
} else {
  $lines = Get-Content .env
}
$lines = Set-EnvLine $lines 'DOMAIN' $domain
$lines = Set-EnvLine $lines 'ACME_EMAIL' 'nao-usado@modo-pc.local'
# Arquivo em UTF-8 sem BOM e com LF: o Docker lê o .env como Linux.
[System.IO.File]::WriteAllText((Join-Path $PSScriptRoot '.env'), (($lines -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding $false))
New-Item -ItemType Directory -Force backups | Out-Null

Say 'Subindo a Evolution API'
$compose = @('compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.pc.yml')
docker @compose pull
if ($LASTEXITCODE -ne 0) { throw 'Falha ao baixar as imagens.' }
docker @compose up -d --remove-orphans
if ($LASTEXITCODE -ne 0) { throw 'Falha ao subir os containers.' }

Write-Host -NoNewline 'Aguardando a API ficar saudável'
$state = 'starting'
for ($i = 0; $i -lt 60; $i++) {
  $id = docker @compose ps -q evolution
  if ($id) { $state = docker inspect -f '{{.State.Health.Status}}' $id 2>$null }
  if ($state -eq 'healthy') { break }
  Write-Host -NoNewline '.'; Start-Sleep -Seconds 5
}
Write-Host ''
if ($state -ne 'healthy') { Warn 'a Evolution ainda não está saudável. Veja: docker compose logs --tail 100 evolution' }

Say 'Publicando com o Tailscale Funnel'
& $tsExe funnel --bg 8080
if ($LASTEXITCODE -ne 0) { Warn 'o Funnel não foi ativado. Se aparecer um link acima, abra-o para liberar HTTPS e Funnel na sua conta e rode de novo.' }

$key = (Get-Content .env | Where-Object { $_ -match '^AUTHENTICATION_API_KEY=' }) -replace '^AUTHENTICATION_API_KEY=', ''
Say 'Pronto!'
Write-Host @"

  URL da Evolution:   https://$domain
  Painel (manager):   https://$domain/manager
  API Key global:     $key

  Na Vercel (projeto graao.app), em Settings -> Environment Variables:
    EVOLUTION_BASE_URL = https://$domain
    EVOLUTION_API_KEY  = $key
  Depois faça um novo deploy. Guarde a chave num cofre de senhas.
"@
