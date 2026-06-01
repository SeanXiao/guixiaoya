#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
key_path="$repo_root/ssh/id_ed25519_github"

if [[ ! -f "$key_path" ]]; then
  echo "没有找到私钥文件：$key_path"
  echo
  echo "请先把私钥复制到项目里的 ssh/id_ed25519_github，然后重新运行本脚本。"
  exit 1
fi

chmod 700 "$repo_root/ssh"
chmod 600 "$key_path"

git -C "$repo_root" config --local core.sshCommand \
  "ssh -i $key_path -F /dev/null -o IdentitiesOnly=yes"

echo "已为当前仓库配置项目专用 SSH key："
git -C "$repo_root" config --local --get core.sshCommand
echo
echo "现在可以运行 git pull 或 git push。"
