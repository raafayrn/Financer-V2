# Gera um .ico multi-resolução (16/32/48/64/128/256) a partir do ícone PNG
# do app, para uso em atalhos do Windows (.lnk). O formato ICO moderno aceita
# PNG bruto por entrada, então cada tamanho é só um PNG redimensionado.

param(
    [string]$SourcePng = (Join-Path (Split-Path -Parent $PSScriptRoot) 'client\public\icon-512.png'),
    [string]$OutIco = (Join-Path (Split-Path -Parent $PSScriptRoot) 'Financer.ico')
)

Add-Type -AssemblyName System.Drawing

$sizes = @(16, 32, 48, 64, 128, 256)
$src = [System.Drawing.Bitmap]::FromFile($SourcePng)

$pngBlobs = @()
foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($src, 0, 0, $size, $size)
    $g.Dispose()

    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngBlobs += ,($size, $ms.ToArray())
    $bmp.Dispose()
}
$src.Dispose()

# --- Monta o arquivo .ico manualmente (ICONDIR + ICONDIRENTRY[] + dados PNG) ---
$fs = New-Object System.IO.FileStream($OutIco, [System.IO.FileMode]::Create)
$bw = New-Object System.IO.BinaryWriter($fs)

# ICONDIR: reserved(2)=0, type(2)=1 (ico), count(2)
$bw.Write([UInt16]0)
$bw.Write([UInt16]1)
$bw.Write([UInt16]$pngBlobs.Count)

$headerSize = 6 + (16 * $pngBlobs.Count)
$offset = $headerSize

foreach ($entry in $pngBlobs) {
    $size = $entry[0]
    $data = $entry[1]
    $wByte = if ($size -ge 256) { 0 } else { $size }
    $bw.Write([byte]$wByte)   # width  (0 = 256)
    $bw.Write([byte]$wByte)   # height (0 = 256)
    $bw.Write([byte]0)        # color palette
    $bw.Write([byte]0)        # reserved
    $bw.Write([UInt16]1)      # color planes
    $bw.Write([UInt16]32)     # bits per pixel
    $bw.Write([UInt32]$data.Length)
    $bw.Write([UInt32]$offset)
    $offset += $data.Length
}

foreach ($entry in $pngBlobs) {
    $bw.Write($entry[1])
}

$bw.Flush()
$bw.Close()
$fs.Close()

Write-Host "Ícone .ico gerado em $OutIco"
