#!/usr/bin/env bash
# Simplified: detect OS/arch, download and extract directly in api-gateway/whatsapp
set -e

VER="${WHATSAPP_VERSION:-7.8.2}"
OUT_DIR="dist"

uname_s=$(uname -s)
case "$uname_s" in
  Darwin) os="darwin" ;;
  Linux)  os="linux"  ;;
  *) echo "Unsupported OS: $uname_s" >&2; exit 1 ;;
esac

uname_m=$(uname -m)
case "$uname_m" in
  x86_64|amd64) arch="amd64" ;;
  arm64|aarch64) arch="arm64" ;;
  *) echo "Unsupported architecture: $uname_m" >&2; exit 1 ;;
esac

ZIP="whatsapp_${VER}_${os}_${arch}.zip"
URL="https://github.com/aldinokemal/go-whatsapp-web-multidevice/releases/download/v${VER}/${ZIP}"

echo "Downloading: ${URL}"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

if command -v curl >/dev/null 2>&1; then
  curl -fsSL -o "${TMP}/${ZIP}" "${URL}"
else
  wget -O "${TMP}/${ZIP}" "${URL}"
fi

unzip -q -o "${TMP}/${ZIP}" -d "${TMP}"
mkdir -p "${OUT_DIR}"
rm -f "${OUT_DIR}/whatsapp"
mv "${TMP}/${os}-${arch}" "${OUT_DIR}/whatsapp"
chmod +x "${OUT_DIR}/whatsapp"

echo "OK: ${OUT_DIR}/whatsapp"


