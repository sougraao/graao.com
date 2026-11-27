# Envia os arquivos da Evolution API para a VPS e roda o instalador.
# Pode rodar de novo quando quiser: não apaga dados e não troca as chaves já geradas na VPS.
#
#   powershell -ExecutionPolicy Bypass -File deploy\evolution\enviar-vps.ps1 -Ip 1.2.3.4 -Dominio whatsapp.seudominio.com.br -Email voce@email.com
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^\d{1,3}(\.\d{1,3}){3}$')][string]$Ip,
  [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$')][string]$Dominio,
  [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')][string]$Email,
  [ValidatePattern('^[a-z_][a-z0-9_-]*$')][string]$Usuario = 'root',
  [ValidateRange(1, 65535)][int]$Porta = 22
)
# Continue: no PowerShell 5.1, qualquer linha no stderr do ssh viraria erro fatal com 'Stop'.
$ErrorActionPreference = 'Continue'

# Lista fechada: o .env e os backups deste PC nunca vão para a VPS.
$files = '.env.example', 'Caddyfile', 'docker-compose.yml', 'install.sh', 'maintenance.sh', 'guard-vps.sh', 'watchdog.sh', 'README.md'

foreach ($tool in 'ssh', 'scp') {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool não encontrado. Instale o Cliente OpenSSH em Configurações > Aplicativos > Recursos opcionais." }
}

$dns = @(Resolve-DnsName -Name $Dominio -Type A -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress } | ForEach-Object { $_.IPAddress })
if ($dns.Count -eq 0) {
  Write-Host "AVISO: $Dominio ainda não tem registro A. Aponte para $Ip no DNS; o HTTPS só funciona depois disso." -ForegroundColor Yellow
} elseif ($dns -notcontains $Ip) {
  Write-Host "AVISO: $Dominio aponta para $($dns -join ', '), e não para $Ip. Se usa Cloudflare, deixe a nuvem cinza (DNS only)." -ForegroundColor Yellow
}

# Cópia com fim de linha do Linux: o bash não lê um script com CRLF.
$stage = Join-Path ([System.IO.Path]::GetTempPath()) ("graao-evolution-" + [guid]::NewGuid().ToString('N'))
$folder = Join-Path $stage 'evolution'
New-Item -ItemType Directory -Force $folder | Out-Null
try {
  $utf8 = New-Object System.Text.UTF8Encoding $false
  foreach ($name in $files) {
    $source = Join-Path $PSScriptRoot $name
    if (-not (Test-Path -LiteralPath $source)) { throw "Falta o arquivo $name em $PSScriptRoot." }
    $text = [System.IO.File]::ReadAllText($source, $utf8).Replace("`r`n", "`n")
    [System.IO.File]::WriteAllText((Join-Path $folder $name), $text, $utf8)
  }

  $target = "$Usuario@$Ip"
  Write-Host "`n==> Enviando os arquivos para $target" -ForegroundColor Green
  # A pasta se chama "evolution": o scp junta com /opt/evolution em vez de criar uma dentro da outra.
  scp -P $Porta -o StrictHostKeyChecking=accept-new -r $folder "${target}:/opt/"
  if ($LASTEXITCODE -ne 0) { throw 'Falha no envio. Confira o IP, a senha e se a porta SSH está liberada no painel da Hostinger.' }
} finally {
  Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "`n==> Instalando na VPS (leva alguns minutos)" -ForegroundColor Green
$sudo = if ($Usuario -eq 'root') { '' } else { 'sudo ' }
ssh -t -p $Porta $target "cd /opt/evolution && ${sudo}bash install.sh $Dominio $Email"
if ($LASTEXITCODE -ne 0) { throw 'A instalação parou com erro. A mensagem acima diz o motivo; corrija e rode de novo.' }
