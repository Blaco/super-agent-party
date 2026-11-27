#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
TTS input robustness normalizer (not semantic text normalization)

Goals
----
1. Perform robustness cleanup only; do not expand numbers, units, dates or currencies semantically.
2. Protect high-risk tokens such as .map, app.js.map, v2.3.1, URLs, email addresses, mentions and hashtags.
3. Convert square brackets, braces and equivalent East Asian quotation brackets into double-quoted content.
4. Replace structural punctuation rather than deleting it:
   - Convert East Asian quotation brackets into double-quoted content.
   - Remove title brackets only for standalone headings; retain embedded titles.
   - Convert long dashes and repeated hyphens into sentence boundaries.
5. Apply gentle normalization to common social-media punctuation noise:
   - `...... / ……` -> `。`
   - `？？？！！！` -> `？！`
   - `！！！` -> `！`
6. Handle spaces according to writing system:
   - Collapse consecutive spaces inside Latin-script text.
   - Remove spaces inside Han and Japanese kana spans.
   - Preserve or insert one space between Han/kana and Latin or protected tokens.
   - Do not force spaces between Han/kana and numeric tokens.
   - Replace ordinary underscores with spaces; preserve underscores inside protected URLs, email, mentions, hashtags and filenames.
7. Handle Markdown and line breaks lightly:
   - `[text](url)` -> `text url`
   - Strip heading, blockquote and list prefixes.
   - Convert line breaks to sentence boundaries using the ideographic full stop.
8. In the shared WeTextProcessing pipeline, the Chinese branch additionally processes individual ASCII hyphens
   to prevent semantic normalization from reading them as subtraction. The upstream text_normalization_pipeline.py convention is:
   - Preserve digit-hyphen-digit sequences such as 10-3 and 2024-05-01.
   - Preserve explicit negative signs, including -2, x=-2 and (-2).
   - Replace hyphens between Chinese text spans with a pause boundary.
   - Replace other nonnumeric hyphens with spaces: A-B, A-100, GPU-A100, TTS-demo,
     and mixed Han/Latin spans.
   - Spaces surrounding a hyphen do not change the classification.
   - This rule applies only to the Chinese WeText branch; English uses native WeText behavior,
     for example, is -2 becomes is negative two.

Non-goals
------
1. Do not determine pronunciation.
2. Do not implement semantic WeText normalization directly in this script; shared pipeline preprocessing is separate.
3. Do not interpret HTML, SSML or semantic tags.
"""

from __future__ import annotations

import re
import unicodedata


# ---------------------------
# Constants and regular expressions
# ---------------------------

# Scripts that do not require whitespace word segmentation: Han and Japanese kana
_CJK_CHARS = r"\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff"
_CJK = f"[{_CJK_CHARS}]"

# Protected-span placeholder
_PROT = r"___PROT\d+___"

# High-risk tokens to protect
_URL_RE = re.compile(r"https?://[^\s\u3000，。！？；、）】》〉」』]+")
_EMAIL_RE = re.compile(r"(?<![\w.+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?![\w.-])")
_MENTION_RE = re.compile(r"(?<![A-Za-z0-9_])@[A-Za-z0-9_]{1,32}")
_REDDIT_RE = re.compile(r"(?<![A-Za-z0-9_])(?:u|r)/[A-Za-z0-9_]+")
_HASHTAG_RE = re.compile(r"(?<![A-Za-z0-9_])#(?!\s)[^\s#]+")

# `.map` / `.env` / `.gitignore`
_DOT_TOKEN_RE = re.compile(r"(?<![A-Za-z0-9_])\.(?=[A-Za-z0-9._-]*[A-Za-z0-9])[A-Za-z0-9._-]+")

# Examples: app.js.map, index.d.ts, v2.3.1 and foo/bar-baz.py
# Plain snake_case text containing only underscores is not a high-risk token,
# so underscore-to-space conversion can apply; actual paths typically contain punctuation that protects them.
_FILELIKE_RE = re.compile(
    r"(?<![A-Za-z0-9_])"
    r"(?=[A-Za-z0-9._/+:-]*[A-Za-z])"
    r"(?=[A-Za-z0-9._/+:-]*[./+:-])"
    r"[A-Za-z0-9][A-Za-z0-9._/+:-]*"
    r"(?![A-Za-z0-9_])"
)

# Mixed-script boundary tokens must contain a Latin letter or be a protected token
_LATINISH = rf"(?:{_PROT}|(?=[A-Za-z0-9._/+:-]*[A-Za-z])[A-Za-z0-9][A-Za-z0-9._/+:-]*)"

# Zero-width characters
_ZERO_WIDTH_RE = re.compile(r"[\u200b-\u200d\ufeff]")
_TRAILING_CLOSERS = set('"\')]}）】》〉」』”’')


# ---------------------------
# Main function
# ---------------------------

def normalize_tts_text(text: str) -> str:
    """Normalize TTS input for robustness."""
    text = _base_cleanup(text)
    text = _normalize_markdown_and_lines(text)
    text = _normalize_flow_arrows(text)
    text, protected = _protect_spans(text)
    text = _normalize_visible_underscores(text)

    text = _normalize_spaces(text)
    text = _normalize_structural_punctuation(text)
    text = _normalize_repeated_punctuation(text)
    text = _normalize_spaces(text)

    text = _restore_spans(text, protected)
    text = text.strip()
    return _ensure_terminal_punctuation_by_line(text)


# ---------------------------
# Normalization rules
# ---------------------------

def _base_cleanup(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\u3000", " ")
    text = _ZERO_WIDTH_RE.sub("", text)

    cleaned = []
    for ch in text:
        cat = unicodedata.category(ch)
        if ch in "\n\t " or not cat.startswith("C"):
            cleaned.append(ch)
    return "".join(cleaned)


def _normalize_markdown_and_lines(text: str) -> str:
    # Markdown links: [text](url) -> text url
    text = re.sub(r"\[([^\[\]]+?)\]\((https?://[^)\s]+)\)", r"\1 \2", text)

    lines = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue

        line = re.sub(r"^#{1,6}\s+", "", line)   # Heading
        line = re.sub(r"^>\s+", "", line)        # Blockquote
        line = re.sub(r"^[-*+]\s+", "", line)    # Unordered list
        line = re.sub(r"^\d+[.)]\s+", "", line)  # Ordered list
        lines.append(line)

    if not lines:
        return ""

    merged: list[str] = [lines[0]]
    for line in lines[1:]:
        previous = merged[-1]
        merged[-1] = _ensure_terminal_punctuation(previous)
        merged.append(line)
    return "".join(merged)


def _protect_spans(text: str) -> tuple[str, list[str]]:
    protected: list[str] = []

    def repl(match: re.Match[str]) -> str:
        idx = len(protected)
        protected.append(match.group(0))
        return f"___PROT{idx}___"

    for pattern in (
        _URL_RE,
        _EMAIL_RE,
        _MENTION_RE,
        _REDDIT_RE,
        _HASHTAG_RE,
        _DOT_TOKEN_RE,
        _FILELIKE_RE,
    ):
        text = pattern.sub(repl, text)

    return text, protected


def _restore_spans(text: str, protected: list[str]) -> str:
    for idx, original in enumerate(protected):
        text = text.replace(f"___PROT{idx}___", original)
    return text


def _normalize_visible_underscores(text: str) -> str:
    parts = re.split(rf"({_PROT})", text)
    return "".join(
        part if re.fullmatch(_PROT, part) else part.replace("_", " ")
        for part in parts
    )


def _normalize_flow_arrows(text: str) -> str:
    return re.sub(
        r"\s*(?:<[-=]+>|[-=]+>|<[-=]+|[→←↔⇒⇐⇔⟶⟵⟷⟹⟸⟺↦↤↪↩])\s*",
        "，",
        text,
    )


def _normalize_spaces(text: str) -> str:
    # Normalize whitespace
    text = re.sub(r"[ \t\r\f\v]+", " ", text)

    # Remove spaces within Han and Japanese spans
    text = re.sub(rf"({_CJK})\s+(?={_CJK})", r"\1", text)

    # Remove spaces between Han/kana and numbers
    text = re.sub(rf"({_CJK})\s+(?=\d)", r"\1", text)
    text = re.sub(rf"(\d)\s+(?={_CJK})", r"\1", text)

    # Preserve or insert a space at Han/kana boundaries with Latin or protected tokens
    text = re.sub(rf"({_CJK})(?=({_LATINISH}))", r"\1 ", text)
    text = re.sub(rf"(({_LATINISH}))(?={_CJK})", r"\1 ", text)

    # Collapse repeated spaces again
    text = re.sub(r" {2,}", " ", text)

    # Remove spaces around East Asian punctuation
    text = re.sub(r"\s+([，。！？；：、”’」』】）》])", r"\1", text)
    text = re.sub(r"([（【「『《“‘])\s+", r"\1", text)
    text = re.sub(r"([，。！？；：、])\s*", r"\1", text)

    # Remove spaces before ASCII punctuation; preserve following English spaces
    text = re.sub(r"\s+([,.;!?])", r"\1", text)

    return re.sub(r" {2,}", " ", text).strip()


def _normalize_structural_punctuation(text: str) -> str:
    # Convert structural brackets to double-quoted content
    text = re.sub(r"\[\s*([^\[\]]+?)\s*\]", r'"\1"', text)
    text = re.sub(r"\{\s*([^{}]+?)\s*\}", r'"\1"', text)
    text = re.sub(r"[【〖『「]\s*([^】〗』」]+?)\s*[】〗』」]", r'"\1"', text)

    # Handle title brackets only for standalone titles
    # Example: a standalone title followed by a long dash becomes separate sentences
    text = re.sub(
        r"(^|[。！？!?；;]\s*)《([^》]+)》(?=\s*(?:___PROT\d+___|[—–―-]{2,}|$|[。！？!?；;，,]))",
        r"\1\2",
        text,
    )

    # Convert flow and mapping arrows to an ideographic comma for speech
    text = _normalize_flow_arrows(text)

    # Convert long dashes and repeated hyphens to sentence boundaries
    text = re.sub(r"\s*(?:—|–|―|-){2,}\s*", "。", text)

    return text


def _normalize_repeated_punctuation(text: str) -> str:
    # Ellipses and consecutive full stops
    text = re.sub(r"(?:\.{3,}|…{2,}|……+)", "。", text)

    # Repeated punctuation of the same type
    text = re.sub(r"[。．]{2,}", "。", text)
    text = re.sub(r"[，,]{2,}", "，", text)
    text = re.sub(r"[!！]{2,}", "！", text)
    text = re.sub(r"[?？]{2,}", "？", text)

    # Reduce mixed question and exclamation marks to the corresponding pair
    def _mixed_qe(match: re.Match[str]) -> str:
        s = match.group(0)
        has_q = any(ch in s for ch in "?？")
        has_e = any(ch in s for ch in "!！")
        if has_q and has_e:
            return "？！"
        return "？" if has_q else "！"

    text = re.sub(r"[!?！？]{2,}", _mixed_qe, text)
    return text


def _ensure_terminal_punctuation(text: str) -> str:
    if not text:
        return text

    index = len(text) - 1
    while index >= 0 and text[index].isspace():
        index -= 1
    while index >= 0 and text[index] in _TRAILING_CLOSERS:
        index -= 1

    if index >= 0 and unicodedata.category(text[index]).startswith("P"):
        return text
    return text + "。"


def _ensure_terminal_punctuation_by_line(text: str) -> str:
    if not text:
        return text
    lines = text.split("\n")
    normalized_lines = [_ensure_terminal_punctuation(line.strip()) if line.strip() else "" for line in lines]
    return "\n".join(normalized_lines).strip()


# ---------------------------
# Tests
# ---------------------------

TEST_CASES = [
    # 1) Dot-leading tokens, filenames and version numbers
    (
        "dot_map_sentence",
        "2026 \u5e74 3 \u6708 31 \u65e5，\u5b89\u5168\u7814\u7a76\u5458 Chaofan Shou (@Fried_rice) \u53d1\u73b0 Anthropic \u7684 npm \u5305\u4e2d\u66b4\u9732\u4e86 .map \u6587\u4ef6，",
        "2026\u5e743\u670831\u65e5，\u5b89\u5168\u7814\u7a76\u5458 Chaofan Shou (@Fried_rice) \u53d1\u73b0 Anthropic \u7684 npm \u5305\u4e2d\u66b4\u9732\u4e86 .map \u6587\u4ef6，",
    ),
    ("dot_tokens", "\u522b\u628a .env、.npmrc、.gitignore \u63d0\u4ea4\u4e0a\u53bb。", "\u522b\u628a .env、.npmrc、.gitignore \u63d0\u4ea4\u4e0a\u53bb。"),
    ("file_names", "\u8bf7\u68c0\u67e5 bundle.min.js、package.json \u548c processing_moss_tts.py。", "\u8bf7\u68c0\u67e5 bundle.min.js、package.json \u548c processing_moss_tts.py。"),
    ("index_d_ts", "index.d.ts \u91cc\u4e5f\u6709\u540c\u6837\u7684\u95ee\u9898。", "index.d.ts \u91cc\u4e5f\u6709\u540c\u6837\u7684\u95ee\u9898。"),
    ("version_build", "Bug \u7684\u8ba8\u8bba\u53ef\u4ee5\u7cbe\u786e\u5230 v2.3.1 (Build 15)。", "Bug \u7684\u8ba8\u8bba\u53ef\u4ee5\u7cbe\u786e\u5230 v2.3.1 (Build 15)。"),
    ("version_rc", "3.0.0-rc.1 \u8fd8\u4e0d\u80fd\u4e0a\u751f\u4ea7。", "3.0.0-rc.1 \u8fd8\u4e0d\u80fd\u4e0a\u751f\u4ea7。"),
    ("jar_name", "fabric-api-0.91.3+1.20.2.jar \u9700\u8981\u5355\u72ec\u4e0b\u8f7d。", "fabric-api-0.91.3+1.20.2.jar \u9700\u8981\u5355\u72ec\u4e0b\u8f7d。"),

    # 2) URL / Email / mention / hashtag / Reddit
    ("url", "\u4ed3\u5e93\u5730\u5740\u662f https://github.com/instructkr/claude-code", "\u4ed3\u5e93\u5730\u5740\u662f https://github.com/instructkr/claude-code。"),
    ("email", "\u8054\u7cfb\u90ae\u7bb1：ops+tts@example.ai", "\u8054\u7cfb\u90ae\u7bb1：ops+tts@example.ai。"),
    ("mention", "@Fried_rice \u8bf4\u8fd9\u662f source map \u66b4\u9732。", "@Fried_rice \u8bf4\u8fd9\u662f source map \u66b4\u9732。"),
    ("reddit", "\u53bb r/singularity \u770b\u8ba8\u8bba。", "\u53bb r/singularity \u770b\u8ba8\u8bba。"),
    ("hashtag_chain", "#\u5f20\u96ea\u5cf0#\u5f20\u96ea\u5cf0[\u8bdd\u9898]#\u5f20\u96ea\u5cf0\u4e8b\u4ef6", "#\u5f20\u96ea\u5cf0#\u5f20\u96ea\u5cf0[\u8bdd\u9898]#\u5f20\u96ea\u5cf0\u4e8b\u4ef6。"),
    ("mention_hashtag_boundary", "\u5173\u6ce8@biscuit0228_\u5e76\u8f6c\u53d1#thetime_tbs", "\u5173\u6ce8 @biscuit0228_ \u5e76\u8f6c\u53d1 #thetime_tbs。"),

    # 3) Brackets and control tokens: convert to double quotes
    ("speaker_bracket", "[S1]\u4f60\u597d。[S2]\u6536\u5230。", '"S1"\u4f60\u597d。"S2"\u6536\u5230。'),
    ("event_bracket", "\u8bf7\u6a21\u4eff {whisper} \u7684\u8bed\u6c14\u8bf4“\u522b\u51fa\u58f0”。", '\u8bf7\u6a21\u4eff "whisper" \u7684\u8bed\u6c14\u8bf4“\u522b\u51fa\u58f0”。'),
    ("order_bracket", "\u8ba2\u5355\u53f7：[AB-1234-XYZ]", '\u8ba2\u5355\u53f7："AB-1234-XYZ"。'),

    # 4) Structural punctuation: convert to quotes or sentence boundaries
    ("struct_headline", "〖\u91cd\u78c5〗《\u65b0\u54c1\u53d1\u5e03》——\u73b0\u5728\u5f00\u59cb！", '"\u91cd\u78c5"《\u65b0\u54c1\u53d1\u5e03》。\u73b0\u5728\u5f00\u59cb！'),
    ("struct_notice", "【\u516c\u544a】\u4eca\u5929 20:00 \u7ef4\u62a4——\u9884\u8ba1 30 \u5206\u949f。", '"\u516c\u544a"\u4eca\u592920:00\u7ef4\u62a4。\u9884\u8ba130\u5206\u949f。'),
    ("struct_quote_chain", "『\u7279\u522b\u63d0\u9192』「\u4e0d\u8981\u5916\u4f20」", '"\u7279\u522b\u63d0\u9192""\u4e0d\u8981\u5916\u4f20"。'),
    ("struct_embedded_quote", "\u4ed6\u8bf4【\u91cd\u8981\u901a\u77e5】\u660e\u5929\u53d1\u5e03。", '\u4ed6\u8bf4"\u91cd\u8981\u901a\u77e5"\u660e\u5929\u53d1\u5e03。'),
    ("flow_arrow_chain", "\u8bf7\u6c42\u63a5\u5165 -> \u8eab\u4efd\u4e0e\u7b56\u7565\u5224\u5b9a -> \u57df\u670d\u52a1\u5904\u7406", "\u8bf7\u6c42\u63a5\u5165，\u8eab\u4efd\u4e0e\u7b56\u7565\u5224\u5b9a，\u57df\u670d\u52a1\u5904\u7406。"),
    ("flow_arrow_no_space", "A->B", "A，B。"),
    ("flow_arrow_unicode", "\u914d\u7f6e\u4e2d\u5fc3→\u63a8\u7406\u7f16\u6392→\u8fd0\u884c\u65f6\u6267\u884c", "\u914d\u7f6e\u4e2d\u5fc3，\u63a8\u7406\u7f16\u6392，\u8fd0\u884c\u65f6\u6267\u884c。"),

    # 5) Preserve embedded titles
    ("embedded_title", "\u6211\u559c\u6b22《\u54c8\u59c6\u96f7\u7279》\u8fd9\u672c\u4e66。", "\u6211\u559c\u6b22《\u54c8\u59c6\u96f7\u7279》\u8fd9\u672c\u4e66。"),

    # 6) Repeated punctuation and social-media noise
    ("noise_qe", "\u771f\u7684\u5047\u7684？？？！！！", "\u771f\u7684\u5047\u7684？！"),
    ("noise_ellipsis", "\u8fd9\u4e2a\u5305\u628a app.js.map \u4e5f\u53d1\u4e0a\u53bb\u4e86......\u592a\u79bb\u8c31\u4e86！！！", "\u8fd9\u4e2a\u5305\u628a app.js.map \u4e5f\u53d1\u4e0a\u53bb\u4e86。\u592a\u79bb\u8c31\u4e86！"),
    ("noise_ellipsis_cn", "【\u7cfb\u7edf\u63d0\u793a】\u8bf7\u6a21\u4eff{sad}\u4f4e\u6c89\u8bed\u6c14，\u8bf4“\u4eca\u5929\u4e0b\u96e8\u4e86……”", '"\u7cfb\u7edf\u63d0\u793a"\u8bf7\u6a21\u4eff"sad"\u4f4e\u6c89\u8bed\u6c14，\u8bf4“\u4eca\u5929\u4e0b\u96e8\u4e86。”'),

    # 7) Whitespace: collapse Latin spaces, remove Han spaces and retain mixed-script boundaries
    ("english_spaces", "This   is   a   test.", "This is a test."),
    ("chinese_spaces", "\u8fd9 \u662f　\u4e00 \u6bb5  \u542b\u6709\u591a\u79cd\u7a7a\u767d\u7684\u6587\u672c。", "\u8fd9\u662f\u4e00\u6bb5\u542b\u6709\u591a\u79cd\u7a7a\u767d\u7684\u6587\u672c。"),
    ("mixed_spaces_1", "\u8fd9\u662fAnthropic\u7684npm\u5305", "\u8fd9\u662f Anthropic \u7684 npm \u5305。"),
    ("mixed_spaces_2", "\u4eca\u5929update\u5230v2.3.1\u4e86", "\u4eca\u5929 update \u5230 v2.3.1 \u4e86。"),
    ("mixed_spaces_3", "\u5904\u7406app.js.map\u6587\u4ef6", "\u5904\u7406 app.js.map \u6587\u4ef6。"),
    ("underscore_plain_1", "foo_bar", "foo bar。"),
    ("underscore_plain_2", "\u4e2d\u6587_ABC", "\u4e2d\u6587 ABC。"),
    ("underscore_protected_mention", "\u5173\u6ce8@foo_bar", "\u5173\u6ce8 @foo_bar。"),

    # 8) Markdown, lists and line breaks
    ("markdown_link", "\u8be6\u60c5\u89c1 [release note](https://github.com/example/release)", "\u8be6\u60c5\u89c1 release note https://github.com/example/release。"),
    ("markdown_heading", "# I made a free open source app to help with markdown files", "I made a free open source app to help with markdown files。"),
    ("list_lines", "- \u4fee\u590d .map \u6cc4\u9732\n- \u53d1\u5e03 v2.3.1", "\u4fee\u590d .map \u6cc4\u9732。\u53d1\u5e03 v2.3.1。"),
    ("numbered_lines", "1. \u5b89\u88c5\u4f9d\u8d56\n2. \u8fd0\u884c\u6d4b\u8bd5\n3. \u53d1\u5e03 v2.3.1", "\u5b89\u88c5\u4f9d\u8d56。\u8fd0\u884c\u6d4b\u8bd5。\u53d1\u5e03 v2.3.1。"),
    ("newlines", "\u7b2c\u4e00\u884c\n\u7b2c\u4e8c\u884c\n\u7b2c\u4e09\u884c", "\u7b2c\u4e00\u884c。\u7b2c\u4e8c\u884c。\u7b2c\u4e09\u884c。"),

    # 9) Add terminal punctuation
    ("terminal_punct_plain", "\u4eca\u5929\u53d1\u5e03", "\u4eca\u5929\u53d1\u5e03。"),
    ("terminal_punct_quoted", '\u4ed6\u8bf4"\u4f60\u597d"', '\u4ed6\u8bf4"\u4f60\u597d"。'),
    ("terminal_punct_existing", "\u4eca\u5929\u53d1\u5e03。", "\u4eca\u5929\u53d1\u5e03。"),
    ("terminal_punct_newlines", "\u7b2c\u4e00\u884c\n\u7b2c\u4e8c\u884c。", "\u7b2c\u4e00\u884c。\u7b2c\u4e8c\u884c。"),
    ("terminal_punct_blank_lines", "\u7b2c\u4e00\u884c\n\n\u7b2c\u4e8c\u884c", "\u7b2c\u4e00\u884c。\u7b2c\u4e8c\u884c。"),

    # 10) Zero-width characters and idempotence
    ("zero_width_url", "\u8be6\u89c1 https://x.com/\u200bSafety", "\u8be6\u89c1 https://x.com/Safety。"),
]


def run_tests(verbose: bool = True) -> None:
    failed = []

    for name, text, expected in TEST_CASES:
        actual = normalize_tts_text(text)
        if actual != expected:
            failed.append((name, text, expected, actual))
            continue

        # A second normalization pass should not change the result
        second = normalize_tts_text(actual)
        if second != actual:
            failed.append((name + "_idempotence", actual, actual, second))

    if failed:
        lines = ["\nTEST FAILED:\n"]
        for name, text, expected, actual in failed:
            lines.append(f"[{name}]")
            lines.append(f"input   : {text}")
            lines.append(f"expected: {expected}")
            lines.append(f"actual  : {actual}")
            lines.append("")
        raise AssertionError("\n".join(lines))

    if verbose:
        print(f"All {len(TEST_CASES)} tests passed.")


if __name__ == "__main__":
    run_tests()
