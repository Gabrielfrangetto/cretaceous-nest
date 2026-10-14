# Turns a generated dinosaur image into a game sprite: removes a plain light background (or, for an
# image that already has transparency, the ground shadow), crops, scales to 240 px tall and saves a PNG.
# Usage: powershell -STA -File scripts\cutout.ps1 -In image.png -Out sprites\rex-f.png [-Flip]
# -Flip mirrors images drawn facing left; the game expects sprites facing right.
# -Holes N also clears enclosed background patches of N pixels or more (the middle of a ring or wreath).
param([string]$In, [string]$Out, [int]$Height = 240, [switch]$Flip, [int]$Holes = 0)
Add-Type -AssemblyName PresentationCore, WindowsBase
$src = @"
using System;
using System.Collections.Generic;
public static class Cutout {
  // Removes a light, low-saturation background (and the soft ground shadow) connected to the image border.
  // holeMin > 0 also clears enclosed background patches of at least that many pixels (the middle of a ring).
  public static int[] Run(byte[] px, int w, int h, int holeMin) {
    bool[] bg = new bool[w * h];
    var q = new Queue<int>();
    // an image that already has transparency only needs its ground shadow removed, so colour matching
    // is limited to the bottom band of the drawing; an opaque image is matched everywhere
    bool hasAlpha = false; int cTop = h, cBot = -1;
    for (int i = 0; i < w * h; i++) if (px[i*4+3] < 40) { hasAlpha = true; break; }
    if (hasAlpha) for (int i = 0; i < w * h; i++) if (px[i*4+3] >= 40) { int y = i / w; if (y < cTop) cTop = y; if (y > cBot) cBot = y; }
    int band = hasAlpha ? cBot - (int)((cBot - cTop) * 0.14) : 0;
    Func<int, bool> bgish = i => {
      if (px[i*4+3] < 40) return true;   // already transparent
      if (i / w < band) return false;
      int b = px[i*4], g = px[i*4+1], r = px[i*4+2];
      int mx = Math.Max(r, Math.Max(g, b)), mn = Math.Min(r, Math.Min(g, b));
      return hasAlpha ? (mn > 140 && (mx - mn) < 80) : (mn > 175 && (mx - mn) < 48);
    };
    for (int x = 0; x < w; x++) { foreach (int y in new[] {0, h-1}) { int i = y*w+x; if (!bg[i] && bgish(i)) { bg[i] = true; q.Enqueue(i); } } }
    for (int y = 0; y < h; y++) { foreach (int x in new[] {0, w-1}) { int i = y*w+x; if (!bg[i] && bgish(i)) { bg[i] = true; q.Enqueue(i); } } }
    while (q.Count > 0) {
      int i = q.Dequeue(); int x = i % w, y = i / w;
      int[] nb = { x > 0 ? i-1 : -1, x < w-1 ? i+1 : -1, y > 0 ? i-w : -1, y < h-1 ? i+w : -1 };
      foreach (int n in nb) if (n >= 0 && !bg[n] && bgish(n)) { bg[n] = true; q.Enqueue(n); }
    }
    if (holeMin > 0) {
      // background-coloured patches the border fill could not reach; big ones are holes, small ones highlights
      bool[] seen = new bool[w * h];
      for (int s = 0; s < w * h; s++) {
        if (bg[s] || seen[s] || !bgish(s)) continue;
        var part = new List<int>();
        var pq = new Queue<int>();
        seen[s] = true; pq.Enqueue(s);
        while (pq.Count > 0) {
          int i = pq.Dequeue(); part.Add(i); int x = i % w, y = i / w;
          int[] nb = { x > 0 ? i-1 : -1, x < w-1 ? i+1 : -1, y > 0 ? i-w : -1, y < h-1 ? i+w : -1 };
          foreach (int n in nb) if (n >= 0 && !bg[n] && !seen[n] && bgish(n)) { seen[n] = true; pq.Enqueue(n); }
        }
        if (part.Count >= holeMin) foreach (int i in part) bg[i] = true;
      }
    }
    int minX = w, minY = h, maxX = -1, maxY = -1;
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
      int i = y*w+x;
      if (bg[i]) { px[i*4+3] = 0; continue; }
      bool edge = (x > 0 && bg[i-1]) || (x < w-1 && bg[i+1]) || (y > 0 && bg[i-w]) || (y < h-1 && bg[i+w]);
      if (edge && px[i*4+3] == 255) {
        // soften the rim: pixels blended with the white backdrop get partial alpha, and the white is taken back out
        int b = px[i*4], g = px[i*4+1], r = px[i*4+2];
        double a = Math.Min(1.0, Math.Max(0.15, (765.0 - (r+g+b)) / 120.0));
        Func<int, byte> un = c => (byte)Math.Max(0, Math.Min(255, (c - 255 * (1 - a)) / a));
        px[i*4] = un(b); px[i*4+1] = un(g); px[i*4+2] = un(r); px[i*4+3] = (byte)(a * 255);
      }
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    return new[] { minX, minY, maxX, maxY };
  }
}
"@
if (-not ('Cutout' -as [type])) { Add-Type -TypeDefinition $src }

$dec = [System.Windows.Media.Imaging.BitmapDecoder]::Create([Uri]$In, 'PreservePixelFormat', 'OnLoad')
$frame = New-Object System.Windows.Media.Imaging.FormatConvertedBitmap($dec.Frames[0], [System.Windows.Media.PixelFormats]::Bgra32, $null, 0)
$w = $frame.PixelWidth; $h = $frame.PixelHeight
$px = New-Object byte[] ($w * $h * 4)
$frame.CopyPixels($px, $w * 4, 0)
$box = [Cutout]::Run($px, $w, $h, $Holes)
$pad = 6
$x0 = [Math]::Max(0, $box[0] - $pad); $y0 = [Math]::Max(0, $box[1] - $pad)
$x1 = [Math]::Min($w - 1, $box[2] + $pad); $y1 = [Math]::Min($h - 1, $box[3] + $pad)
$full = [System.Windows.Media.Imaging.BitmapSource]::Create($w, $h, 96, 96, [System.Windows.Media.PixelFormats]::Bgra32, $null, $px, $w * 4)
$crop = New-Object System.Windows.Media.Imaging.CroppedBitmap($full, (New-Object System.Windows.Int32Rect($x0, $y0, ($x1 - $x0 + 1), ($y1 - $y0 + 1))))
$s = $Height / $crop.PixelHeight
$sx = if ($Flip) { -$s } else { $s }   # -Flip mirrors sprites drawn facing left
$scaled = New-Object System.Windows.Media.Imaging.TransformedBitmap($crop, (New-Object System.Windows.Media.ScaleTransform($sx, $s)))
$enc = New-Object System.Windows.Media.Imaging.PngBitmapEncoder
$enc.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($scaled))
$fs = [System.IO.File]::Create($Out); $enc.Save($fs); $fs.Close()
"{0}: {1}x{2} -> crop {3}x{4} -> {5}x{6}, {7} bytes" -f (Split-Path $Out -Leaf), $w, $h, $crop.PixelWidth, $crop.PixelHeight, $scaled.PixelWidth, $scaled.PixelHeight, (Get-Item $Out).Length
