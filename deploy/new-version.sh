#!/usr/bin/env bash
# 开启新版本：统一 bump 各处版本号，并按提交历史生成 CHANGELOG 草稿。
#
# 用法：
#   deploy/new-version.sh            # 自增 patch（2026.0.0 -> 2026.0.1）
#   deploy/new-version.sh 2026.1.0   # 指定版本号
set -euo pipefail
cd "$(dirname "$0")/.."

SETUP_GO="server/internal/app/handler_setup.go"

current_version() {
  grep -oE 'var Version = "[0-9.]+"' "$SETUP_GO" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1
}

CUR="$(current_version)"
NEW="${1:-}"
if [ -z "$NEW" ]; then
  IFS='.' read -r y major patch <<<"$CUR"
  NEW="${y}.${major}.$((patch + 1))"
fi
if ! [[ "$NEW" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "版本号格式应为 YYYY.MAJOR.PATCH（例如 2026.0.1），收到：$NEW" >&2
  exit 1
fi

echo "当前版本 $CUR → 新版本 $NEW"

# ── 1. 统一更新版本号（perl 便于跨 macOS/Linux 原地编辑） ──
perl -pi -e "s/var Version = \"[0-9.]+\"/var Version = \"$NEW\"/" "$SETUP_GO"
perl -pi -e "s/\"version\": \"[0-9.]+\"/\"version\": \"$NEW\"/" \
  app/web/package.json app/desktop/package.json app/desktop/src-tauri/tauri.conf.json
perl -pi -e "s/^version = \"[0-9.]+\"/version = \"$NEW\"/m" app/desktop/src-tauri/Cargo.toml

# ── 2. 生成 CHANGELOG 草稿（自上个标签起的提交历史） ──
DATE="$(date +%Y-%m-%d)"
PREV="$(git describe --tags --match 'v*' --abbrev=0 2>/dev/null || git describe --tags --abbrev=0 2>/dev/null || true)"
if [ -n "$PREV" ]; then RANGE="${PREV}..HEAD"; else RANGE="HEAD"; fi
NOTES="$(git log --no-merges -n 100 --pretty='- %s' $RANGE)"
[ -n "$NOTES" ] || NOTES="- 待补充"

# 在首个 `## [` 版本段前插入新段（grep -m1 避免管道 SIGPIPE）
tmp="$(mktemp)"
line="$(grep -m1 -n '^## \[' CHANGELOG.md | cut -d: -f1 || true)"
if [ -n "$line" ]; then
  {
    head -n "$((line - 1))" CHANGELOG.md
    printf '## [%s] - %s\n\n%s\n\n' "$NEW" "$DATE" "$NOTES"
    tail -n "+${line}" CHANGELOG.md
  } >"$tmp"
else
  { cat CHANGELOG.md; printf '\n## [%s] - %s\n\n%s\n' "$NEW" "$DATE" "$NOTES"; } >"$tmp"
fi
mv "$tmp" CHANGELOG.md

echo
echo "已更新版本号并写入 CHANGELOG 草稿。请检查后提交并发布："
echo "  git diff"
echo "  git commit -am \"chore: release $NEW\" && git push"
echo "  deploy/release.sh          # 打 v$NEW 标签并触发发布"
