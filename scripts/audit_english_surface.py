#!/usr/bin/env python3
"""Read-only inventory of non-English surface text and region-specific providers.

This is an inventory, NOT a Chinese-language classifier or an automatic remover.
It reports Han code points (which also occur in Japanese and other languages)
and platform names for manual triage. Default exit status is zero.
"""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re

TEXT_SUFFIXES = {
    ".bat", ".css", ".html", ".js", ".json", ".jsx", ".md", ".mjs",
    ".py", ".ps1", ".sh", ".toml", ".ts", ".txt", ".vbs", ".vue",
    ".xml", ".yaml", ".yml",
}
SKIP_DIRS = {
    ".git", ".venv", "__pycache__", "node_modules", "dist", "release",
    "build", "tiktoken_cache", "tha_models", "vrm", "doc",
    "default_soulx_images",
}
SKIP_FILES = {"package-lock.json", "uv.lock"}
SKIP_PREFIXES = ("static/libs/", "static/source/", "static/fontawesome/")
HAN = re.compile(r"[\u3400-\u9fff\U00020000-\U0002A6DF]")
PLATFORM = re.compile(
    r"\b(?:qq|wechat|weixin|feishu|dingtalk|bilibili|douyin|"
    r"weibo|kuaishou|xiaohongshu|modelscope|baidu|aliyun|"
    r"siliconflow|alipay|taobao)\b",
    re.IGNORECASE,
)
MODEL_CONTEXT = re.compile(
    r"system.?prompt|generic.?system.?prompt|content_append|"
    r"template|lore|role.?prompt|tool.?description|"
    r"messages|instruct|prompt_text",
    re.IGNORECASE,
)


def category(path: str, line: str) -> str:
    lower = path.lower()
    if MODEL_CONTEXT.search(line) and (lower.endswith(".py") or "config/" in lower):
        return "model-facing-candidate"
    if "/locales/" in lower or lower.startswith("config/locales"):
        return "locale"
    if lower.endswith(".md") or lower.startswith(".github/"):
        return "documentation"
    if lower.startswith("static/"):
        return "interface"
    if lower.startswith("py/") or lower == "server.py":
        return "backend"
    return "other"


def sources(root: Path):
    for current, dirs, files in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS and not d.startswith(".cache"))
        folder = Path(current)
        for name in sorted(files):
            file = folder / name
            rel = file.relative_to(root).as_posix()
            if name in SKIP_FILES or any(rel.startswith(p) for p in SKIP_PREFIXES):
                continue
            if file.suffix.lower() not in TEXT_SUFFIXES:
                continue
            yield file, rel


def inspect(root: Path):
    findings = []
    examined = 0
    skipped_unreadable = []
    for file, rel in sources(root):
        try:
            content = file.read_text(encoding="utf-8")
        except (UnicodeError, OSError):
            skipped_unreadable.append(rel)
            continue
        examined += 1
        for number, line in enumerate(content.splitlines(), start=1):
            signals = []
            if HAN.search(line):
                signals.append("han")
            if PLATFORM.search(line):
                signals.append("region-platform")
            if not signals:
                continue
            findings.append({
                "file": rel,
                "line": number,
                "category": category(rel, line),
                "signals": signals,
                "excerpt": line.strip()[:240],
            })
    return examined, skipped_unreadable, findings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--json", type=Path, help="Write full machine-readable findings to this file")
    parser.add_argument("--limit", type=int, default=30, help="Maximum findings shown in console")
    parser.add_argument(
        "--fail-on-han", action="store_true",
        help="Exit 1 if any Han code points remain (only use when the scope is ready)",
    )
    args = parser.parse_args()
    root = args.root.resolve()
    if not root.is_dir():
        parser.error("Not a directory: " + str(root))

    examined, skipped, findings = inspect(root)
    by_signal = Counter(signal for item in findings for signal in item["signals"])
    by_category = Counter(item["category"] for item in findings)
    result = {
        "schema": 1,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "root": str(root),
        "read_only": True,
        "caveat": "Han characters are not sufficient to identify Chinese; human review required.",
        "examined_files": examined,
        "skipped_unreadable": skipped,
        "findings": findings,
        "counts_by_signal": dict(sorted(by_signal.items())),
        "counts_by_category": dict(sorted(by_category.items())),
    }
    if args.json:
        output = args.json if args.json.is_absolute() else root / args.json
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
        print("Report:", output)
    print("Files examined:", examined)
    print("Signal totals:", dict(by_signal))
    print("Categories:", dict(by_category))
    print("Unreadable files:", len(skipped))
    for item in findings[:max(0, args.limit)]:
        print(
            "{0}:{1} [{2} / {3}] {4}".format(
                item["file"], item["line"], item["category"],
                ",".join(item["signals"]), item["excerpt"]
            )
        )
    if args.fail_on_han and by_signal.get("han", 0):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
