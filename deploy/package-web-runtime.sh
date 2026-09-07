#!/usr/bin/env bash
set -euo pipefail

node_version="${1:?Node.js version is required}"
target_os="${2:?Target OS is required}"
target_arch="${3:?Target architecture is required}"
output="${4:?Output archive path is required}"

case "${target_arch}" in
  amd64) node_arch=x64 ;;
  arm64) node_arch=arm64 ;;
  *) echo "Unsupported Go architecture: ${target_arch}" >&2; exit 1 ;;
esac

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "${script_dir}/.." && pwd)"
web_dir="${repo_dir}/app/web"
package_tmp_dir="$(mktemp -d)"
trap 'rm -rf "${package_tmp_dir}"' EXIT
runtime_dir="${package_tmp_dir}/web"

mkdir -p "${runtime_dir}/.next/static" "${runtime_dir}/.next-build/static" "$(dirname "${output}")"
cp -R "${web_dir}/.next-build/standalone/." "${runtime_dir}/"
cp -R "${web_dir}/.next-build/static/." "${runtime_dir}/.next/static/"
cp -R "${web_dir}/.next-build/static/." "${runtime_dir}/.next-build/static/"
if [ -d "${web_dir}/public" ]; then
  cp -R "${web_dir}/public" "${runtime_dir}/public"
fi

"${script_dir}/package-node-runtime.sh" "${node_version}" "${runtime_dir}/node" "${target_os}" "${node_arch}"
printf '%s\n' "${node_version}" > "${runtime_dir}/.infosphere-node-version"
tar -czf "${output}" -C "${runtime_dir}" .
test -s "${output}"
