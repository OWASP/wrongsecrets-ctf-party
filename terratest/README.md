# Terratest e2e tests for AWS, Azure and GCP

Each test provisions the cloud stack (`shared-state`, then the main stack), runs the matching
`build-and-deploy-<cloud>.sh` script, and then verifies the balancer through a port-forward:

- the UI is served and `/balancer/dynamics` reports the expected `K8S_ENV`,
- a team can be created (HMAC + access password) and its instance becomes ready.

Afterwards the helm releases and both terraform stacks are destroyed.

**These tests create billable clusters.** They are skipped unless `RUN_CLOUD_E2E=true`.

## Requirements

Go, terraform, helm, kubectl, jq, envsubst, openssl, plus the cloud CLI that is logged in
(`aws`/`eksctl`, `az`, or `gcloud`). The scripts need the same tools as the manual deployment guides.

## Running

```bash
cd terratest
export RUN_CLOUD_E2E=true
go test -v -timeout 120m -run TestTerraformWrongSecretsCTFPartyAWS   # or ...Azure / ...GCP
```

Without `RUN_CLOUD_E2E`, `go test ./...` only compiles and skips.
