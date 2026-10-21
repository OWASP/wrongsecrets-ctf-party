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

// sharedStackOptions returns the terraform options for the shared-state stack.
func (c cloud) sharedStackOptions(t *testing.T) *terraform.Options {
	return terraform.WithDefaultRetryableErrors(t, &terraform.Options{
		TerraformDir: filepath.Join(c.dir, "shared-state"),
		Vars:         c.sharedVars,
		VarFiles:     c.sharedFiles,
		Reconfigure:  true,
	})
}

// mainStackOptions returns the terraform options for the main stack, including variables
// taken from outputs of the (already applied) shared-state stack.
func (c cloud) mainStackOptions(t *testing.T, sharedOptions *terraform.Options) *terraform.Options {
	vars := map[string]interface{}{}
	for k, v := range c.vars {
		vars[k] = v
	}
	for output, variable := range c.sharedOutputsAsVars {
		vars[variable] = terraform.Output(t, sharedOptions, output)
	}
	return terraform.WithDefaultRetryableErrors(t, &terraform.Options{
		TerraformDir: c.dir,
		Vars:         vars,
		VarFiles:     c.varFiles,
		Reconfigure:  true,
	})
}

func (c cloud) kubeEnv() []string {
	env := os.Environ()
	if c.kubeconfig != "" {
		env = append(env, "KUBECONFIG="+expandHome(c.kubeconfig))
	}
	return env
}

func runCloudE2E(t *testing.T, c cloud) {
	requireCloudE2E(t)

	sharedOptions := c.sharedStackOptions(t)
	// Deferred calls run in reverse: helm releases, then main stack, then shared state.
	t.Logf("PHASE 1/5: applying shared-state in %s", c.dir)
	defer terraform.Destroy(t, sharedOptions)
	terraform.InitAndApply(t, sharedOptions)

	options := c.mainStackOptions(t, sharedOptions)

	t.Logf("PHASE 2/5: applying main stack in %s (EKS/AKS/GKE takes 15-25 minutes)", c.dir)
	defer terraform.Destroy(t, options)
	terraform.InitAndApply(t, options)

	appPassword := strings.ToLower(random.UniqueId()) + random.UniqueId()
	t.Logf("PHASE 3/5: running %s", c.deployScript)
	runDeployScript(t, c, appPassword)

	kubeEnv := c.kubeEnv()

	// Remove helm releases first so cloud load balancers/disks don't block terraform destroy.
	defer uninstallHelm(t, kubeEnv)

	t.Logf("PHASE 4/5: waiting for the balancer deployment")
	run(t, kubeEnv, "", "kubectl", "wait", "--for=condition=available", "deployment/wrongsecrets-balancer", "--timeout=10m")

	pf := exec.Command("kubectl", "port-forward", "service/wrongsecrets-balancer", fmt.Sprintf("%d:3000", balancerLocalPort))
	pf.Env = kubeEnv
	pf.Stdout, pf.Stderr = os.Stdout, os.Stderr
	require.NoError(t, pf.Start())
	defer func() { _ = pf.Process.Kill() }()

	t.Logf("PHASE 5/5: verifying the balancer; teardown (helm uninstall, terraform destroy) follows")
	verifyBalancer(t, fmt.Sprintf("http://localhost:%d", balancerLocalPort), c.expectedEnv, appPassword, c.kubeEnv())
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

// request retries until the response satisfies ok, logging every attempt, and returns the last body.
func request(t *testing.T, name, method, url, payload string, retries int, ok func(status int, body string) bool) string {
	client := &http.Client{Timeout: 30 * time.Second}
	var lastStatus int
	var lastBody, lastErr string
	start := time.Now()
	for i := 1; i <= retries; i++ {
		req, err := http.NewRequest(method, url, strings.NewReader(payload))
		require.NoError(t, err)
		req.Header.Set("Content-Type", "application/json")
		resp, err := client.Do(req)
		if err != nil {
			lastErr = err.Error()
			t.Logf("[%s] attempt %d/%d (%s elapsed): request error: %s", name, i, retries, time.Since(start).Round(time.Second), lastErr)
		} else {
			b, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			lastStatus, lastBody, lastErr = resp.StatusCode, string(b), ""
			if ok(lastStatus, lastBody) {
				t.Logf("[%s] passed on attempt %d/%d after %s (status %d)", name, i, retries, time.Since(start).Round(time.Second), lastStatus)
				return lastBody
			}
			t.Logf("[%s] attempt %d/%d (%s elapsed): not ready yet, status %d, body %.200q", name, i, retries, time.Since(start).Round(time.Second), lastStatus, lastBody)
		}
		time.Sleep(10 * time.Second)
	}
	require.Failf(t, name+" failed", "%s %s: last status %d, body %s, error %s", method, url, lastStatus, lastBody, lastErr)
	return ""
}

func status200(status int, _ string) bool { return status == 200 }

// verifyBalancer exercises the deployed balancer: UI, dynamic config, team creation and readiness.
func verifyBalancer(t *testing.T, base, expectedEnv, appPassword string, kubeEnv []string) {
	request(t, "balancer UI", "GET", base+"/balancer/", "", 30, func(status int, body string) bool {
		return status == 200 && strings.Contains(body, "<div id=\"root\">")
	})

	dynamics := request(t, "balancer dynamics", "GET", base+"/balancer/dynamics", "", 30, status200)
	var cfg struct {
		K8sEnv         string `json:"k8s_env"`
		HmacKey        string `json:"hmac_key"`
		EnablePassword bool   `json:"enable_password"`
	}
	require.NoError(t, json.Unmarshal([]byte(dynamics), &cfg))
	t.Logf("balancer reports K8S_ENV=%q, access password enabled=%v", cfg.K8sEnv, cfg.EnablePassword)
	require.Equal(t, expectedEnv, cfg.K8sEnv)
	require.True(t, cfg.EnablePassword, "access password should be enabled")

	team := "tt" + strings.ToLower(random.UniqueId())
	t.Logf("creating team %q (namespace t-%s)", team, team)
	mac := hmac.New(sha256.New, []byte(cfg.HmacKey))
	mac.Write([]byte(team))
	body := fmt.Sprintf("{\"hmacvalue\":%q,\"password\":%q}", hex.EncodeToString(mac.Sum(nil)), appPassword)
	request(t, "team join", "POST", fmt.Sprintf("%s/balancer/teams/%s/join", base, team), body, 3, status200)

	// All containers of the team's pods have to be running within 30 minutes. kubectl is polled
	// instead of the blocking wait-till-ready endpoint, which is unreliable through a port-forward.
	waitForTeamPods(t, kubeEnv, "t-"+team, 30*time.Minute)
}

func kubectlOutput(env []string, args ...string) string {
	cmd := exec.Command("kubectl", args...)
	cmd.Env = env
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Sprintf("%s(kubectl %v: %v)", out, args, err)
	}
	return string(out)
}

// allPodsReady parses "name=phase/ready ready;..." and requires every pod to be Running with all containers ready.
func allPodsReady(out string) bool {
	pods := 0
	for _, entry := range strings.Split(strings.TrimSpace(out), ";") {
		if entry == "" {
			continue
		}
		pods++
		_, state, _ := strings.Cut(entry, "=")
		phase, ready, _ := strings.Cut(state, "/")
		if phase != "Running" {
			return false
		}
		for _, r := range strings.Fields(ready) {
			if r != "true" {
				return false
			}
		}
	}
	return pods > 0
}

func waitForTeamPods(t *testing.T, env []string, namespace string, timeout time.Duration) {
	start := time.Now()
	for {
		out := kubectlOutput(env, "get", "pods", "-n", namespace, "-o",
			"jsonpath={range .items[*]}{.metadata.name}={.status.phase}/{.status.containerStatuses[*].ready};{end}")
		t.Logf("[team pods] %s (%s elapsed): %s", namespace, time.Since(start).Round(time.Second), out)
		if allPodsReady(out) {
			t.Logf("all pods in %s are running and ready", namespace)
			return
		}
		if time.Since(start) >= timeout {
			break
		}
		time.Sleep(10 * time.Second)
	}
	t.Logf("team pods not ready, diagnostics:\n%s\n%s\n%s\n%s",
		kubectlOutput(env, "get", "pods", "-n", namespace, "-o", "wide"),
		kubectlOutput(env, "describe", "pods", "-n", namespace),
		kubectlOutput(env, "get", "events", "-n", namespace, "--sort-by=.lastTimestamp"),
		kubectlOutput(env, "logs", "deployment/wrongsecrets-balancer", "--tail=100"))
	t.Fatalf("pods in namespace %s were not all running and ready within %s", namespace, timeout)
}

const cleanupEnvVar = "RUN_CLOUD_CLEANUP"

// runCloudCleanup removes everything a cancelled or crashed e2e run left behind. It relies on the
// local terraform state in the stack directories, which the e2e test also uses.
func runCloudCleanup(t *testing.T, c cloud) {
	if os.Getenv(cleanupEnvVar) != "true" {
		t.Skipf("set %s=true to destroy the %s stacks", cleanupEnvVar, c.name)
	}

	t.Logf("CLEANUP 1/3: uninstalling helm releases (errors are ignored when the cluster is unreachable)")
	uninstallHelm(t, c.kubeEnv())

	sharedOptions := c.sharedStackOptions(t)
	terraform.Init(t, sharedOptions)

	t.Logf("CLEANUP 2/3: destroying the main stack in %s", c.dir)
	options := c.mainStackOptions(t, sharedOptions)
	terraform.Init(t, options)
	terraform.Destroy(t, options)

	t.Logf("CLEANUP 3/3: destroying shared-state in %s", c.dir)
	terraform.Destroy(t, sharedOptions)
}
