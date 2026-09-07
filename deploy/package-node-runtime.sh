#!/usr/bin/env bash
set -euo pipefail

node_version="${1:?Node.js version is required}"
target_dir="${2:?Target directory is required}"
archive="node-v${node_version}-linux-x64.tar.xz"
base_url="https://nodejs.org/dist/v${node_version}"
runtime_tmp_dir="$(mktemp -d)"

curl -fsSL "${base_url}/${archive}" -o "${runtime_tmp_dir}/${archive}"
curl -fsSL "${base_url}/SHASUMS256.txt" -o "${runtime_tmp_dir}/SHASUMS256.txt"
(
  cd "${runtime_tmp_dir}"
  grep "  ${archive}$" SHASUMS256.txt | sha256sum -c -
)

mkdir -p "${target_dir}"
tar -xJf "${runtime_tmp_dir}/${archive}" -C "${target_dir}" --strip-components=1
test "$("${target_dir}/bin/node" --version)" = "v${node_version}"
