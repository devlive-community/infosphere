#!/usr/bin/env bash
# 发布版本：为当前版本打 v 标签并推送，触发 Release 工作流构建产物并创建 GitHub Release。
# Release Note 优先取自 CHANGELOG.md 中该版本的条目，缺失时回退到提交历史（见 .github/workflows/release.yml）。
#
# 用法：
#   deploy/release.sh            # 使用 handler_setup.go 中的当前版本
#   deploy/release.sh 2026.0.1   # 指定版本号
set -euo pipefail
cd "$(dirname "$0")/.."

RELEASE_BRANCH="dev"
SETUP_GO="server/internal/app/handler_setup.go"

VERSION="${1:-$(grep -oE 'var Version = "[0-9.]+"' "$SETUP_GO" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)}"
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "无法确定版本号（收到：${VERSION}）" >&2
  exit 1
fi
TAG="v${VERSION}"

# ── 预检 ──
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" != "$RELEASE_BRANCH" ]; then
  echo "当前分支为 ${BRANCH}，请切换到默认分支 ${RELEASE_BRANCH} 再发布" >&2
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "工作区有未提交改动，请先提交后再发布：" >&2
  git status --short
  exit 1
fi
git fetch --quiet origin "$RELEASE_BRANCH"
if [ "$(git rev-parse HEAD)" != "$(git rev-parse "origin/$RELEASE_BRANCH")" ]; then
  echo "本地 $RELEASE_BRANCH 与 origin 不一致，请先 git push origin $RELEASE_BRANCH" >&2
  exit 1
fi
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "标签 $TAG 已存在，请先 deploy/new-version.sh 开启新版本" >&2
  exit 1
fi

# ── 版本一致性预检：各版本载体应与发布版本一致，避免产物版本漂移 ──
check_version() {
  local label="$1" file="$2" pattern="$3" got
  got="$(grep -Eom1 "$pattern" "$file" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)"
  if [ "$got" != "$VERSION" ]; then
    echo "版本不一致：$label（$file）为 ${got:-未找到}，应为 $VERSION" >&2
    echo "请先运行 deploy/new-version.sh 统一版本号" >&2
    exit 1
  fi
}
check_version "Go var Version" "$SETUP_GO" 'var Version = "[0-9.]+"'
check_version "web/package.json" "app/web/package.json" '"version": "[0-9.]+"'
check_version "desktop/package.json" "app/desktop/package.json" '"version": "[0-9.]+"'
check_version "tauri.conf.json" "app/desktop/src-tauri/tauri.conf.json" '"version": "[0-9.]+"'
check_version "Cargo.toml" "app/desktop/src-tauri/Cargo.toml" '^version = "[0-9.]+"'

# ── CHANGELOG 预检：Release Note 取自 CHANGELOG.md 中该版本的条目 ──
NOTES="$(awk -v ver="$VERSION" '
  $0 ~ ("^## \\[" ver "\\]") { grab = 1; next }
  grab && /^## \[/ { exit }
  grab { print }
' CHANGELOG.md)"
if [ -z "$(printf '%s' "$NOTES" | tr -d '[:space:]')" ] || printf '%s' "$NOTES" | grep -q '待补充'; then
  echo "⚠️  CHANGELOG.md 尚无 ${VERSION} 的有效条目（或仍为「待补充」），Release Note 将回退到提交历史。" >&2
  echo "    建议先运行 deploy/new-version.sh 生成草稿，整理 CHANGELOG.md 后再发布。" >&2
fi

echo "将发布 ${TAG}（版本 ${VERSION}）到 $(git remote get-url origin)"
read -r -p "确认发布？(y/N) " ans
case "$ans" in
  y | Y) ;;
  *) echo "已取消"; exit 0 ;;
esac

git tag -a "$TAG" -m "Release $VERSION"
git push origin "$TAG"

echo "✅ 已推送标签 ${TAG}，Release 工作流开始构建并发布。"
echo "💡 记得运行 deploy/new-version.sh 开启下一版本（统一 bump 版本号并转正 CHANGELOG）。"
if command -v gh >/dev/null 2>&1; then
  echo "查看进度：gh run watch"
  gh run list --workflow=Release --limit=1 2>/dev/null || true
else
  echo "在 GitHub Actions 页面查看 Release 工作流进度。"
fi
