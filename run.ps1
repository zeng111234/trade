# PowerShell runner with UTF-8 encoding fix
# Force cmd.exe with UTF-8 code page to avoid garbled Chinese
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# Build argument string from all passed arguments
$argStr = $args -join ' '
# Wrap in cmd.exe so chcp 65001 takes effect before node runs
cmd.exe /c "chcp 65001 >nul & node `"$PSScriptRoot\index.js`" $argStr"