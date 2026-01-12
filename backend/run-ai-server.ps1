param(
    [string]$BindHost = "127.0.0.1",
    [int]$Port = 8000,
    [string]$LogPath = (Join-Path $env:LOCALAPPDATA "SideQuest\run-ai-server.log"),
    [switch]$Reload
)

$ErrorActionPreference = "Stop"

$modelPath = Join-Path $PSScriptRoot "model_name.txt"
if (Test-Path $modelPath) {
    $savedModel = (Get-Content -Path $modelPath -Raw).Trim()
    if ($savedModel) {
        $env:MODEL_NAME = $savedModel
    }
}
if (-not $env:OLLAMA_URL) { $env:OLLAMA_URL = "http://127.0.0.1:11434" }
if (-not $env:MODEL_NAME) { $env:MODEL_NAME = "qwen3:4b" }
if (-not $env:OLLAMA_TIMEOUT_SECONDS) { $env:OLLAMA_TIMEOUT_SECONDS = "900" }
if (-not $env:MODEL_FALLBACK) { $env:MODEL_FALLBACK = "qwen3:8b" }
if (-not $env:MODEL_CLERK) { $env:MODEL_CLERK = "qwen2.5:1.5b" }
if (-not $env:MODEL_CLERK_FALLBACK) { $env:MODEL_CLERK_FALLBACK = $env:MODEL_NAME }
if (-not $env:CLERK_LOG_PATH) { $env:CLERK_LOG_PATH = (Join-Path $env:LOCALAPPDATA "SideQuest\clerk.log") }
if (Test-Path $env:CLERK_LOG_PATH) { Clear-Content -Path $env:CLERK_LOG_PATH }
if (-not $env:CORS_ORIGINS) { $env:CORS_ORIGINS = "*" }
if (-not $env:GOOGLE_CLIENT_ID) { $env:GOOGLE_CLIENT_ID = "816546538702-6mrlsg51b2u6v6tdinc07fsnhbvmeqha.apps.googleusercontent.com" }
if (-not $env:POLYGON_RPC_URL) { $env:POLYGON_RPC_URL = "https://eth.llamarpc.com" }
if (-not $env:USDT_CONTRACT_ADDRESS) { $env:USDT_CONTRACT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7" }
if (-not $env:PAYMENT_WALLET_ADDRESS) { $env:PAYMENT_WALLET_ADDRESS = "0x062F50dD65caEC59AF85605a66f8287b22565F06" }
if (-not $env:PAYMENT_CONFIRMATIONS) { $env:PAYMENT_CONFIRMATIONS = "1" }
if (-not $env:PAYMENT_MAX_BLOCK_RANGE) { $env:PAYMENT_MAX_BLOCK_RANGE = "100" }
if (-not $env:STARTING_CREDITS) { $env:STARTING_CREDITS = "50" }

$logDir = Split-Path -Path $LogPath -Parent
if ($logDir -and -not (Test-Path $logDir)) {
    New-Item -Path $logDir -ItemType Directory -Force | Out-Null
}
if (-not (Test-Path $LogPath)) {
    New-Item -Path $LogPath -ItemType File -Force | Out-Null
}
if (-not (Test-Path $env:CLERK_LOG_PATH)) {
    $clerkDir = Split-Path -Path $env:CLERK_LOG_PATH -Parent
    if ($clerkDir -and -not (Test-Path $clerkDir)) {
        New-Item -Path $clerkDir -ItemType Directory -Force | Out-Null
    }
    New-Item -Path $env:CLERK_LOG_PATH -ItemType File -Force | Out-Null
}
try {
    Add-Content -Path $LogPath -Value ("[{0}] starting" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))
} catch {
    $fallback = Join-Path $logDir ("run-ai-server-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
    Add-Content -Path $fallback -Value ("[{0}] starting (fallback log)" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))
    $LogPath = $fallback
}

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

function Test-TcpPort {
    param(
        [string]$TargetHost,
        [int]$Port,
        [int]$TimeoutMs = 1000
    )
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $async = $client.BeginConnect($TargetHost, $Port, $null, $null)
        $ok = $async.AsyncWaitHandle.WaitOne($TimeoutMs)
        if (-not $ok) { return $false }
        $client.EndConnect($async)
        return $true
    } catch {
        return $false
    } finally {
        if ($client) { $client.Close() }
    }
}

$ollamaHost = ([Uri]$env:OLLAMA_URL).Host
$ollamaPort = ([Uri]$env:OLLAMA_URL).Port
if (-not (Test-TcpPort -TargetHost $ollamaHost -Port $ollamaPort -TimeoutMs 1000)) {
    $ollamaCmd = Get-Command ollama -ErrorAction SilentlyContinue
    if ($ollamaCmd) {
        Start-Process -FilePath $ollamaCmd.Source -ArgumentList "serve" -WindowStyle Hidden
        Start-Sleep -Seconds 2
    }
}
if (-not (Test-TcpPort -TargetHost $ollamaHost -Port $ollamaPort -TimeoutMs 1000)) {
    Add-Content -Path $LogPath -Value ("[{0}] WARNING: Ollama not reachable at {1}:{2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $ollamaHost, $ollamaPort)
}

$venvActivate = Join-Path $PSScriptRoot "venv\Scripts\Activate.ps1"
if (Test-Path $venvActivate) {
    . $venvActivate
}

$env:PYTHONUNBUFFERED = "1"

$uvicornArgs = @("main:app", "--host", $BindHost, "--port", $Port, "--log-level", "info")
if ($Reload) {
    $uvicornArgs += "--reload"
}

$pythonArgs = @("-u", "-m", "uvicorn") + $uvicornArgs
$argString = ($pythonArgs | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }) -join ' '

$stdoutPath = $LogPath
$stderrPath = ($LogPath + ".err")

if (-not (Test-Path $stdoutPath)) { New-Item -Path $stdoutPath -ItemType File -Force | Out-Null }
if (-not (Test-Path $stderrPath)) { New-Item -Path $stderrPath -ItemType File -Force | Out-Null }

$pythonPath = "python"
$venvPython = Join-Path $PSScriptRoot "venv\Scripts\python.exe"
if (Test-Path $venvPython) {
    $pythonPath = $venvPython
} else {
    $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCmd) { $pythonPath = $pythonCmd.Source }
}

Add-Content -Path $stdoutPath -Value ("[{0}] logging to {1} and {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $stdoutPath, $stderrPath)
Add-Content -Path $stdoutPath -Value ("[{0}] starting {1} {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $pythonPath, $argString)

try {
    $proc = Start-Process -FilePath $pythonPath -ArgumentList $argString -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
    if ($proc) {
        Wait-Process -Id $proc.Id
    }
} catch {
    Add-Content -Path $stderrPath -Value ("[{0}] Start-Process failed: {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $_.Exception.Message)
    throw
}
