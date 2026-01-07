param(
    [string]$BindHost = "127.0.0.1",
    [int]$Port = 8000
)

$ErrorActionPreference = "Stop"

if (-not $env:OLLAMA_URL) { $env:OLLAMA_URL = "http://127.0.0.1:11434" }
if (-not $env:MODEL_NAME) { $env:MODEL_NAME = "qwen3:8b" }
if (-not $env:CORS_ORIGINS) { $env:CORS_ORIGINS = "*" }
if (-not $env:POLYGON_RPC_URL) { $env:POLYGON_RPC_URL = "https://eth.llamarpc.com" }
if (-not $env:USDT_CONTRACT_ADDRESS) { $env:USDT_CONTRACT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7" }
if (-not $env:PAYMENT_WALLET_ADDRESS) { $env:PAYMENT_WALLET_ADDRESS = "0x062F50dD65caEC59AF85605a66f8287b22565F06" }
if (-not $env:PAYMENT_CONFIRMATIONS) { $env:PAYMENT_CONFIRMATIONS = "1" }
if (-not $env:PAYMENT_MAX_BLOCK_RANGE) { $env:PAYMENT_MAX_BLOCK_RANGE = "100" }
if (-not $env:STARTING_CREDITS) { $env:STARTING_CREDITS = "25" }

$cloudflaredConfigPath = Join-Path $env:USERPROFILE ".cloudflared\config.yml"
$tunnelName = $env:CLOUDFLARE_TUNNEL_NAME
$tunnelHostname = $env:CLOUDFLARE_TUNNEL_HOSTNAME
if ((-not $tunnelName -or -not $tunnelHostname) -and (Test-Path $cloudflaredConfigPath)) {
    $configText = Get-Content -Path $cloudflaredConfigPath -Raw
    if (-not $tunnelName) {
        $match = [regex]::Match($configText, "(?m)^\s*tunnel:\s*(\S+)")
        if ($match.Success) { $tunnelName = $match.Groups[1].Value }
    }
    if (-not $tunnelHostname) {
        $match = [regex]::Match($configText, "(?m)^\s*-\s*hostname:\s*(\S+)")
        if ($match.Success) { $tunnelHostname = $match.Groups[1].Value }
    }
}
if (-not $tunnelName) { $tunnelName = "sidequestai" }
if (-not $tunnelHostname) { $tunnelHostname = "sidequestai.org" }

$gistIdPath = Join-Path $PSScriptRoot "gist_id.txt"
$gistTokenPath = Join-Path $PSScriptRoot "gist_token.txt"
if (-not $env:GITHUB_GIST_ID -and (Test-Path $gistIdPath)) {
    $env:GITHUB_GIST_ID = (Get-Content -Path $gistIdPath -Raw).Trim()
}
if (-not $env:GITHUB_TOKEN -and (Test-Path $gistTokenPath)) {
    $env:GITHUB_TOKEN = (Get-Content -Path $gistTokenPath -Raw).Trim()
}

$cloudflaredPath = $null
$repoCloudflaredPath = Join-Path $PSScriptRoot "..\cloudflared.exe"
if (Test-Path $repoCloudflaredPath) {
    $cloudflaredPath = (Resolve-Path $repoCloudflaredPath).Path
} else {
    $downloadCloudflaredPath = Join-Path $env:USERPROFILE "Downloads\cloudflared-windows-amd64.exe"
    if (Test-Path $downloadCloudflaredPath) {
        $cloudflaredPath = $downloadCloudflaredPath
    } else {
        $cloudflaredCmd = Get-Command cloudflared -ErrorAction SilentlyContinue
        if ($cloudflaredCmd) { $cloudflaredPath = $cloudflaredCmd.Source }
    }
}

if ($cloudflaredPath) {
    $rootPath = $PSScriptRoot
    $gistId = $env:GITHUB_GIST_ID
    $gistToken = $env:GITHUB_TOKEN
    $existingJob = Get-Job -Name "cloudflared-keepalive" -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Running" }
    if (-not $existingJob) {
        Start-Job -Name "cloudflared-keepalive" -ScriptBlock {
        param($cloudflaredPath, $port, $rootPath, $gistId, $gistToken, $cloudflaredConfigPath, $tunnelName, $tunnelHostname)
        while ($true) {
            $logPath = Join-Path $rootPath "cloudflared.log"
            $errPath = Join-Path $rootPath "cloudflared.err.log"
            $useNamedTunnel = $false
            if ($tunnelName -and $tunnelHostname -and (Test-Path $cloudflaredConfigPath)) {
                $useNamedTunnel = $true
            }
            if ($useNamedTunnel) {
                $args = @("tunnel", "run", $tunnelName, "--config", $cloudflaredConfigPath)
            } else {
                $args = @("tunnel", "--url", "http://127.0.0.1:$port")
            }
            $proc = Start-Process -FilePath $cloudflaredPath -ArgumentList $args -WindowStyle Hidden -RedirectStandardOutput $logPath -RedirectStandardError $errPath -PassThru
            $publicUrl = $null
            if ($useNamedTunnel) {
                $publicUrl = "https://$tunnelHostname"
            } else {
                $deadline = (Get-Date).AddSeconds(30)
                while (-not $publicUrl -and (Get-Date) -lt $deadline) {
                    $paths = @()
                    if (Test-Path $logPath) { $paths += $logPath }
                    if (Test-Path $errPath) { $paths += $errPath }
                    if ($paths.Count -gt 0) {
                        $match = Select-String -Path $paths -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" -AllMatches |
                            Select-Object -First 1
                        if ($match) { $publicUrl = $match.Matches[0].Value }
                    }
                    if (-not $publicUrl) {
                        Start-Sleep -Milliseconds 500
                    }
                }
            }
            if ($publicUrl) {
                $configPath = Join-Path $rootPath "public_url.json"
                @{ url = $publicUrl } | ConvertTo-Json | Set-Content -Path $configPath
                if ($gistId -and $gistToken) {
                    $body = @{
                        files = @{
                            "config.json" = @{
                                content = (@{ url = $publicUrl } | ConvertTo-Json)
                            }
                        }
                    } | ConvertTo-Json
                    $headers = @{
                        Authorization = "Bearer $gistToken"
                        "User-Agent" = "side-quest"
                    }
                    try {
                        Invoke-RestMethod -Method Patch -Uri "https://api.github.com/gists/$gistId" -Headers $headers -Body $body
                    } catch {
                        $null = $null
                    }
                }
            }
            if ($proc) {
                Wait-Process -Id $proc.Id
            }
            Start-Sleep -Seconds 2
        }
        } -ArgumentList $cloudflaredPath, $Port, $rootPath, $gistId, $gistToken, $cloudflaredConfigPath, $tunnelName, $tunnelHostname | Out-Null
    }
}

$ollamaHost = ([Uri]$env:OLLAMA_URL).Host
$ollamaPort = ([Uri]$env:OLLAMA_URL).Port
try {
    $null = Test-NetConnection -ComputerName $ollamaHost -Port $ollamaPort -InformationLevel Quiet
} catch {
    $null = $null
}
if (-not (Test-NetConnection -ComputerName $ollamaHost -Port $ollamaPort -InformationLevel Quiet)) {
    Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep -Seconds 2
}

$venvActivate = Join-Path $PSScriptRoot "venv\Scripts\Activate.ps1"
if (Test-Path $venvActivate) {
    . $venvActivate
}

python -m uvicorn main:app --host $BindHost --port $Port --reload

