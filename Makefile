# InfoSphere 构建脚本
# 架构：Go API（infosphere-server）+ Next.js SSR（infosphere-web）+ nginx 分流
SHELL := /bin/bash

SERVER_DIR := server
WEB_DIR := app/web
BIN_DIR := bin
VERSION := 2026.0.0

LDFLAGS := -s -w -X 'infosphere/server/internal/app.Version=$(VERSION)'

.PHONY: all build web-install web-build web-package server-build release-linux clean dev-web dev-server lint test

all: build

## 本机构建：前端独立包 + Go 二进制（输出到 bin/）
build: web-build server-build web-package
	@echo ""
	@echo "✅ 构建完成: $(BIN_DIR)/infosphere-server + $(BIN_DIR)/infosphere-web.tar.gz"
	@echo ""

## 安装前端依赖
web-install:
	cd $(WEB_DIR) && pnpm install

## 构建 Next.js SSR 产物（隔离目录，不干扰 dev 的 .next）
web-build:
	cd $(WEB_DIR) && NEXT_DIST_DIR=.next-build pnpm build

## 打包前端独立部署包
web-package:
	rm -rf $(WEB_DIR)/.package $(BIN_DIR)/infosphere-web.tar.gz
	mkdir -p $(WEB_DIR)/.package/.next $(BIN_DIR)
	cp -R $(WEB_DIR)/.next/standalone/. $(WEB_DIR)/.package/
	cp -R $(WEB_DIR)/.next/static/. $(WEB_DIR)/.package/.next/static/
	if [ -d $(WEB_DIR)/public ]; then cp -R $(WEB_DIR)/public $(WEB_DIR)/.package/public; fi
	tar -czf $(BIN_DIR)/infosphere-web.tar.gz -C $(WEB_DIR)/.package .
	rm -rf $(WEB_DIR)/.package

## 构建 Go 二进制（当前平台）
server-build:
	mkdir -p $(BIN_DIR)
	cd $(SERVER_DIR) && go build -trimpath -ldflags "$(LDFLAGS)" -o ../$(BIN_DIR)/infosphere-server .

## 交叉编译 Linux 发布组合（本地复刻 CI 产物）
release-linux: web-build web-package
	mkdir -p $(BIN_DIR)
	cd $(SERVER_DIR) && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
		go build -trimpath -ldflags "$(LDFLAGS)" -o ../$(BIN_DIR)/infosphere-server-linux-amd64 .

## 全部检查（等同 CI）
test: lint
	cd $(SERVER_DIR) && go vet ./... && go test ./...
	cd $(WEB_DIR) && pnpm exec tsc --noEmit && pnpm test

lint:
	cd $(WEB_DIR) && CI=1 pnpm exec next lint

## 前端开发模式（浏览器与 SSR 均直连本机 API）
dev-web:
	cd $(WEB_DIR) && NEXT_PUBLIC_API_BASE=http://localhost:6969 INFO_SPHERE_API_URL=http://localhost:6969 pnpm dev

## Go API 开发模式
dev-server:
	cd $(SERVER_DIR) && INFO_SPHERE_DATA=./data go run . -port 6969

## 清理构建产物
clean:
	rm -rf $(BIN_DIR) $(WEB_DIR)/.next $(WEB_DIR)/.package
