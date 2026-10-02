#!/usr/bin/env bash

source ./scripts/check-available-commands.sh
checkCommandsAvailable helm docker kubectl yq minikube

minikube delete
minikube start  --cpus=6 --memory=8000MB --network-plugin=cni --cni=calico --driver=docker --kubernetes-version=1.32.0
./build-and-deploy-container.sh

sleep 5

echo "let's go!"

wait 10

wait_for_endpoints() {
  local service="$1"
  local attempt
  local ready
  for attempt in $(seq 1 90); do
    ready="$(kubectl get endpoints "$service" -o jsonpath='{.subsets[*].addresses[*].ip}' 2>/dev/null || true)"
    if [ -n "$ready" ]; then
      return 0
    fi
    sleep 5
  done
  echo "Timed out waiting for endpoints on ${service}" >&2
  kubectl get pods -o wide >&2 || true
  return 1
}

echo "Waiting for balancer, Prometheus, and Grafana endpoints..."
wait_for_endpoints wrongsecrets-balancer
kubectl port-forward service/wrongsecrets-balancer 3000:3000 &

echo "Balancer is running on http://localhost:3000"

wait_for_endpoints wrongsecrets-prometheus
wait_for_endpoints wrongsecrets-grafana

kubectl port-forward svc/wrongsecrets-grafana 8080:80 &

echo "Grafana is running on http://localhost:8080"
