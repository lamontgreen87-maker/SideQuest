param(
    [string]$LogPath = (Join-Path $env:LOCALAPPDATA "SideQuest\run-ai-server.log"),
    [string]$ErrLogPath = (Join-Path $env:LOCALAPPDATA "SideQuest\run-ai-server.log.err"),
    [string[]]$PingTargets = @("http://127.0.0.1:8000", "http://127.0.0.1:11434"),
    [int]$TailLines = 400,
    [int]$RefreshMs = 1000
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = "SideQuest AI Server HUD"
$form.StartPosition = "CenterScreen"
$form.Size = New-Object System.Drawing.Size(900, 600)
$form.MinimumSize = New-Object System.Drawing.Size(700, 450)

$pathLabel = New-Object System.Windows.Forms.Label
$pathLabel.Text = "Log: $LogPath"
$pathLabel.AutoSize = $true
$pathLabel.Location = New-Object System.Drawing.Point(12, 12)

$copyButton = New-Object System.Windows.Forms.Button
$copyButton.Text = "Copy log to clipboard"
$copyButton.AutoSize = $true
$copyButton.Location = New-Object System.Drawing.Point(12, 36)

$copyErrButton = New-Object System.Windows.Forms.Button
$copyErrButton.Text = "Copy errors to clipboard"
$copyErrButton.AutoSize = $true
$copyErrButton.Location = New-Object System.Drawing.Point(170, 36)

$pingButton = New-Object System.Windows.Forms.Button
$pingButton.Text = "Ping servers"
$pingButton.AutoSize = $true
$pingButton.Location = New-Object System.Drawing.Point(360, 36)

$restartButton = New-Object System.Windows.Forms.Button
$restartButton.Text = "Restart AI server"
$restartButton.AutoSize = $true
$restartButton.Location = New-Object System.Drawing.Point(470, 36)

$toggleErrors = New-Object System.Windows.Forms.CheckBox
$toggleErrors.Text = "Show errors"
$toggleErrors.AutoSize = $true
$toggleErrors.Location = New-Object System.Drawing.Point(610, 40)

$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.AutoSize = $true
$statusLabel.ForeColor = [System.Drawing.Color]::DimGray
$statusLabel.Location = New-Object System.Drawing.Point(12, 68)

$textBox = New-Object System.Windows.Forms.TextBox
$textBox.Multiline = $true
$textBox.ReadOnly = $true
$textBox.ScrollBars = "Vertical"
$textBox.Font = New-Object System.Drawing.Font("Consolas", 10)
$textBox.Location = New-Object System.Drawing.Point(12, 92)
$textBox.Size = New-Object System.Drawing.Size(860, 455)
$textBox.Anchor = "Top,Bottom,Left,Right"

$form.Controls.AddRange(@($pathLabel, $copyButton, $copyErrButton, $pingButton, $restartButton, $toggleErrors, $statusLabel, $textBox))

$lastWriteTime = [DateTime]::MinValue

function Get-LogText {
    param($Path, $Tail)
    if (-not (Test-Path $Path)) {
        return "Log file not found: $Path"
    }
    try {
        $content = Get-Content -Path $Path -Tail $Tail -ErrorAction Stop
        return ($content -join [Environment]::NewLine)
    } catch {
        return "Failed to read log: $($_.Exception.Message)"
    }
}

function Ping-Targets {
    param([string[]]$Targets)
    $results = @()
    foreach ($target in $Targets) {
        try {
            $response = Invoke-WebRequest -Uri $target -Method Get -TimeoutSec 2 -UseBasicParsing
            $results += "{0} OK ({1})" -f $target, $response.StatusCode
        } catch {
            $results += "{0} FAIL ({1})" -f $target, $_.Exception.Message
        }
    }
    return $results
}

function Restart-Server {
    $scriptPath = Join-Path $PSScriptRoot "run-ai-server.ps1"
    if (-not (Test-Path $scriptPath)) {
        return "Server script not found: $scriptPath"
    }
    try {
        $connections = Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue
        foreach ($conn in $connections) {
            if ($conn.OwningProcess) {
                Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
            }
        }
        Start-Sleep -Milliseconds 500
        Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`"" -WindowStyle Hidden | Out-Null
        return "Restarted at $(Get-Date -Format 'HH:mm:ss')"
    } catch {
        return "Restart failed: $($_.Exception.Message)"
    }
}

$copyButton.Add_Click({
    if (Test-Path $LogPath) {
        try {
            $raw = Get-Content -Path $LogPath -Raw -ErrorAction Stop
            Set-Clipboard -Value $raw
            $statusLabel.Text = "Copied log to clipboard at $(Get-Date -Format 'HH:mm:ss')."
        } catch {
            $statusLabel.Text = "Copy failed: $($_.Exception.Message)"
        }
    } else {
        $statusLabel.Text = "Log file not found."
    }
})

$copyErrButton.Add_Click({
    if (Test-Path $ErrLogPath) {
        try {
            $raw = Get-Content -Path $ErrLogPath -Raw -ErrorAction Stop
            Set-Clipboard -Value $raw
            $statusLabel.Text = "Copied errors to clipboard at $(Get-Date -Format 'HH:mm:ss')."
        } catch {
            $statusLabel.Text = "Copy errors failed: $($_.Exception.Message)"
        }
    } else {
        $statusLabel.Text = "Error log not found."
    }
})

$pingButton.Add_Click({
    $results = Ping-Targets -Targets $PingTargets
    $statusLabel.Text = ($results -join " | ")
})

$restartButton.Add_Click({
    $statusLabel.Text = Restart-Server
})

$toggleErrors.Add_CheckedChanged({
    $source = if ($toggleErrors.Checked) { $ErrLogPath } else { $LogPath }
    $textBox.Text = Get-LogText -Path $source -Tail $TailLines
    $textBox.SelectionStart = $textBox.Text.Length
    $textBox.ScrollToCaret()
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = $RefreshMs
$timer.Add_Tick({
    $activePath = if ($toggleErrors.Checked) { $ErrLogPath } else { $LogPath }
    if (Test-Path $activePath) {
        $info = Get-Item -Path $activePath
        if ($info.LastWriteTime -ne $lastWriteTime) {
            $lastWriteTime = $info.LastWriteTime
            $textBox.Text = Get-LogText -Path $activePath -Tail $TailLines
            $textBox.SelectionStart = $textBox.Text.Length
            $textBox.ScrollToCaret()
            $statusLabel.Text = "Updated $(Get-Date -Format 'HH:mm:ss')"
        }
    } else {
        if ($textBox.Text -notlike "Log file not found*") {
            $textBox.Text = Get-LogText -Path $activePath -Tail $TailLines
            $statusLabel.Text = "Waiting for log..."
        }
    }
})

$form.Add_Shown({
    $textBox.Text = Get-LogText -Path $LogPath -Tail $TailLines
    $timer.Start()
})

[void]$form.ShowDialog()
