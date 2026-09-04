"""
Build the emoji font the app ships with.

WHY ship one at all. Every emoji in ChipStack is a person: the avatar beside a
name at the table, the crown on the chip leader, the row on the big screen. The
device's own emoji font draws those, and what it draws varies wildly — an older
Android paints flat two-tone shapes where a current one paints a modelled glyph,
a TV browser often has no colour emoji at all, and the same night looks different
on the phone and on the screen behind it. So the app carries its own: Google's
Noto Color Emoji in its COLRv1 (vector) build, subset to the glyphs this app can
actually show.

WHY IT IS SAFE TO SUBSET. The set is closed and small: the avatar picker's list
plus the handful of emoji written into the UI. Anything outside it simply falls
through to the next family in `--font-emoji` — the device's own font — exactly as
before this file existed.

Run it after adding emoji to `src/components/EmojiPicker.tsx`:

    python scripts/build-emoji-font.py

Needs `fonttools` and `brotli` (`pip install fonttools brotli`) and the network,
once, to fetch the upstream font. The built .woff2 is committed, so a normal
build and CI never run this.
"""

from __future__ import annotations

import pathlib
import re
import subprocess
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
OUT = SRC / "assets" / "chipstack-emoji.woff2"
CACHE = ROOT / "node_modules" / ".cache" / "noto-colrv1.ttf"

# The COLRv1 build: outlines and gradients rather than the 10 MB sheet of bitmaps,
# which is what makes a subset small enough to ship and sharp at any size.
UPSTREAM = "https://raw.githubusercontent.com/googlefonts/noto-emoji/main/fonts/Noto-COLRv1.ttf"

# Everything from U+1F000 up is emoji and nothing else, so it is taken wholesale.
# Below that, emoji share their blocks with the arrows, ticks and crosses used as
# plain UI glyphs — a font that answered for those would turn a ✕ into a picture —
# so the low range is an explicit list instead of a range.
LOW_ALLOWED = set(
    "♠♥♦♣"  # card suits
    "⚓⚔⚖⛵⚡✨☕☄☠⭐"
    "⌛⏳⏱⚽⚾☂☁☀"
)
# The joiners themselves: without these the multi-codepoint sequences (🏴‍☠️,
# 😮‍💨) cannot be assembled even though every part of them is present.
JOINERS = set("‍️⃣")


def used_emoji() -> set[str]:
    """Every emoji codepoint written anywhere in the app's source."""
    found: set[str] = set()
    for path in SRC.rglob("*"):
        if path.suffix not in {".ts", ".tsx", ".css"} or not path.is_file():
            continue
        for ch in path.read_text(encoding="utf-8"):
            if ord(ch) >= 0x1F000 or ch in LOW_ALLOWED or ch in JOINERS:
                found.add(ch)
    return found


def fetch_upstream() -> pathlib.Path:
    if CACHE.exists():
        return CACHE
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    print(f"downloading {UPSTREAM}")
    with urllib.request.urlopen(UPSTREAM, timeout=180) as r, CACHE.open("wb") as f:
        f.write(r.read())
    return CACHE


def main() -> int:
    chars = used_emoji()
    if not chars:
        print("no emoji found in src/ — refusing to build an empty font", file=sys.stderr)
        return 1
    print(f"{len(chars)} codepoints in use")

    src_font = fetch_upstream()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    text = "".join(sorted(chars))
    cmd = [
        sys.executable, "-m", "fontTools.subset", str(src_font),
        f"--text={text}",
        f"--output-file={OUT}",
        "--flavor=woff2",
        # ZWJ sequences are ligatures: drop the layout tables and 🏴‍☠️ comes out
        # as a black flag followed by a skull.
        "--layout-features=*",
        "--COLR-branch",
        "--no-hinting",
        "--desubroutinize",
        "--name-IDs=*",
        "--drop-tables+=DSIG",
    ]
    print("subsetting…")
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        # --COLR-branch only exists on some fonttools builds; it is an optimisation,
        # not a requirement, so a second pass without it is not a fallback to a
        # worse font — it is the same font, subset slightly less aggressively.
        cmd.remove("--COLR-branch")
        proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        print(proc.stdout + proc.stderr, file=sys.stderr)
        return proc.returncode

    kb = OUT.stat().st_size / 1024
    print(f"wrote {OUT.relative_to(ROOT)} — {kb:.0f} KB")
    if kb > 900:
        print("that is bigger than the whole app's main chunk; check the codepoint list", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
