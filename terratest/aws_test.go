package test

import "testing"

var awsCloud = cloud{
	name:                "aws",
	dir:                 "../aws",
	deployScript:        "build-and-deploy-aws.sh",
	expectedEnv:         "aws",
	kubeconfig:          "~/.kube/wrongsecrets",
	vars:                map[string]interface{}{"region": "eu-west-1"},
	sharedVars:          map[string]interface{}{"region": "eu-west-1"},
	sharedOutputsAsVars: map[string]string{"s3_bucket_arn": "state_bucket_arn"},
}

func TestTerraformWrongSecretsCTFPartyAWS(t *testing.T) {
	runCloudE2E(t, awsCloud)
}

// TestCleanupAWS destroys leftovers of a cancelled AWS e2e run.
func TestCleanupAWS(t *testing.T) {
	runCloudCleanup(t, awsCloud)
}
