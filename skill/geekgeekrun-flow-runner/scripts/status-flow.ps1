param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('auto-chat', 'rechat', 'resume-sync')]
  [string]$Flow
)

$ErrorActionPreference = 'Stop'

$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$DaemonClient = Join-Path $ProjectRoot 'skill\geekgeekrun-flow-runner\scripts\daemon-client.mjs'
$StorageRoot = Join-Path $env:USERPROFILE '.geekgeekrun\storage'
$AutoChatRuntimeStatusPath = Join-Path $StorageRoot 'auto-chat-runtime-status.json'

$WorkerId = switch ($Flow) {
  'auto-chat' { 'geekAutoStartWithBossMain' }
  'rechat' { 'readNoReplyAutoReminderMain' }
  'resume-sync' { 'bossResumeSyncMain' }
}

$UserMode = switch ($Flow) {
  'auto-chat' { 'geekAutoStartWithBoss' }
  'rechat' { 'readNoReplyAutoReminder' }
  'resume-sync' { 'bossResumeSync' }
}

$daemonReachable = $false
$daemonWorker = $null
try {
  $statusJson = & node $DaemonClient get-status 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $statusJson) {
    throw 'daemon get-status failed'
  }
  $status = $statusJson | ConvertFrom-Json
  $daemonReachable = $true
  if ($status.workers) {
    $daemonWorker = @($status.workers | Where-Object { $_.workerId -eq $WorkerId }) | Select-Object -First 1
  }
} catch {
  $daemonReachable = $false
}

$patterns = @("--mode=$UserMode", "--mode=$WorkerId")
$processes = @(
  Get-CimInstance Win32_Process |
    Where-Object {
      $commandLine = $_.CommandLine
      ($_.Name -eq 'electron.exe' -or $_.Name -eq 'node.exe') -and
      $commandLine -and
      $commandLine -like "*$ProjectRoot*" -and
      @($patterns | Where-Object { $commandLine -like "*$_*" }).Count -gt 0
    } |
    Select-Object ProcessId, Name, CommandLine
)

$startupReady = $null
if ($Flow -eq 'auto-chat' -and (Test-Path $AutoChatRuntimeStatusPath)) {
  try {
    $runtimeStatus = Get-Content -Path $AutoChatRuntimeStatusPath -Raw | ConvertFrom-Json
    $runtimeRunRecordId = $null
    if ($runtimeStatus.runRecordId) {
      $runtimeRunRecordId = [int]$runtimeStatus.runRecordId
    }
    $workerRunRecordId = $null
    if ($daemonWorker -and $daemonWorker.args) {
      $workerRunRecordArg = @($daemonWorker.args | Where-Object { $_ -like '--run-record-id=*' }) | Select-Object -First 1
      if ($workerRunRecordArg) {
        $workerRunRecordId = [int]($workerRunRecordArg -replace '^--run-record-id=', '')
      }
    }
    if (($null -eq $workerRunRecordId) -or ($runtimeRunRecordId -eq $workerRunRecordId)) {
      $startupReady = $runtimeStatus.recommendPageReady
    }
  } catch {
    $startupReady = $null
  }
}

[pscustomobject]@{
  success = $true
  flow = $Flow
  projectRoot = $ProjectRoot
  userMode = $UserMode
  workerId = $WorkerId
  daemonReachable = $daemonReachable
  daemonWorker = $daemonWorker
  startupReady = $startupReady
  processCount = @($processes).Count
  running = ($null -ne $daemonWorker) -or (@($processes).Count -gt 0)
  processes = @($processes)
} | ConvertTo-Json -Depth 6
