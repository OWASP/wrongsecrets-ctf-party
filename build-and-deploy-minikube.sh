#!/usr/bin/env bash

source ./scripts/check-available-commands.sh
checkCommandsAvailable helm docker kubectl yq minikube
minikube delete
minikube start  --cpus=2 --memory=8000MB --network-plugin=cni --cni=calico --driver=docker --kubernetes-version=1.32.0
eval $(minikube docker-env)
./build-and-deploy.sh

echo "Waiting for wrongsecrets-balancer pods to be ready..."
kubectl wait --for=condition=ready pod -l app=wrongsecrets-balancer --timeout=2s

echo "let's go!"

echo "password base64 encoded: " + $(kubectl get secrets wrongsecrets-balancer-secret -o=jsonpath='{.data.adminPassword}')

kubectl port-forward service/wrongsecrets-balancer 3000:3000

kubectl port-forward service/prometheus-server 9090:80

kubectl port-forward service/grafana 80:80
