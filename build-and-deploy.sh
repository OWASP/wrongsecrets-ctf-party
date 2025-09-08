#!/usr/bin/env bash
echo "This Script can be used to 'easily' build all WrongSecrets CTF party Components and install them to a local kubernetes cluster"
source ./scripts/check-available-commands.sh
checkCommandsAvailable helm docker kubectl yq
# The uuidgen command fails on Git Bash and the variable is no longer needed.
# version="$(uuidgen)"
eval $(minikube docker-env)
docker login
helm repo add sealed-secrets https://bitnami-labs.github.io/sealed-secrets
helm install ws-sealedsecrets sealed-secrets/sealed-secrets --namespace kube-system
# The two lines below are the broken build step. We have commented them out to skip them.
# docker build -t local/wrongsecrets-balancer:$version ./wrongsecrets-balancer &
# docker build -t local/cleaner:$version ./cleaner &
wait
# We now run the helm command WITHOUT the --set flags.
helm upgrade --install wrongsecrets ./helm/wrongsecrets-ctf-party