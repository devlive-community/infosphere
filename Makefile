# InfoSphere 构建脚本
# 架构：Go 服务托管内嵌的 Next.js SSR 与 Node.js 24 运行时
SHELL := /bin/bash

SERVER_DIR := server
WEB_DIR := app/web
BIN_DIR := bin
VERSION := 2026.0.0
NODE_VERSION := 24.20.0
TARGET_GOOS ?= $(shell go env GOOS)
TARGET_GOARCH ?= $(shell go env GOARCH)
WEB_RUNTIME := $(SERVER_DIR)/internal/webbundle/assets/web-runtime.tar.gz

LDFLAGS := -s -w -X 'infosphere/server/internal/app.Version=$(VERSION)'

.PHONY: all build check-node web-install web-build web-runtime server-build release-linux clean dev-web dev-server lint test

all: build

## 本机构建：单个二进制（内嵌 Next.js standalone 与 Node.js 24）
build: server-build
	@echo ""
	@echo "构建完成: $(BIN_DIR)/infosphere-server"
	@echo ""

## 安装前端依赖
web-install: check-node
	cd $(WEB_DIR) && pnpm install

## Web 构建只允许项目锁定的 Node.js 精确版本
check-node:
	@test "$$(node -p 'process.versions.node')" = "$(NODE_VERSION)" || \
		(echo "需要 Node.js $(NODE_VERSION)，当前为 $$(node --version)" >&2; exit 1)

## 构建 Next.js SSR 产物（隔离目录，不干扰 dev 的 .next）
web-build: check-node
	cd $(WEB_DIR) && NEXT_DIST_DIR=.next-build pnpm build

## 为目标平台打包内嵌 Web 运行时
web-runtime: web-build
	deploy/package-web-runtime.sh $(NODE_VERSION) $(TARGET_GOOS) $(TARGET_GOARCH) $(WEB_RUNTIME)

## 构建 Go 二进制（当前平台）
server-build: web-runtime
	mkdir -p $(BIN_DIR)
	cd $(SERVER_DIR) && go build -trimpath -ldflags "$(LDFLAGS)" -o ../$(BIN_DIR)/infosphere-server .
	rm -f $(WEB_RUNTIME)

## 交叉编译 Linux 发布组合（本地复刻 CI 产物）
release-linux: web-build
	mkdir -p $(BIN_DIR)
	deploy/package-web-runtime.sh $(NODE_VERSION) linux amd64 $(WEB_RUNTIME)
	cd $(SERVER_DIR) && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
		go build -trimpath -ldflags "$(LDFLAGS)" -o ../$(BIN_DIR)/infosphere-server-linux-amd64 .
	rm -f $(WEB_RUNTIME)

## 全部检查（等同 CI）
test: lint
	cd $(SERVER_DIR) && go vet ./... && go test ./...
	cd $(WEB_DIR) && pnpm exec tsc --noEmit && pnpm test

lint: check-node
	cd $(WEB_DIR) && CI=1 pnpm exec next lint

## 前端开发模式（浏览器与 SSR 均直连本机 API）
dev-web: check-node
	cd $(WEB_DIR) && NEXT_PUBLIC_API_BASE=http://localhost:6969 INFO_SPHERE_API_URL=http://localhost:6969 pnpm dev

## Go API 开发模式
dev-server:
	cd $(SERVER_DIR) && INFO_SPHERE_DATA=./data go run . -port 6969

## 清理构建产物
clean:
	rm -rf $(BIN_DIR) $(WEB_DIR)/.next $(WEB_DIR)/.next-build
	rm -f $(WEB_RUNTIME)
