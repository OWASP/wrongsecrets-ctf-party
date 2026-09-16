#!/usr/bin/env bash
set -euo pipefail

MINIKUBE_PROFILE="$(minikube profile | head -n 1 | sed -E 's/^[*[:space:]]+//; s/[[:space:]]+$//')"

if [ -z "${MINIKUBE_PROFILE}" ]; then
  echo "Could not determine the active minikube profile." >&2
  exit 1
fi

echo "${MINIKUBE_PROFILE}"
