package test

import "testing"

func TestTerraformWrongSecretsCTFPartyGCP(t *testing.T) {
	runCloudE2E(t, cloud{
		name:         "gcp",
		dir:          "../gcp",
		deployScript: "build-and-deploy-gcp.sh",
		expectedEnv:  "gcp",
		varFiles:     []string{"terraform.tfvars"},
		sharedFiles:  []string{"../terraform.tfvars"},
	})
}
