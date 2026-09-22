"""Rebuild the downloadable extension without external dependencies."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

root = Path(__file__).resolve().parents[1] / "apps/admin/public/youtube-cookie-sync"
with ZipFile(root.with_suffix(".zip"), "w", ZIP_DEFLATED) as archive:
    for filename in ("manifest.json", "background.js", "content.js", "popup.html", "popup.js", "popup.css", "README.md"):
        entry = ZipInfo(f"youtube-cookie-sync/{filename}", (2026, 1, 1, 0, 0, 0))
        entry.compress_type = ZIP_DEFLATED
        entry.external_attr = 0o644 << 16
        archive.writestr(entry, (root / filename).read_bytes())
