package test

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gruntwork-io/terratest/modules/random"
	"github.com/gruntwork-io/terratest/modules/terraform"
	"github.com/stretchr/testify/require"
)

const (
	balancerLocalPort = 3000
	// Cloud e2e tests create billable clusters, so they only run when explicitly requested.
	runEnvVar = "RUN_CLOUD_E2E"
)

type cloud struct {
	name         string
	dir          string // terraform directory relative to this folder, e.g. ../aws
	deployScript string // script inside dir that installs the helm charts
	expectedEnv  string // expected K8S_ENV reported by the balancer
	kubeconfig   string // optional kubeconfig the deploy script writes to
	vars         map[string]interface{}
	varFiles     []string
	sharedVars   map[string]interface{}
	sharedFiles  []string
	// sharedOutputsAsVars maps a shared-state output name to a main stack variable name.
	sharedOutputsAsVars map[string]string
}

func requireCloudE2E(t *testing.T) {
	if os.Getenv(runEnvVar) != "true" {
		t.Skipf("set %s=true to provision real cloud infrastructure", runEnvVar)
	}
}

func runCloudE2E(t *testing.T, c cloud) {
	requireCloudE2E(t)

	sharedOptions := terraform.WithDefaultRetryableErrors(t, &terraform.Options{
		TerraformDir: filepath.Join(c.dir, "shared-state"),
		Vars:         c.sharedVars,
		VarFiles:     c.sharedFiles,
	})
	// Deferred calls run in reverse: helm releases, then main stack, then shared state.
	defer terraform.Destroy(t, sharedOptions)
	terraform.InitAndApply(t, sharedOptions)

	vars := map[string]interface{}{}
	for k, v := range c.vars {
		vars[k] = v
	}
	for output, variable := range c.sharedOutputsAsVars {
		vars[variable] = terraform.Output(t, sharedOptions, output)
	}
	options := terraform.WithDefaultRetryableErrors(t, &terraform.Options{
		TerraformDir: c.dir,
		Vars:         vars,
		VarFiles:     c.varFiles,
	})

	defer terraform.Destroy(t, options)
	terraform.InitAndApply(t, options)

	appPassword := strings.ToLower(random.UniqueId()) + random.UniqueId()
	runDeployScript(t, c, appPassword)

	kubeEnv := os.Environ()
	if c.kubeconfig != "" {
		kubeEnv = append(kubeEnv, "KUBECONFIG="+expandHome(c.kubeconfig))
	}

	// Remove helm releases first so cloud load balancers/disks don't block terraform destroy.
	defer uninstallHelm(t, kubeEnv)

	run(t, kubeEnv, "", "kubectl", "wait", "--for=condition=available", "deployment/wrongsecrets-balancer", "--timeout=10m")

	pf := exec.Command("kubectl", "port-forward", "service/wrongsecrets-balancer", fmt.Sprintf("%d:3000", balancerLocalPort))
	pf.Env = kubeEnv
	pf.Stdout, pf.Stderr = os.Stdout, os.Stderr
	require.NoError(t, pf.Start())
	defer func() { _ = pf.Process.Kill() }()

	verifyBalancer(t, fmt.Sprintf("http://localhost:%d", balancerLocalPort), c.expectedEnv, appPassword)
}

func runDeployScript(t *testing.T, c cloud, appPassword string) {
	env := append(os.Environ(),
		"APP_PASSWORD="+appPassword,
		"CREATE_TEAM_HMAC="+random.UniqueId()+random.UniqueId(),
		"COOKIE_PARSER_SECRET="+random.UniqueId()+random.UniqueId(),
		"CTFD_CHART="+pullCTFdChart(t),
	)
	run(t, env, c.dir, "./"+c.deployScript)
}

// pullCTFdChart fetches the public CTFd chart anonymously. Helm sends stored ghcr.io credentials
// from the user's home directory and a stale login makes the pull fail with a 403, hence the clean HOME.
func pullCTFdChart(t *testing.T) string {
	dir := t.TempDir()
	cmd := exec.Command("helm", "pull", "oci://ghcr.io/bman46/ctfd/ctfd", "--version", "v0.9.3", "--destination", dir)
	cmd.Env = append(os.Environ(), "HOME="+dir)
	cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
	require.NoError(t, cmd.Run(), "helm pull of the CTFd chart failed")
	return filepath.Join(dir, "ctfd-v0.9.3.tgz")
}

func uninstallHelm(t *testing.T, env []string) {
	for _, args := range [][]string{
		{"uninstall", "wrongsecrets", "--wait"},
		{"uninstall", "ctfd", "-n", "ctfd", "--wait"},
	} {
		cmd := exec.Command("helm", args...)
		cmd.Env = env
		cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
		if err := cmd.Run(); err != nil {
			t.Logf("helm %v failed (ignored): %v", args, err)
		}
	}
}

func run(t *testing.T, env []string, dir, name string, args ...string) {
	cmd := exec.Command(name, args...)
	cmd.Env = env
	cmd.Dir = dir
	cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
	require.NoError(t, cmd.Run(), "%s %v failed", name, args)
}

func expandHome(p string) string {
	if strings.HasPrefix(p, "~/") {
		home, _ := os.UserHomeDir()
		return filepath.Join(home, p[2:])
	}
	return p
}

// request retries until the response satisfies ok, returning the last body.
func request(t *testing.T, method, url, payload string, retries int, ok func(status int, body string) bool) string {
	client := &http.Client{Timeout: 30 * time.Second}
	var lastStatus int
	var lastBody string
	for i := 0; i < retries; i++ {
		req, err := http.NewRequest(method, url, strings.NewReader(payload))
		require.NoError(t, err)
		req.Header.Set("Content-Type", "application/json")
		if resp, err := client.Do(req); err == nil {
			b, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			lastStatus, lastBody = resp.StatusCode, string(b)
			if ok(lastStatus, lastBody) {
				return lastBody
			}
		}
		time.Sleep(10 * time.Second)
	}
	require.Failf(t, "request failed", "%s %s: last status %d, body %s", method, url, lastStatus, lastBody)
	return ""
}

func status200(status int, _ string) bool { return status == 200 }

// verifyBalancer exercises the deployed balancer: UI, dynamic config, team creation and readiness.
func verifyBalancer(t *testing.T, base, expectedEnv, appPassword string) {
	request(t, "GET", base+"/balancer/", "", 30, func(status int, body string) bool {
		return status == 200 && strings.Contains(body, "<div id=\"root\">")
	})

	dynamics := request(t, "GET", base+"/balancer/dynamics", "", 30, status200)
	var cfg struct {
		K8sEnv         string `json:"k8s_env"`
		HmacKey        string `json:"hmac_key"`
		EnablePassword bool   `json:"enable_password"`
	}
	require.NoError(t, json.Unmarshal([]byte(dynamics), &cfg))
	require.Equal(t, expectedEnv, cfg.K8sEnv)
	require.True(t, cfg.EnablePassword, "access password should be enabled")

	team := "tt" + strings.ToLower(random.UniqueId())
	mac := hmac.New(sha256.New, []byte(cfg.HmacKey))
	mac.Write([]byte(team))
	body := fmt.Sprintf("{\"hmacvalue\":%q,\"password\":%q}", hex.EncodeToString(mac.Sum(nil)), appPassword)
	request(t, "POST", fmt.Sprintf("%s/balancer/teams/%s/join", base, team), body, 3, status200)

	// The team's wrongsecrets instance has to become ready.
	request(t, "GET", fmt.Sprintf("%s/balancer/teams/%s/wait-till-ready", base, team), "", 60, status200)
}
