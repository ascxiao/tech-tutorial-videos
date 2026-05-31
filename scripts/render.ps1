param (
    [string]$Id = "001"
)

Write-Host "==============================================" -ForegroundColor Yellow
Write-Host "  REMOTION AUTOMATED VIDEO RENDER PIPELINE" -ForegroundColor Yellow
Write-Host "==============================================" -ForegroundColor Yellow

$Slug = ""
$TutorialsFile = "public/data/tutorials.json"
if (Test-Path $TutorialsFile) {
    try {
        $Tutorials = Get-Content $TutorialsFile -Raw -Encoding utf8 | ConvertFrom-Json
        $Tutorial = $Tutorials | Where-Object { $_.id -eq $Id }
        if ($Tutorial -and $Tutorial.seriesTitle) {
            # Sanitize series title into a safe lowercase alphanumeric slug
            $CleanedTitle = $Tutorial.seriesTitle.ToLower() -replace '[^a-z0-9]+', '_' -replace '^_+|_+$', ''
            if ($CleanedTitle) {
                $Slug = "_$CleanedTitle"
            }
        }
    } catch {
        # Silent fallback to no slug if reading JSON fails
    }
}

$CompositionId = "tutorial-$Id"
$OutputPath = "public/output_$($Id)$($Slug).mp4"

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
