# Design source assets

Not served. Anything in here is source artwork the app derives from, kept in
the repo for future edits but deliberately outside `public/` so it is not
shipped to every visitor.

## logo.png

The original 1024×1024 CaseMap lockup (icon + "casemap" + "Manager"), 1.36 MB.

Everything the app actually loads is derived from it and lives in `public/`:

| File | Size | Derived how |
|---|---|---|
| `logo-mark.png` | 4.2 KB | Icon cropped out (the wordmark is illegible at 32 px), dark outer glow cleared, squared, quantised |
| `logo-lockup.png` | 23 KB | Full lockup, glow cleared, trimmed to content, quantised |
| `favicon.ico` | 8 KB | From the mark, at 16/32/48 |
| `apple-touch-icon.png` | 20 KB | From the mark on an opaque white square — iOS renders alpha as black |

The glow matters: its faint-alpha pixels average 105/255 luminance, so left in
place it composites as grey fringing on the app's white surfaces.
