#!/bin/bash
# This script will exit immediately if any command fails
set -e

echo "--- Starting Minikube ---"
minikube start --cpus=2 --memory=8000MB --driver=docker --network-plugin=cni --cni=calico --kubernetes-version=1.32.0

echo "--- Updating Helm Repositories ---"
helm repo update

echo "--- Deploying Application ---"
helm upgrade --install wrongsecrets ./helm/wrongsecrets-ctf-party

echo "--- Waiting for Balancer Deployment to be Ready ---"
kubectl wait --for=condition=available deployment/wrongsecrets-balancer --timeout=5m

echo "--- Starting Port Forward in Background ---"
kubectl port-forward service/wrongsecrets-balancer 3000:3000 &
# Store the ID of the background process
PORT_FORWARD_PID=$!

echo "--- Waiting for Port Forward to establish... ---"
sleep 5

echo "--- Getting Admin Password ---"
# Note: We get the password here for the test to use it
ADMIN_PASSWORD=$(kubectl get secrets wrongsecrets-balancer-secret -o=jsonpath='{.data.adminPassword}' | base64 --decode)
export CYPRESS_ADMIN_PASSWORD=$ADMIN_PASSWORD

echo "--- Running Cypress Tests ---"
# Navigate to the correct directory to run the tests
cd wrongsecrets-balancer
# Run Cypress tests headlessly
npx cypress run

echo "--- Cleaning up port-forward process ---"
# Stop the background port-forward process
kill $PORT_FORWARD_PID
