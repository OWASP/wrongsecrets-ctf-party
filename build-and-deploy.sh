#!/usr/bin/env bash
set -e

echo "This Script can be used to 'easily' build all WrongSecrets CTF party Components and install them to a local kubernetes cluster"
echo "For minikube this script builds local images with docker and then loads them into the current minikube profile"

echo "Usage: ./build-and-deploy.sh"

source ./scripts/check-available-commands.sh
checkCommandsAvailable helm docker kubectl yq minikube

version="$(uuidgen)"
MINIKUBE_PROFILE="$(minikube profile)"
IFS=$'\n' read -d '' -r -a _vals < <(yq '.wrongsecrets.image, .wrongsecrets.tag, .virtualdesktop.image, .virtualdesktop.tag' helm/wrongsecrets-ctf-party/values.yaml && printf '\0')
WRONGSECRETS_IMAGE="${_vals[0]}"
WRONGSECRETS_TAG="${_vals[1]}"
WEBTOP_IMAGE="${_vals[2]}"
WEBTOP_TAG="${_vals[3]}"
echo "Pulling in required images to actually run ${WRONGSECRETS_IMAGE}:${WRONGSECRETS_TAG} & ${WEBTOP_IMAGE}:${WEBTOP_TAG}."
echo "If you see an authentication failure: pull them manually by the following 2 commands"
echo "'minikube -p ${MINIKUBE_PROFILE} image pull ${WRONGSECRETS_IMAGE}:${WRONGSECRETS_TAG}'"
echo "'minikube -p ${MINIKUBE_PROFILE} image pull ${WEBTOP_IMAGE}:${WEBTOP_TAG}'"
minikube -p "${MINIKUBE_PROFILE}" image pull "${WRONGSECRETS_IMAGE}:${WRONGSECRETS_TAG}" &
minikube -p "${MINIKUBE_PROFILE}" image pull "${WEBTOP_IMAGE}:${WEBTOP_TAG}" &
docker build -t "local/wrongsecrets-balancer:${version}" ./wrongsecrets-balancer &
docker build -t "local/cleaner:${version}" ./cleaner &
wait

minikube -p "${MINIKUBE_PROFILE}" image load "local/wrongsecrets-balancer:${version}"
minikube -p "${MINIKUBE_PROFILE}" image load "local/cleaner:${version}"

helm upgrade --install wrongsecrets ./helm/wrongsecrets-ctf-party --set="imagePullPolicy=Never" --set="balancer.repository=local/wrongsecrets-balancer" --set="balancer.tag=${version}" --set="wrongsecretsCleanup.repository=local/cleaner" --set="wrongsecretsCleanup.tag=${version}"
