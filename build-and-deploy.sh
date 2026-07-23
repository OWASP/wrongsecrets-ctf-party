#!/usr/bin/env bash
set -e

echo "This Script can be used to 'easily' build all WrongSecrets CTF party Components and install them to a local kubernetes cluster"
echo "For this to work the local kubernetes cluster must have access to the same local registry / image cache which 'docker build ...' writes its image to"
echo "For example docker-desktop with its included k8s cluster"

echo "Usage: ./build-and-deploy.sh"

source ./scripts/check-available-commands.sh
checkCommandsAvailable helm docker kubectl yq

version="$(uuidgen)"
eval $(minikube docker-env)
WRONGSECRETS_IMAGE=$(yq '.wrongsecrets.image' helm/wrongsecrets-ctf-party/values.yaml)
WRONGSECRETS_TAG=$(yq '.wrongsecrets.tag' helm/wrongsecrets-ctf-party/values.yaml)
WEBTOP_IMAGE=$(yq '.virtualdesktop.image' helm/wrongsecrets-ctf-party/values.yaml)
WEBTOP_TAG=$(yq '.virtualdesktop.tag' helm/wrongsecrets-ctf-party/values.yaml)
echo "Pulling in required images to actually run ${WRONGSECRETS_IMAGE}:${WRONGSECRETS_TAG} & ${WEBTOP_IMAGE}:${WEBTOP_TAG}."
echo "If you see an authentication failure: pull them manually by the following 2 commands"
echo "'docker pull ${WRONGSECRETS_IMAGE}:${WRONGSECRETS_TAG}'"
echo "'docker pull ${WEBTOP_IMAGE}:${WEBTOP_TAG}'"
docker pull "${WRONGSECRETS_IMAGE}:${WRONGSECRETS_TAG}" &
docker pull "${WEBTOP_IMAGE}:${WEBTOP_TAG}" &
docker build -t "local/wrongsecrets-balancer:${version}" ./wrongsecrets-balancer &
docker build -t "local/cleaner:${version}" ./cleaner &
wait

helm upgrade --install wrongsecrets ./helm/wrongsecrets-ctf-party --set="imagePullPolicy=Never" --set="balancer.repository=local/wrongsecrets-balancer" --set="balancer.tag=${version}" --set="wrongsecretsCleanup.repository=local/cleaner" --set="wrongsecretsCleanup.tag=${version}"
