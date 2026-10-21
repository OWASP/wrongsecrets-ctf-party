package test

import "testing"

var azureCloud = cloud{
	name:         "azure",
	dir:          "../azure",
	deployScript: "build-and-deploy-azure.sh",
	expectedEnv:  "azure",
	vars:         map[string]interface{}{"region": "East US"},
	sharedVars:   map[string]interface{}{"region": "East US"},
}

func TestTerraformWrongSecretsCTFPartyAzure(t *testing.T) {
	runCloudE2E(t, azureCloud)
}

// TestCleanupAzure destroys leftovers of a cancelled Azure e2e run.
func TestCleanupAzure(t *testing.T) {
	runCloudCleanup(t, azureCloud)
}
