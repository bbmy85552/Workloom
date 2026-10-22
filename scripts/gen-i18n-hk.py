#!/usr/bin/env python3
"""Generate src/lib/i18nHk.ts （粵語繁體詞庫） from the Simplified source strings
used as keys of exactEn in src/lib/i18n.ts.

Conversion: OpenCC s2hk, with Hong Kong term overrides applied on the
Simplified text before conversion （登入/登出/設定/儲存/搜尋/資料夾/預設/貼上）.
Also emits a per-character fallback map for strings not in the dictionary.
Requires: pip install --user opencc
"""
import json
import pathlib
import re

import opencc

ROOT = pathlib.Path(__file__).resolve().parent.parent
I18N = ROOT / "src" / "lib" / "i18n.ts"
OUT = ROOT / "src" / "lib" / "i18nHk.ts"

OVERRIDES = [
    ("退出登录", "登出"),
    ("登录", "登入"),
    ("设置", "設定"),
    ("保存", "儲存"),
    ("搜索", "搜尋"),
    ("文件夹", "資料夾"),
    ("默认", "預設"),
    ("粘贴", "貼上"),
]


def extract_keys(text: str) -> list[str]:
    start = text.index("const exactEn")
    end = text.index("const textPatterns")
    block = text[start:end]
    keys: list[str] = []
    for line in block.splitlines():
        m = re.match(r"^\s*(?:'((?:[^'\\]|\\.)*)'|([\u4e00-\u9fffA-Za-z0-9_]+))\s*:", line)
        if m:
            key = (m.group(1) or m.group(2)).replace("\\'", "'")
            keys.append(key)
    return keys


def main() -> None:
    cc = opencc.OpenCC("s2hk")
    keys = extract_keys(I18N.read_text(encoding="utf-8"))
    exact_hk: dict[str, str] = {}
    for key in keys:
        src = key
        for a, b in OVERRIDES:
            src = src.replace(a, b)
        value = cc.convert(src)
        if value != key:
            exact_hk[key] = value
    # 異體字統一（香港常用字形）
    for k in list(exact_hk):
        exact_hk[k] = exact_hk[k].replace('啓', '啟')
    char_hk: dict[str, str] = {}
    for cp in list(range(0x3400, 0xA000)) + list(range(0xF900, 0xFB00)):
        ch = chr(cp)
        converted = cc.convert(ch)
        if converted != ch and len(converted) == 1:
            char_hk[ch] = converted.replace('啓', '啟')
    header = (
        "// 粵語繁體詞庫：由 scripts/gen-i18n-hk.py 從 i18n.ts 的簡體原文自動生成，\n"
        "// 請勿手工編輯；原文有增減時重跑該腳本即可。\n"
    )
    body = (
        header
        + "export const exactHk: Record<string, string> = "
        + json.dumps(exact_hk, ensure_ascii=False, indent=1)
        + ";\n\nexport const charHk: Record<string, string> = "
        + json.dumps(char_hk, ensure_ascii=False, indent=1)
        + ";\n"
    )
    OUT.write_text(body, encoding="utf-8")
    print(f"keys={len(keys)} exactHk={len(exact_hk)} charHk={len(char_hk)} -> {OUT}")


if __name__ == "__main__":
    main()
