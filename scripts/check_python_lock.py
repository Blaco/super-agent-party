#!/usr/bin/env python3
"""Inspect a resolved uv lockfile for retired SDKs and unexpected registry sources."""

import argparse
import json
from pathlib import Path
import re
import tomllib
from urllib.parse import urlsplit

RETIRED = {
    "qq-botpy", "lark-oapi", "dingtalk-stream", "wechatbot-sdk",
    "wecom-aibot-python-sdk", "modelscope",
}
APPROVED_REGISTRIES = {"pypi.org"}
APPROVED_DOWNLOAD_HOSTS = {"pypi.org", "files.pythonhosted.org"}


def canonical(name):
    return re.sub(r"[-_.]+", "-", name).lower()


def inspect_lock(path):
    with path.open("rb") as stream:
        data = tomllib.load(stream)
    packages = data.get("package", [])
    if not packages:
        raise ValueError("No packages found in lockfile")
    retired = set()
    unexpected = set()
    for package in packages:
        name = canonical(package["name"])
        if name in RETIRED:
            retired.add(name)
        source = package.get("source", {})
        if source == {"virtual": "."} and name == "super-agent-party":
            continue
        registry = source.get("registry")
        if not isinstance(registry, str):
            unexpected.add(f"{name}: non-registry package source")
        else:
            parsed = urlsplit(registry)
            if parsed.scheme != "https" or parsed.hostname not in APPROVED_REGISTRIES:
                unexpected.add(f"{name}: registry {parsed.hostname or '(missing host)'}")
        artifacts = package.get("wheels", [])
        if package.get("sdist"):
            artifacts = [*artifacts, package["sdist"]]
        for artifact in artifacts:
            parsed = urlsplit(artifact.get("url", ""))
            if parsed.scheme != "https" or parsed.hostname not in APPROVED_DOWNLOAD_HOSTS:
                unexpected.add(f"{name}: download {parsed.hostname or '(missing host)'}")
            if not re.fullmatch(r"sha256:[0-9a-f]{64}", artifact.get("hash", "")):
                unexpected.add(f"{name}: missing or invalid SHA-256 artifact hash")
    return {
        "package_records": len(packages),
        "retired_packages": sorted(retired),
        "unexpected_sources": sorted(unexpected),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lock", type=Path, default=Path("uv.lock"))
    parser.add_argument("--json", type=Path)
    args = parser.parse_args()
    result = inspect_lock(args.lock)
    report = json.dumps(result, indent=2)
    print(report)
    if args.json:
        args.json.write_text(report + "\n", encoding="utf-8")
    return int(bool(result["retired_packages"] or result["unexpected_sources"]))


if __name__ == "__main__":
    raise SystemExit(main())
