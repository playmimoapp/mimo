param([Parameter(Mandatory=$true)][string]$InputPath,[Parameter(Mandatory=$true)][string]$OutputPath)

Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies 'System.Drawing' -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;

public static class MimoCutout {
  private static bool IsBackdrop(Color c) {
    int max = Math.Max(c.R, Math.Max(c.G, c.B));
    int min = Math.Min(c.R, Math.Min(c.G, c.B));
    return max - min <= 3 && (c.R + c.G + c.B) / 3 >= 225;
  }

  public static void Run(string input, string output) {
    using (var source = new Bitmap(input))
    using (var result = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb)) {
      using (var graphics = Graphics.FromImage(result)) graphics.DrawImageUnscaled(source, 0, 0);
      int width = result.Width, height = result.Height;
      for(int y=0;y<height;y++) for(int x=0;x<width;x++) if(IsBackdrop(result.GetPixel(x,y))) result.SetPixel(x,y,Color.Transparent);
      result.Save(output, ImageFormat.Png);
    }
  }
}
'@

[MimoCutout]::Run($InputPath,$OutputPath)
