#!/usr/bin/env python3
"""Read-only inventory of source text, dependency metadata, and packaged assets.

Han code points and provider names are review signals, not a language classifier
or a determination that a package is unsafe. No source is modified.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import subprocess

TEXT_SUFFIXES = {
    ".bat", ".cfg", ".css", ".csv", ".html", ".ini", ".js", ".json", ".jsx",
    ".lock", ".md", ".mjs", ".plist", ".py", ".ps1", ".rst", ".sh", ".spec",
    ".svg", ".toml", ".ts", ".txt", ".vbs", ".vue", ".xml", ".yaml", ".yml",
    ".cjs", ".less", ".scss", ".sass", ".map", ".gitattributes",
}
TEXT_NAMES = {"dockerfile", "makefile", "license", "notice", "authors", "copying",
              ".dockerignore", ".gitignore", ".gitattributes", ".python-version"}
SKIP_DIRS = {
    ".git", ".venv", "__pycache__", "node_modules", "dist", "release", "build",
}
LOCKFILES = {"package-lock.json", "uv.lock", "pnpm-lock.yaml", "yarn.lock"}
VENDORED_PREFIXES = ("static/libs/", "static/fontawesome/", "tiktoken_cache/")
ASSET_PREFIXES = ("static/source/", "vrm/", "tha_models/", "default_soulx_images/", "doc/")
FIRST_PARTY_SCOPES = {"project-source", "bundled-skill", "packaged-asset"}
MAX_TEXT_BYTES = 8 * 1024 * 1024
HAN = re.compile(r"[\u3400-\u9fff\uf900-\ufaff\U00020000-\U0002EBEF\U00030000-\U000323AF]")
PLATFORM = re.compile(
    r"(?<![a-z0-9])(?:qq|qq-botpy|wechat|wechatbot|weixin|wecom|feishu|lark-oapi|"
    r"dingtalk|bilibili|douyin|weibo|kuaishou|xiaohongshu|modelscope|baidu|aliyun|"
    r"siliconflow|alipay|taobao|gitee|funasr|smms|volcengine|bocha|xunfei|"
    r"dashscope|hunyuan|qianfan|baichuan|zhipuai|hf-mirror|npmmirror|"
    r"super-agent-party\.github\.io)(?![a-z0-9])",
    re.IGNORECASE,
)
MODEL_CONTEXT = re.compile(
    r"system.?prompt|generic.?system.?prompt|content_append|template|lore|"
    r"role.?prompt|tool.?description|messages|instruct|prompt_text",
    re.IGNORECASE,
)


def scope(path: str) -> str:
    lower = path.lower()
    name = Path(lower).name
    if name in LOCKFILES:
        return "dependency-lock"
    if lower.startswith(VENDORED_PREFIXES):
        return "vendored"
    if (lower.startswith("license-third-party/") or lower == "contributing.md"
            or name.split(".", 1)[0] in {"license", "notice", "authors", "copying"}):
        return "legal-attribution"
    if lower.startswith(("tests/", "docs/agent-creation/")) or lower == "scripts/audit_english_surface.py":
        return "test-or-history"
    if lower.startswith(ASSET_PREFIXES):
        return "packaged-asset"
    if lower.startswith("skills/"):
        return "bundled-skill"
    return "project-source"


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


def sources(root: Path, tracked_only: bool = False):
    if tracked_only:
        result = subprocess.run(
            ["git", "-C", str(root), "ls-files", "-z"],
            check=True, stdout=subprocess.PIPE,
        )
        for rel in sorted(set(os.fsdecode(p) for p in result.stdout.split(b"\0") if p)):
            file = root / rel
            yield file, Path(rel).as_posix()
        return
    for current, dirs, files in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS and not d.startswith(".cache"))
        folder = Path(current)
        for name in sorted(files):
            file = folder / name
            yield file, file.relative_to(root).as_posix()


def inspect(root: Path, tracked_only: bool = False):
    findings = []
    examined = 0
    skipped_unreadable = []
    excluded = []
    scope_counts = Counter()
    for file, rel in sources(root, tracked_only):
        group = scope(rel)
        scope_counts[group] += 1
        path_signals = []
        if HAN.search(rel):
            path_signals.append("han-path")
        if PLATFORM.search(rel):
            path_signals.append("region-platform-path")
        if path_signals:
            findings.append({
                "file": rel, "line": None, "category": "filename",
                "scope": group, "signals": path_signals, "excerpt": rel,
            })
        if file.is_symlink() or not file.is_file():
            excluded.append({"file": rel, "scope": group, "reason": "not-regular-file"})
            continue
        if file.suffix.lower() not in TEXT_SUFFIXES and file.name.lower() not in TEXT_NAMES:
            excluded.append({"file": rel, "scope": group, "reason": "non-text-or-unrecognized-format"})
            continue
        try:
            if file.stat().st_size > MAX_TEXT_BYTES:
                excluded.append({"file": rel, "scope": group, "reason": "text-size-limit"})
                continue
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
            if signals:
                findings.append({
                    "file": rel, "line": number, "category": category(rel, line),
                    "scope": group, "signals": signals, "excerpt": line.strip()[:240],
                })
    return examined, skipped_unreadable, findings, excluded, scope_counts


def summarize(findings):
    by_file = defaultdict(Counter)
    by_scope = defaultdict(Counter)
    for item in findings:
        by_file[(item["scope"], item["file"])].update(item["signals"])
        by_scope[item["scope"]].update(item["signals"])
    ranked = [
        {"scope": group, "file": file, "counts": dict(sorted(counts.items()))}
        for (group, file), counts in by_file.items()
    ]
    priority = {
        "project-source": 0, "bundled-skill": 1, "packaged-asset": 2,
        "dependency-lock": 3, "vendored": 4, "legal-attribution": 5, "test-or-history": 6,
    }
    ranked.sort(key=lambda item: (
        priority.get(item["scope"], 99),
        -item["counts"].get("han", 0),
        -sum(item["counts"].values()), item["file"],
    ))
    return ranked, {group: dict(sorted(counts.items())) for group, counts in sorted(by_scope.items())}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--json", type=Path, help="Write the machine-readable inventory")
    parser.add_argument("--limit", type=int, default=30, help="Maximum ranked files shown in console")
    parser.add_argument("--tracked-only", action="store_true", help="Inspect Git-tracked paths only")
    parser.add_argument("--fail-on-first-party-han", action="store_true",
                        help="Fail on Han text/paths or unreadable text in first-party source, skills or assets")
    parser.add_argument("--fail-on-han", action="store_true", help="Exit 1 if any Han signal remains in the scanned scope")
    args = parser.parse_args()
    root = args.root.resolve()
    if not root.is_dir():
        parser.error("Not a directory: " + str(root))

    try:
        examined, skipped, findings, excluded, scope_counts = inspect(root, args.tracked_only)
    except (OSError, subprocess.CalledProcessError) as exc:
        parser.error("Unable to enumerate tracked paths: " + str(exc))

    by_signal = Counter(signal for item in findings for signal in item["signals"])
    by_category = Counter(item["category"] for item in findings)
    ranked, by_scope = summarize(findings)
    result = {
        "schema": 2,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "root": str(root),
        "read_only": True,
        "tracked_only": args.tracked_only,
        "caveat": "Text and filename signals require manual review. Binary asset contents and excluded files are not inspected.",
        "examined_files": examined,
        "paths_by_scope": dict(sorted(scope_counts.items())),
        "skipped_unreadable": skipped,
        "excluded": excluded,
        "findings": findings,
        "counts_by_signal": dict(sorted(by_signal.items())),
        "counts_by_category": dict(sorted(by_category.items())),
        "counts_by_scope": by_scope,
        "ranked_files": ranked,
    }
    if args.json:
        output = args.json if args.json.is_absolute() else root / args.json
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
        print("Report:", output)
    print("Text files examined:", examined)
    print("Signal totals:", dict(by_signal))
    print("Scopes:", json.dumps(by_scope, sort_keys=True))
    print("Unreadable files:", len(skipped))
    print("Excluded paths requiring separate review:", len(excluded))
    print("Ranked files:")
    for item in ranked[:max(0, args.limit)]:
        print("{scope}: {file}: {counts}".format(**item))
    if args.fail_on_first_party_han:
        violations = [item for item in findings if item["scope"] in FIRST_PARTY_SCOPES
                      and {"han", "han-path"}.intersection(item["signals"])]
        unreadable = [path for path in skipped if scope(path) in FIRST_PARTY_SCOPES]
        oversized = [item["file"] for item in excluded if item["scope"] in FIRST_PARTY_SCOPES
                     and item["reason"] == "text-size-limit"]
        if violations or unreadable or oversized:
            print("First-party English gate failed:", len(violations), "Han findings,",
                  len(unreadable), "unreadable text files,", len(oversized), "oversized text files")
            return 1
        print("First-party English gate passed (text and paths only).")
    if args.fail_on_han and (by_signal.get("han", 0) or by_signal.get("han-path", 0)):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
