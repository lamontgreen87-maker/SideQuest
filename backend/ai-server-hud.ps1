param(
    [string]$LogPath = (Join-Path $env:LOCALAPPDATA "SideQuest\run-ai-server.log"),
    [string]$ErrLogPath = (Join-Path $env:LOCALAPPDATA "SideQuest\run-ai-server.log.err"),
    [string]$ClerkLogPath = (Join-Path $env:LOCALAPPDATA "SideQuest\clerk.log"),
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

$copyClerkButton = New-Object System.Windows.Forms.Button
$copyClerkButton.Text = "Copy clerk log"
$copyClerkButton.AutoSize = $true
$copyClerkButton.Location = New-Object System.Drawing.Point(330, 36)

$pingButton = New-Object System.Windows.Forms.Button
$pingButton.Text = "Ping servers"
$pingButton.AutoSize = $true
$pingButton.Location = New-Object System.Drawing.Point(460, 36)

$restartButton = New-Object System.Windows.Forms.Button
$restartButton.Text = "Restart AI server"
$restartButton.AutoSize = $true
$restartButton.Location = New-Object System.Drawing.Point(570, 36)

$toggleErrors = New-Object System.Windows.Forms.CheckBox
$toggleErrors.Text = "Show errors"
$toggleErrors.AutoSize = $true
$toggleErrors.Location = New-Object System.Drawing.Point(720, 40)

$modelLabel = New-Object System.Windows.Forms.Label
$modelLabel.Text = "Model:"
$modelLabel.AutoSize = $true
$modelLabel.Location = New-Object System.Drawing.Point(12, 66)

$modelCombo = New-Object System.Windows.Forms.ComboBox
$modelCombo.Width = 200
$modelCombo.Location = New-Object System.Drawing.Point(60, 62)
$modelCombo.DropDownStyle = "DropDown"
$null = $modelCombo.Items.AddRange(@(
    "qwen3:4b",
    "qwen3:8b",
    "llama3.2:3b",
    "llama3",
    "qwen2.5:3b"
))

$setModelButton = New-Object System.Windows.Forms.Button
$setModelButton.Text = "Set model + restart"
$setModelButton.AutoSize = $true
$setModelButton.Location = New-Object System.Drawing.Point(270, 60)

$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.AutoSize = $true
$statusLabel.ForeColor = [System.Drawing.Color]::DimGray
$statusLabel.Location = New-Object System.Drawing.Point(12, 86)

$tabControl = New-Object System.Windows.Forms.TabControl
$tabControl.Location = New-Object System.Drawing.Point(12, 92)
$tabControl.Size = New-Object System.Drawing.Size(860, 430)
$tabControl.Anchor = "Top,Bottom,Left,Right"

$serverTab = New-Object System.Windows.Forms.TabPage
$serverTab.Text = "Server Log"

$clerkTab = New-Object System.Windows.Forms.TabPage
$clerkTab.Text = "Clerk Log"

$serverTextBox = New-Object System.Windows.Forms.TextBox
$serverTextBox.Multiline = $true
$serverTextBox.ReadOnly = $true
$serverTextBox.ScrollBars = "Vertical"
$serverTextBox.Font = New-Object System.Drawing.Font("Consolas", 10)
$serverTextBox.Dock = "Fill"

$clerkTextBox = New-Object System.Windows.Forms.TextBox
$clerkTextBox.Multiline = $true
$clerkTextBox.ReadOnly = $true
$clerkTextBox.ScrollBars = "Vertical"
$clerkTextBox.Font = New-Object System.Drawing.Font("Consolas", 10)
$clerkTextBox.Dock = "Fill"

$serverTab.Controls.Add($serverTextBox)
$clerkTab.Controls.Add($clerkTextBox)
$tabControl.TabPages.AddRange(@($serverTab, $clerkTab))

$form.Controls.AddRange(@(
    $pathLabel,
    $copyButton,
    $copyErrButton,
    $copyClerkButton,
    $pingButton,
    $restartButton,
    $toggleErrors,
    $modelLabel,
    $modelCombo,
    $setModelButton,
    $statusLabel,
    $tabControl
))

$lastWriteTime = [DateTime]::MinValue
$lastClerkWriteTime = [DateTime]::MinValue
$modelPath = Join-Path $PSScriptRoot "model_name.txt"
$lastPaymentLine = ""

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

function Update-LogBox {
    param(
        [string]$Path,
        [System.Windows.Forms.TextBox]$Box,
        [ref]$LastWriteRef
    )
    if (Test-Path $Path) {
        $info = Get-Item -Path $Path
        if ($info.LastWriteTime -ne $LastWriteRef.Value) {
            $LastWriteRef.Value = $info.LastWriteTime
            $Box.Text = Get-LogText -Path $Path -Tail $TailLines
            $Box.SelectionStart = $Box.Text.Length
            $Box.ScrollToCaret()
        }
    } else {
        if ($Box.Text -notlike "Log file not found*") {
            $Box.Text = Get-LogText -Path $Path -Tail $TailLines
        }
    }
}

function Check-PaymentSound {
    param([string]$LogText)
    if (-not $LogText) { return }
    $lines = $LogText -split [Environment]::NewLine
    $match = $lines | Select-String -Pattern "Payment credited" | Select-Object -Last 1
    if (-not $match) { return }
    $current = $match.Line
    if ($current -and $current -ne $lastPaymentLine) {
        $lastPaymentLine = $current
        $logoffSound = Join-Path $env:WINDIR "Media\Windows Logoff Sound.wav"
        if (Test-Path $logoffSound) {
            $player = New-Object System.Media.SoundPlayer
            $player.SoundLocation = $logoffSound
            $player.Play()
        } else {
            [System.Media.SystemSounds]::Asterisk.Play()
        }
        $statusLabel.Text = "Payment detected at $(Get-Date -Format 'HH:mm:ss')."
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

function Save-Model {
    param([string]$ModelName)
    $clean = ($ModelName | ForEach-Object { $_.Trim() })
    if (-not $clean) {
        return "Enter a model name first."
    }
    try {
        Set-Content -Path $modelPath -Value $clean -Encoding ASCII
        $env:MODEL_NAME = $clean
        return "Model set to $clean"
    } catch {
        return "Model save failed: $($_.Exception.Message)"
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

$copyClerkButton.Add_Click({
    if (Test-Path $ClerkLogPath) {
        try {
            $raw = Get-Content -Path $ClerkLogPath -Raw -ErrorAction Stop
            Set-Clipboard -Value $raw
            $statusLabel.Text = "Copied clerk log at $(Get-Date -Format 'HH:mm:ss')."
        } catch {
            $statusLabel.Text = "Copy clerk log failed: $($_.Exception.Message)"
        }
    } else {
        $statusLabel.Text = "Clerk log not found."
    }
})

$pingButton.Add_Click({
    $results = Ping-Targets -Targets $PingTargets
    $statusLabel.Text = ($results -join " | ")
})

$restartButton.Add_Click({
    $statusLabel.Text = Restart-Server
})

$setModelButton.Add_Click({
    $saveStatus = Save-Model -ModelName $modelCombo.Text
    if ($saveStatus -like "Model set*") {
        $restartStatus = Restart-Server
        $statusLabel.Text = "$saveStatus; $restartStatus"
    } else {
        $statusLabel.Text = $saveStatus
    }
})

$toggleErrors.Add_CheckedChanged({
    $source = if ($toggleErrors.Checked) { $ErrLogPath } else { $LogPath }
    $serverTextBox.Text = Get-LogText -Path $source -Tail $TailLines
    $serverTextBox.SelectionStart = $serverTextBox.Text.Length
    $serverTextBox.ScrollToCaret()
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = $RefreshMs
$timer.Add_Tick({
    $activePath = if ($toggleErrors.Checked) { $ErrLogPath } else { $LogPath }
    Update-LogBox -Path $activePath -Box $serverTextBox -LastWriteRef ([ref]$lastWriteTime)
    Update-LogBox -Path $ClerkLogPath -Box $clerkTextBox -LastWriteRef ([ref]$lastClerkWriteTime)
    if (-not $toggleErrors.Checked) {
        Check-PaymentSound -LogText $serverTextBox.Text
    }
    $statusLabel.Text = "Updated $(Get-Date -Format 'HH:mm:ss')"
})

$form.Add_Shown({
    if (Test-Path $modelPath) {
        try {
            $saved = (Get-Content -Path $modelPath -Raw).Trim()
            if ($saved) {
                $modelCombo.Text = $saved
            }
        } catch {
            $null = $null
        }
    } elseif ($env:MODEL_NAME) {
        $modelCombo.Text = $env:MODEL_NAME
    } else {
        $modelCombo.Text = "qwen3:4b"
    }
    $serverTextBox.Text = Get-LogText -Path $LogPath -Tail $TailLines
    $clerkTextBox.Text = Get-LogText -Path $ClerkLogPath -Tail $TailLines
    $timer.Start()
})

[void]$form.ShowDialog()
