#!/usr/bin/env bash
set -eu
cd "$(dirname "$0")/../.."
export DOCKER_CONFIG="${DOCKER_CONFIG:-/tmp/ptat-docker-config}"
if [ -z "${HTTPS_PROXY:-}" ] || [ -z "${NODE_EXTRA_CA_CERTS:-}" ]; then
  docker build -t ptat:local .
  exit
fi
# BuildKit does not inherit the platform's proxy hostname mapping.
# Reuse actual platform DNS and trust; never disable certificate verification.
ptat_proxy_host="$(node -e 'process.stdout.write(new URL(process.env.HTTPS_PROXY).hostname)')"
ptat_proxy_address="$(node -e 'require("node:dns").lookup(process.argv[1], {family:4}, (error,address)=>{if(error)throw error;process.stdout.write(address)})' "$ptat_proxy_host")"
docker build \
  --add-host "$ptat_proxy_host:$ptat_proxy_address" \
  --secret "id=ptat_ca,src=$NODE_EXTRA_CA_CERTS" \
  --build-arg HTTP_PROXY --build-arg HTTPS_PROXY --build-arg NO_PROXY \
  -t ptat:local .
