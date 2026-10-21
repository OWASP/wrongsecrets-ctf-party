package test

import "testing"

func TestTerraformWrongSecretsCTFPartyAWS(t *testing.T) {
	runCloudE2E(t, cloud{
		name:                "aws",
		dir:                 "../aws",
		deployScript:        "build-and-deploy-aws.sh",
		expectedEnv:         "aws",
		kubeconfig:          "~/.kube/wrongsecrets",
		vars:                map[string]interface{}{"region": "eu-west-1"},
		sharedVars:          map[string]interface{}{"region": "eu-west-1"},
		sharedOutputsAsVars: map[string]string{"s3_bucket_arn": "state_bucket_arn"},
	})
}
