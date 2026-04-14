param(
  [string]$ConfigPatchJson,
  [string]$ConfigPatchFile,
  [string]$UserDataDir,
  [ValidateSet('full', 'cookies-only', 'none', '')]
  [string]$SessionInjectionMode
)

$ErrorActionPreference = 'Stop'

$DefaultConfigPath = Join-Path $PSScriptRoot '..\defaults\auto-chat.json'
if ((-not $UserDataDir -or -not $SessionInjectionMode) -and (Test-Path $DefaultConfigPath)) {
  $DefaultConfig = Get-Content $DefaultConfigPath -Raw | ConvertFrom-Json
  if (-not $UserDataDir -and $DefaultConfig.userDataDir) {
    $UserDataDir = [string]$DefaultConfig.userDataDir
  }
  if (-not $SessionInjectionMode -and $DefaultConfig.sessionInjectionMode) {
    $SessionInjectionMode = [string]$DefaultConfig.sessionInjectionMode
  }
}

$StartFlowScript = Join-Path $PSScriptRoot 'start-flow.ps1'
& $StartFlowScript -Flow 'auto-chat' -ConfigPatchJson $ConfigPatchJson -ConfigPatchFile $ConfigPatchFile -UserDataDir $UserDataDir -SessionInjectionMode $SessionInjectionMode
