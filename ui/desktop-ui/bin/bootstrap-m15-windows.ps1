Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Have-Command {
  param([string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-CommonPathCandidates {
  return @(
    "$HOME\bin",
    "$HOME\go\bin",
    "$env:LOCALAPPDATA\Microsoft\WinGet\Links",
    "$env:ProgramFiles\Go\bin",
    "${env:ProgramFiles(x86)}\Go\bin",
    "$env:ProgramFiles\nodejs",
    "$env:ProgramFiles\Git\bin",
    "$env:ProgramFiles\Git\usr\bin",
    "$env:ProgramFiles\NSIS",
    "${env:ProgramFiles(x86)}\NSIS"
  )
}

function Ensure-UserPathEntry {
  param([string]$Entry)
  if ([string]::IsNullOrWhiteSpace($Entry) -or -not (Test-Path $Entry)) {
    return
  }

  $normalized = $Entry.TrimEnd('\')
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if ([string]::IsNullOrWhiteSpace($userPath)) {
    $userPath = ""
  }

  $segments = @($userPath -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($segments -notcontains $normalized) {
    $updated = if (@($segments).Count -gt 0) { (@($segments) + $normalized) -join ';' } else { $normalized }
    [Environment]::SetEnvironmentVariable("Path", $updated, "User")
  }

  $envSegments = @($env:Path -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($envSegments -notcontains $normalized) {
    $env:Path = if (@($envSegments).Count -gt 0) { (@($envSegments) + $normalized) -join ';' } else { $normalized }
  }
}

function Install-WingetPackage {
  param(
    [string[]]$Ids,
    [string]$CommandName
  )

  if (Have-Command $CommandName) {
    Write-Host "OK   $CommandName already present"
    return
  }

  foreach ($id in $Ids) {
    try {
      Write-Host "Installing $id via winget..."
      winget install -e --id $id --source winget --accept-package-agreements --accept-source-agreements | Out-Host
    } catch {
      continue
    }

    foreach ($candidate in (Get-CommonPathCandidates)) {
      Ensure-UserPathEntry $candidate
    }

    if (Have-Command $CommandName) {
      Write-Host "OK   installed $CommandName via $id"
      return
    }
  }

  throw "Unable to install required command '$CommandName' with winget ids: $($Ids -join ', ')"
}

function Ensure-BashShim {
  param(
    [string]$ShimName,
    [string]$TargetCommand
  )

  $homeBin = Join-Path $HOME "bin"
  if (-not (Test-Path $homeBin)) {
    New-Item -ItemType Directory -Path $homeBin | Out-Null
  }
  Ensure-UserPathEntry $homeBin

  $shimPath = Join-Path $homeBin $ShimName
  if (-not (Test-Path $shimPath)) {
    Set-Content -Path $shimPath -NoNewline -Value @"
#!/usr/bin/env bash
set -euo pipefail
exec ${TargetCommand} "\$@"
"@
  }
}

function Install-JqFallback {
  $homeBin = Join-Path $HOME "bin"
  if (-not (Test-Path $homeBin)) {
    New-Item -ItemType Directory -Path $homeBin | Out-Null
  }
  Ensure-UserPathEntry $homeBin

  $jqPath = Join-Path $homeBin "jq.exe"
  $candidateUris = @(
    "https://github.com/jqlang/jq/releases/latest/download/jq-windows-amd64.exe",
    "https://github.com/jqlang/jq/releases/latest/download/jq-win64.exe"
  )

  foreach ($uri in $candidateUris) {
    try {
      Write-Host "Falling back to direct jq download from $uri ..."
      Invoke-WebRequest -UseBasicParsing -Uri $uri -OutFile $jqPath
      if (Test-Path $jqPath) {
        Write-Host "OK   installed jq fallback at $jqPath"
        return
      }
    } catch {
      continue
    }
  }

  throw "Unable to install jq via winget or direct official release download."
}

function Install-KubectlFallback {
  $homeBin = Join-Path $HOME "bin"
  if (-not (Test-Path $homeBin)) {
    New-Item -ItemType Directory -Path $homeBin | Out-Null
  }
  Ensure-UserPathEntry $homeBin

  $kubectlPath = Join-Path $homeBin "kubectl.exe"
  $stableVersion = ""

  try {
    $stableVersion = (Invoke-RestMethod -UseBasicParsing -Uri "https://dl.k8s.io/release/stable.txt").Trim()
  } catch {
    $stableVersion = "v1.34.1"
  }

  $candidateUris = @(
    "https://dl.k8s.io/release/${stableVersion}/bin/windows/amd64/kubectl.exe",
    "https://dl.k8s.io/release/v1.34.1/bin/windows/amd64/kubectl.exe"
  )

  foreach ($uri in $candidateUris) {
    try {
      Write-Host "Falling back to direct kubectl download from $uri ..."
      Invoke-WebRequest -UseBasicParsing -Uri $uri -OutFile $kubectlPath
      if (Test-Path $kubectlPath) {
        Write-Host "OK   installed kubectl fallback at $kubectlPath"
        return
      }
    } catch {
      continue
    }
  }

  throw "Unable to install kubectl via winget or direct official download."
}

if (-not (Have-Command "winget")) {
  throw "bootstrap-m15-windows requires winget on the Windows host."
}

Write-Host "Bootstrapping Windows host for the Epydios AgentOps Desktop beta lane..."

Install-WingetPackage -Ids @("Git.Git") -CommandName "bash"
Install-WingetPackage -Ids @("GoLang.Go") -CommandName "go"
Install-WingetPackage -Ids @("OpenJS.NodeJS.LTS") -CommandName "node"
Install-WingetPackage -Ids @("Python.Python.3.13", "Python.Python.3.12") -CommandName "python"
try {
  Install-WingetPackage -Ids @("jqlang.jq") -CommandName "jq"
} catch {
  Install-JqFallback
}
Install-WingetPackage -Ids @("NSIS.NSIS") -CommandName "makensis"
try {
  Install-WingetPackage -Ids @("Kubernetes.kubectl") -CommandName "kubectl"
} catch {
  Install-KubectlFallback
}

foreach ($candidate in (Get-CommonPathCandidates)) {
  Ensure-UserPathEntry $candidate
}

if (-not (Have-Command "python3") -and (Have-Command "python")) {
  Ensure-BashShim -ShimName "python3" -TargetCommand "python"
}

if (-not (Have-Command "wails")) {
  if (-not (Have-Command "go")) {
    throw "Go is still unavailable after bootstrap; cannot install Wails CLI."
  }
  Write-Host "Installing Wails CLI with go install..."
  go install github.com/wailsapp/wails/v2/cmd/wails@latest
  Ensure-UserPathEntry "$HOME\go\bin"
}

Write-Host ""
Write-Host "Bootstrap complete."
Write-Host "Open a fresh Git Bash session before running the native Windows beta lane:"
Write-Host "  bash ./ui/desktop-ui/bin/check-m15-native-toolchain.sh"
Write-Host "  bash ./ui/desktop-ui/bin/verify-m15-windows-beta.sh"
Write-Host "  bash ./ui/desktop-ui/bin/launch-m15-windows-beta.sh"
