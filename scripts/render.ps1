param (
    [string]$Id = "001"
)

Write-Host "==============================================" -ForegroundColor Yellow
Write-Host "  REMOTION AUTOMATED VIDEO RENDER PIPELINE" -ForegroundColor Yellow
Write-Host "==============================================" -ForegroundColor Yellow

$CompositionId = "tutorial-$Id"
$OutputPath = "public/output_$Id.mp4"

Write-Host "[*] Compiling composition: $CompositionId" -ForegroundColor Cyan
Write-Host "[*] Destination output: $OutputPath" -ForegroundColor Cyan

# Executing Remotion headless compiler command
npx remotion render $CompositionId $OutputPath

if ($LASTEXITCODE -eq 0) {
    Write-Host "[+] Video compiled successfully!" -ForegroundColor Green
    Write-Host "[+] Location: $OutputPath" -ForegroundColor Green
} else {
    Write-Error "[-] Render failed! Verify Remotion project compilation."
}
