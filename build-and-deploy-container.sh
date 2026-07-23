#!/usr/bin/env bash
set -e

echo "This Script can be used to 'easily' build all WrongSecrets CTF party Components and install them to a local kubernetes cluster"
echo "For this to work the local kubernetes cluster must have access to the same local registry / image cache which 'docker build ...' writes its image to"
echo "For example docker-desktop with its included k8s cluster"

echo "Usage: ./build-and-deploy.sh"

source ./scripts/check-available-commands.sh
checkCommandsAvailable helm docker kubectl yq

mapfile -t _vals < <(yq '.wrongsecrets.image, .wrongsecrets.tag, .virtualdesktop.image, .virtualdesktop.tag, .balancer.repository, .balancer.tag, .wrongsecretsCleanup.repository, .wrongsecretsCleanup.tag' helm/wrongsecrets-ctf-party/values.yaml)
WRONGSECRETS_IMAGE="${_vals[0]}"
WRONGSECRETS_TAG="${_vals[1]}"
WEBTOP_IMAGE="${_vals[2]}"
WEBTOP_TAG="${_vals[3]}"
WRONGSECRETS_BALANCER_IMAGE="${_vals[4]}"
WRONGSECRETS_BALANCER_TAG="${_vals[5]}"
WRONGSECRETS_CLEANER_IMAGE="${_vals[6]}"
WRONGSECRETS_CLEANER_TAG="${_vals[7]}"
echo "Pulling in required images to actually run ${WRONGSECRETS_IMAGE}:${WRONGSECRETS_TAG} & ${WEBTOP_IMAGE}:${WEBTOP_TAG}."
echo "If you see an authentication failure: pull them manually by the following 2 commands"
echo "'docker pull ${WRONGSECRETS_IMAGE}:${WRONGSECRETS_TAG}'"
echo "'docker pull ${WEBTOP_IMAGE}:${WEBTOP_TAG}'"
echo "'docker pull ${WRONGSECRETS_BALANCER_IMAGE}:${WRONGSECRETS_BALANCER_TAG}'"
echo "'docker pull ${WRONGSECRETS_CLEANER_IMAGE}:${WRONGSECRETS_CLEANER_TAG}'"
docker pull "${WRONGSECRETS_IMAGE}:${WRONGSECRETS_TAG}" &
docker pull "${WEBTOP_IMAGE}:${WEBTOP_TAG}" &
docker pull "${WRONGSECRETS_BALANCER_IMAGE}:${WRONGSECRETS_BALANCER_TAG}" &
docker pull "${WRONGSECRETS_CLEANER_IMAGE}:${WRONGSECRETS_CLEANER_TAG}" &
wait

helm upgrade --install wrongsecrets ./helm/wrongsecrets-ctf-party --set="imagePullPolicy=IfNotPresent"
