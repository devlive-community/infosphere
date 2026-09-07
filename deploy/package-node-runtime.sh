#!/usr/bin/env bash
set -euo pipefail

node_version="${1:?Node.js version is required}"
target_dir="${2:?Target directory is required}"
node_os="${3:-linux}"
node_arch="${4:-x64}"
case "${node_os}/${node_arch}" in
  linux/x64|linux/arm64|darwin/x64|darwin/arm64) ;;
  *) echo "Unsupported Node.js target: ${node_os}/${node_arch}" >&2; exit 1 ;;
esac
archive="node-v${node_version}-${node_os}-${node_arch}.tar.xz"
base_url="https://nodejs.org/dist/v${node_version}"
runtime_tmp_dir="$(mktemp -d)"
trap 'rm -rf "${runtime_tmp_dir}"' EXIT

curl -fsSL "${base_url}/${archive}" -o "${runtime_tmp_dir}/${archive}"
curl -fsSL "${base_url}/SHASUMS256.txt" -o "${runtime_tmp_dir}/SHASUMS256.txt"
(
  cd "${runtime_tmp_dir}"
  if command -v sha256sum >/dev/null 2>&1; then
    grep "  ${archive}$" SHASUMS256.txt | sha256sum -c -
  else
    grep "  ${archive}$" SHASUMS256.txt | shasum -a 256 -c -
  fi
)

mkdir -p "${target_dir}"
tar -xJf "${runtime_tmp_dir}/${archive}" -C "${target_dir}" --strip-components=1
test -x "${target_dir}/bin/node"

host_os="$(uname -s | tr '[:upper:]' '[:lower:]')"
case "$(uname -m)" in
  x86_64) host_arch=x64 ;;
  arm64|aarch64) host_arch=arm64 ;;
  *) host_arch=unknown ;;
esac
if [ "${host_os}/${host_arch}" = "${node_os}/${node_arch}" ]; then
  test "$("${target_dir}/bin/node" --version)" = "v${node_version}"
fi
