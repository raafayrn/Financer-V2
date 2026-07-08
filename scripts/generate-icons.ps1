# Gera os ícones do app (favicon + apple-touch-icon) em client/public/.
# Desenha notas de dólar cartunizadas, em leque, sobre um fundo em gradiente
# que combina com a paleta do app (navy -> verde escuro).

Add-Type -AssemblyName System.Drawing

function Get-RoundedRectPath {
    param([double]$x, [double]$y, [double]$w, [double]$h, [double]$radius)
    $d = $radius * 2
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

function Draw-Bill {
    param(
        [System.Drawing.Graphics]$Canvas,
        [double]$Cx,
        [double]$Cy,
        [double]$W,
        [double]$H,
        [double]$AngleDeg,
        [System.Drawing.Color]$Fill,
        [System.Drawing.Color]$Edge,
        [System.Drawing.Color]$Ink
    )

    $state = $Canvas.Save()
    $Canvas.TranslateTransform([float]$Cx, [float]$Cy)
    $Canvas.RotateTransform([float]$AngleDeg)

    $radius = $H * 0.16
    $path = Get-RoundedRectPath -x (-$W/2) -y (-$H/2) -w $W -h $H -radius $radius

    # Sombra suave
    $shadowMatrix = New-Object System.Drawing.Drawing2D.Matrix
    $shadowMatrix.Translate([float]($W*0.03), [float]($H*0.08))
    $shadowPath = $path.Clone()
    $shadowPath.Transform($shadowMatrix)
    $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(70, 0, 0, 0))
    $Canvas.FillPath($shadowBrush, $shadowPath)

    $fillBrush = New-Object System.Drawing.SolidBrush($Fill)
    $Canvas.FillPath($fillBrush, $path)
    $edgePen = New-Object System.Drawing.Pen($Edge, [Math]::Max(1, $H * 0.045))
    $Canvas.DrawPath($edgePen, $path)

    # Moldura interna pontilhada
    $innerX = -$W/2 + $W*0.08
    $innerY = -$H/2 + $H*0.12
    $innerW = $W*0.84
    $innerH = $H*0.76
    $innerPen = New-Object System.Drawing.Pen($Edge, [Math]::Max(1, $H * 0.025))
    $innerPen.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dot
    $Canvas.DrawRectangle($innerPen, [float]$innerX, [float]$innerY, [float]$innerW, [float]$innerH)

    # Medalhão central com "$"
    $coinRadius = $H * 0.32
    $coinBrush = New-Object System.Drawing.SolidBrush($Edge)
    $Canvas.FillEllipse($coinBrush, [float](-$coinRadius), [float](-$coinRadius), [float]($coinRadius*2), [float]($coinRadius*2))

    $font = New-Object System.Drawing.Font('Georgia', [float]($coinRadius * 1.15), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $inkBrush = New-Object System.Drawing.SolidBrush($Ink)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $Canvas.DrawString('$', $font, $inkBrush, [float]0, [float](-$H*0.02), $sf)

    # Cantos com marcadores decorativos
    $cornerBrush = New-Object System.Drawing.SolidBrush($Edge)
    $cw = $W * 0.09
    $ch = $H * 0.14
    $Canvas.FillEllipse($cornerBrush, [float](-$W/2 + $W*0.06), [float](-$H/2 + $H*0.08), [float]$cw, [float]$ch)
    $Canvas.FillEllipse($cornerBrush, [float]($W/2 - $W*0.06 - $cw), [float]($H/2 - $H*0.08 - $ch), [float]$cw, [float]$ch)

    $Canvas.Restore($state)
}

function New-Icon {
    param([int]$Size, [string]$Path)

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

    # --- Fundo: gradiente navy -> verde escuro ---
    $rect = New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)
    $c1 = [System.Drawing.Color]::FromArgb(255, 12, 20, 38)
    $c2 = [System.Drawing.Color]::FromArgb(255, 10, 46, 38)
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, 45)
    $g.FillRectangle($bgBrush, $rect)

    # Vinheta suave
    $vignette = New-Object System.Drawing.Drawing2D.GraphicsPath
    $vignette.AddEllipse([float](-$Size*0.3), [float](-$Size*0.3), [float]($Size*1.6), [float]($Size*1.6))
    $vBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($vignette)
    $vBrush.CenterColor = [System.Drawing.Color]::FromArgb(40, 34, 197, 94)
    $vBrush.SurroundColors = [System.Drawing.Color[]]@([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
    $g.FillRectangle($vBrush, $rect)

    # --- Leque de 3 notas ---
    $billW = $Size * 0.62
    $billH = $billW * 0.46
    $cx = $Size * 0.5
    $cy = $Size * 0.58

    $billBack  = [System.Drawing.Color]::FromArgb(255, 21, 128, 61)
    $billMid   = [System.Drawing.Color]::FromArgb(255, 22, 163, 74)
    $billFront = [System.Drawing.Color]::FromArgb(255, 74, 222, 128)
    $edgeDark  = [System.Drawing.Color]::FromArgb(255, 12, 60, 30)
    $inkLight  = [System.Drawing.Color]::FromArgb(255, 240, 253, 244)
    $inkDark   = [System.Drawing.Color]::FromArgb(255, 6, 40, 20)

    Draw-Bill -Canvas $g -Cx ($cx - $billW*0.14) -Cy ($cy - $billH*0.12) -W $billW -H $billH -AngleDeg (-16) -Fill $billBack  -Edge $edgeDark -Ink $inkLight
    Draw-Bill -Canvas $g -Cx ($cx + $billW*0.14) -Cy ($cy - $billH*0.06) -W $billW -H $billH -AngleDeg 14    -Fill $billMid   -Edge $edgeDark -Ink $inkLight
    Draw-Bill -Canvas $g -Cx $cx                 -Cy ($cy + $billH*0.10) -W $billW -H $billH -AngleDeg 0    -Fill $billFront -Edge $edgeDark -Ink $inkDark

    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

$publicDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'client\public'
New-Item -ItemType Directory -Force -Path $publicDir | Out-Null

New-Icon -Size 1024 -Path (Join-Path $publicDir 'apple-touch-icon.png')
New-Icon -Size 512  -Path (Join-Path $publicDir 'icon-512.png')
New-Icon -Size 192  -Path (Join-Path $publicDir 'icon-192.png')
New-Icon -Size 64   -Path (Join-Path $publicDir 'favicon-32.png')

Write-Host "Ícones gerados em $publicDir"
