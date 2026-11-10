$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$config = Get-Content (Join-Path $PSScriptRoot 'twa-manifest.json') -Raw | ConvertFrom-Json
$destination = Join-Path $PSScriptRoot 'store'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
$bitmap = [System.Drawing.Bitmap]::new(1024,500)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$background = [System.Drawing.ColorTranslator]::FromHtml('#0a0e14')
$accent = [System.Drawing.ColorTranslator]::FromHtml('#8ab4ff')
$graphics.Clear($background)
$accentBrush = [System.Drawing.SolidBrush]::new($accent)
$whiteBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
$mutedBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(220,230,240))
$titleSize = if ($config.name.Length -gt 15) { 38 } else { 46 }
$titleFont = [System.Drawing.Font]::new('Segoe UI',$titleSize,[System.Drawing.FontStyle]::Bold)
$subtitleFont = [System.Drawing.Font]::new('Segoe UI',20,[System.Drawing.FontStyle]::Regular)
$smallFont = [System.Drawing.Font]::new('Segoe UI',14,[System.Drawing.FontStyle]::Regular)
$icon = [System.Drawing.Image]::FromFile((Join-Path $PSScriptRoot 'android/store_icon.png'))
try {
  $graphics.FillRectangle($accentBrush,408,98,86,8)
  $graphics.DrawImage($icon,72,126,256,256)
  $graphics.DrawString($config.name,$titleFont,$whiteBrush,398,150)
  $graphics.DrawString('Investment research with evidence',$subtitleFont,$mutedBrush,402,250)
  $graphics.DrawString('SRAVANTIX',$smallFont,$accentBrush,402,342)
  $bitmap.Save((Join-Path $destination 'feature-graphic.png'),[System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $icon.Dispose(); $titleFont.Dispose(); $subtitleFont.Dispose(); $smallFont.Dispose()
  $accentBrush.Dispose(); $whiteBrush.Dispose(); $mutedBrush.Dispose()
  $graphics.Dispose(); $bitmap.Dispose()
}
