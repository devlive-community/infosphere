#!/usr/bin/env bash
# 发布版本：为当前版本打 v 标签并推送，触发 Release 工作流构建产物并创建 GitHub Release。
# Release Note 默认取自上一个标签以来的提交历史（见 .github/workflows/release.yml）。
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
  echo "无法确定版本号（收到：$VERSION）" >&2
  exit 1
fi
TAG="v${VERSION}"

# ── 预检 ──
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" != "$RELEASE_BRANCH" ]; then
  echo "当前分支为 $BRANCH，请切换到默认分支 $RELEASE_BRANCH 再发布" >&2
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

echo "将发布 $TAG（版本 $VERSION）到 $(git remote get-url origin)"
read -r -p "确认发布？(y/N) " ans
case "$ans" in
  y | Y) ;;
  *) echo "已取消"; exit 0 ;;
esac

git tag -a "$TAG" -m "Release $VERSION"
git push origin "$TAG"

echo "✅ 已推送标签 $TAG，Release 工作流开始构建并发布。"
if command -v gh >/dev/null 2>&1; then
  echo "查看进度：gh run watch"
  gh run list --workflow=Release --limit=1 2>/dev/null || true
else
  echo "在 GitHub Actions 页面查看 Release 工作流进度。"
fi
