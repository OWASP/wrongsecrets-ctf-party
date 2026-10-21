package test

import "testing"

func TestTerraformWrongSecretsCTFPartyAzure(t *testing.T) {
	runCloudE2E(t, cloud{
		name:         "azure",
		dir:          "../azure",
		deployScript: "build-and-deploy-azure.sh",
		expectedEnv:  "azure",
		vars:         map[string]interface{}{"region": "East US"},
		sharedVars:   map[string]interface{}{"region": "East US"},
	})
}
