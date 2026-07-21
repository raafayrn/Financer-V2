# Corta a margem branca da imagem-fonte e gera os ícones do app nos
# tamanhos certos (apple-touch-icon, icon-512, icon-192, favicon-32).

param(
    [string]$SourcePath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'client\public\Gemini_Generated_Image_ru4klsru4klsru4k.png')
)

Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Bitmap]::FromFile($SourcePath)

# --- Detecta a bounding box do conteúdo não-branco ---
function Test-IsWhite {
    param([System.Drawing.Color]$c)
    return ($c.R -gt 245 -and $c.G -gt 245 -and $c.B -gt 245)
}

$w = $src.Width
$h = $src.Height

# Amostragem por linha/coluna (passo de 2px para performance) usando LockBits seria mais
# rápido, mas para uma imagem única isso roda em segundos aceitáveis com GetPixel amostrado.
$step = 1

$minX = $w
$maxX = 0
$minY = $h
$maxY = 0

# Ignora uma faixa nas bordas externas (ruído de compressão/antialiasing
# isolado pode disparar falsos positivos bem longe do conteúdo real).
$marginX = [int]($w * 0.03)
$marginY = [int]($h * 0.03)
# Uma linha/coluna só conta como "conteúdo" se tiver um trecho contínuo
# mínimo de pixels não-brancos (descarta pixels isolados de ruído).
$minRun = 8

for ($y = $marginY; $y -lt ($h - $marginY); $y += $step) {
    $run = 0
    $rowHasContent = $false
    for ($x = $marginX; $x -lt ($w - $marginX); $x += $step) {
        $c = $src.GetPixel($x, $y)
        if (-not (Test-IsWhite $c)) {
            $run += 1
            if ($run -ge $minRun) {
                $rowHasContent = $true
                if ($x -lt $minX) { $minX = $x }
                if ($x -gt $maxX) { $maxX = $x }
            }
        } else {
            $run = 0
        }
    }
    if ($rowHasContent) {
        if ($y -lt $minY) { $minY = $y }
        if ($y -gt $maxY) { $maxY = $y }
    }
}

Write-Host "Bounding box detectada: x=$minX..$maxX  y=$minY..$maxY (fonte ${w}x${h})"

$cropW = $maxX - $minX
$cropH = $maxY - $minY
# A área de conteúdo pode não ser quadrada (ex.: retrato). Usa o MENOR lado
# e recorta um quadrado centralizado dentro da bounding box, sem extrapolar.
$side = [Math]::Min($cropW, $cropH)

$cropX = $minX + [Math]::Max(0, ($cropW - $side) / 2)
$cropY = $minY + [Math]::Max(0, ($cropH - $side) / 2)

$cropRect = New-Object System.Drawing.Rectangle([int]$cropX, [int]$cropY, $side, $side)
$cropped = New-Object System.Drawing.Bitmap($side, $side)
$gCrop = [System.Drawing.Graphics]::FromImage($cropped)
$gCrop.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $side, $side)), $cropRect, [System.Drawing.GraphicsUnit]::Pixel)
$gCrop.Dispose()
$src.Dispose()

function Save-Resized {
    param([System.Drawing.Bitmap]$Bitmap, [int]$Size, [string]$Path)
    $out = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($out)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($Bitmap, 0, 0, $Size, $Size)
    $g.Dispose()
    $out.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $out.Dispose()
}

$publicDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'client\public'

Save-Resized -Bitmap $cropped -Size 1024 -Path (Join-Path $publicDir 'apple-touch-icon.png')
Save-Resized -Bitmap $cropped -Size 512  -Path (Join-Path $publicDir 'icon-512.png')
Save-Resized -Bitmap $cropped -Size 192  -Path (Join-Path $publicDir 'icon-192.png')
Save-Resized -Bitmap $cropped -Size 64   -Path (Join-Path $publicDir 'favicon-32.png')

$cropped.Dispose()

Write-Host "Ícones gerados a partir de $SourcePath"
