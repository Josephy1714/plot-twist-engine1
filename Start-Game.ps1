$ErrorActionPreference = 'Stop'
$serverDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCommand) {
    & $nodeCommand.Source (Join-Path $serverDir 'local-server.cjs')
} else {
    $bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
    if (-not (Test-Path -LiteralPath $bundledNode)) { throw 'Node.js 20+ was not found. Install Node.js or run npm start from this folder.' }
    & $bundledNode (Join-Path $serverDir 'local-server.cjs')
}
