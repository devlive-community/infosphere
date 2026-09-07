# InfoSphere 单文件部署镜像
# Go 服务托管内嵌的 Next.js SSR 与 Node.js 运行时，最终产物是一个二进制。
# 多阶段构建：builder 复刻 CI 构建流程，runtime 使用 glibc 基础镜像（内嵌 Node 为官方 glibc 版）。

# ---------- 构建阶段 ----------
FROM golang:1.25-bookworm AS builder

ARG NODE_VERSION=24.20.0
ENV CI=1
WORKDIR /src

# 精确安装项目锁定的 Node.js 与 pnpm（Web 构建要求精确版本）
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends curl xz-utils ca-certificates; \
    rm -rf /var/lib/apt/lists/*; \
    arch="$(dpkg --print-architecture)"; \
    case "$arch" in amd64) narch=x64 ;; arm64) narch=arm64 ;; *) echo "unsupported arch: $arch" >&2; exit 1 ;; esac; \
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${narch}.tar.xz" \
      | tar -xJ -C /usr/local --strip-components=1; \
    corepack enable && corepack prepare pnpm@9 --activate; \
    node --version

# 先装前端依赖，最大化利用镜像层缓存
COPY app/web/package.json app/web/pnpm-lock.yaml app/web/
RUN cd app/web && pnpm install --frozen-lockfile

# 拷贝源码并构建：Web SSR standalone -> 打包内嵌运行时 -> 编译静态 Go 二进制
COPY . .
RUN cd app/web && NEXT_DIST_DIR=.next-build pnpm build
RUN arch="$(dpkg --print-architecture)"; \
    deploy/package-web-runtime.sh "${NODE_VERSION}" linux "$arch" \
      server/internal/webbundle/assets/web-runtime.tar.gz
RUN cd server && CGO_ENABLED=0 GOOS=linux GOARCH="$(go env GOARCH)" \
    go build -trimpath -ldflags "-s -w" -o /out/infosphere-server .

# ---------- 运行阶段 ----------
FROM debian:bookworm-slim AS runtime

# 内嵌的 Node 为官方 glibc 版：需要 libstdc++6；ca-certificates 供在线校验 HTTPS；wget 供健康检查
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates libstdc++6 wget; \
    rm -rf /var/lib/apt/lists/*

# 数据目录（config.json、SQLite、上传文件、解压的 Web 运行时都在此，需持久化）
ENV INFO_SPHERE_DATA=/data \
    INFO_SPHERE_PORT=6969
WORKDIR /app
COPY --from=builder /out/infosphere-server /usr/local/bin/infosphere-server
RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 6969

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=5 \
    CMD wget -qO- "http://127.0.0.1:${INFO_SPHERE_PORT}/api/v1/health" >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/usr/local/bin/infosphere-server"]
