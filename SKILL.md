---
name: raw2jpg
description: |
  Convert camera RAW files (ARW, CR2, CR3, NEF, RAF, ORF, DNG, and 10+ more formats) to JPEG with quality and resize controls.
  Use this skill when the user wants to convert RAW photos, batch process camera files, resize RAW images, or export RAW files as JPEG.
  Also activate when the user mentions ARW, CR2, NEF, DNG, or any camera RAW format and wants to convert, compress, or resize them.
---

# raw2jpg

CLI tool for batch converting camera RAW files to JPEG. Runs via `npx` — no global install needed.

## When to Use

- User has camera RAW files (ARW, CR2, CR3, NEF, RAF, ORF, DNG, etc.) and wants JPEG output
- User wants to batch convert an entire directory of RAW photos
- User needs to resize or compress RAW photos for web, sharing, or archival
- User mentions any camera RAW format and wants to convert it

## Command

```bash
npx raw2jpg [options] <input>
```

`<input>` is a file path or directory. When given a directory, all RAW files inside (including subdirectories) are converted.

## Options

| Option | Description | Default |
|---|---|---|
| `-o, --output <dir>` | Output directory | `./jpg_output` |
| `-q, --quality <n>` | JPEG quality 1-100 | `90` |
| `-s, --size <preset>` | `original`, `4k`, `2k`, `hd`, `fhd` | `original` |
| `-w, --width <n>` | Max width in px (keeps aspect ratio) | — |
| `--height <n>` | Max height in px (keeps aspect ratio) | — |
| `-c, --concurrency <n>` | Files to convert in parallel | CPU cores |
| `--overwrite` | Overwrite existing output files | `false` |
| `--dry-run` | Preview without writing files | `false` |
| `-v, --verbose` | Show detailed logs | `false` |

## Size Presets

- `original` — no resize
- `4k` — longest edge 3840px
- `2k` — longest edge 2048px (good for web/SNS)
- `hd` / `fhd` — longest edge 1920px

`--size` and `--width`/`--height` cannot be combined.

## Supported RAW Formats

ARW (Sony), CR2/CR3 (Canon), NEF/NRW (Nikon), RAF (Fujifilm), ORF (Olympus), RW2 (Panasonic), PEF (Pentax), SRW (Samsung), DNG (Adobe), 3FR (Hasselblad), KDC/DCR (Kodak), ERF (Epson), RWL (Leica), RAW (generic).

## Examples

```bash
# Convert all RAW files in a folder
npx raw2jpg ./photos

# 2K resize with 85% quality to a specific output folder
npx raw2jpg ./photos --size 2k -q 85 -o ./exports

# Convert a single file
npx raw2jpg ./DSC05728.ARW

# Preview what would be converted
npx raw2jpg ./photos --dry-run
```

## Requirements

- **Node.js >= 18**
- **macOS**: No extra setup — uses built-in `sips`
- **Linux/Windows**: Requires `dcraw` (`apt install dcraw` or `brew install dcraw`)

## Behavior Notes

- Output files are always `.jpg`
- Existing files are skipped unless `--overwrite` is passed
- If a single file fails, the rest of the batch continues; failures are reported at the end
- Progress bar is shown during batch conversion
- Completion summary includes file count, total size, and compression ratio
