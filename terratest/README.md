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

## Cleaning up after a cancelled run

If a run is cancelled (Ctrl+C, crash, lost connection) the test's deferred destroy never runs and the
cluster keeps costing money. Each cloud has a cleanup test that uninstalls the helm releases and destroys
the main stack and then `shared-state`, using the local terraform state in the stack directories:

```bash
cd terratest
export RUN_CLOUD_CLEANUP=true
go test -v -timeout 60m -run TestCleanupAWS     # or TestCleanupAzure / TestCleanupGCP
```

Use the same cloud credentials/profile as for the e2e run (for example `AWS_PROFILE`). Do not delete the
`terraform.tfstate*` files before cleaning up. Afterwards, check the cloud console for leftovers
(for example `aws eks list-clusters`).
