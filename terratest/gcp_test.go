package test

import "testing"

var gcpCloud = cloud{
	name:         "gcp",
	dir:          "../gcp",
	deployScript: "build-and-deploy-gcp.sh",
	expectedEnv:  "gcp",
	kubeconfig:   "~/.kube/wrongsecrets",
	varFiles:     []string{"terraform.tfvars"},
	sharedFiles:  []string{"../terraform.tfvars"},
}

func TestTerraformWrongSecretsCTFPartyGCP(t *testing.T) {
	runCloudE2E(t, gcpCloud)
}

// TestCleanupGCP destroys leftovers of a cancelled GCP e2e run.
func TestCleanupGCP(t *testing.T) {
	runCloudCleanup(t, gcpCloud)
}
