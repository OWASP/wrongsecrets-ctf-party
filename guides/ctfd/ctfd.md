# CTFd Setup Guide

This guide explains how to set up and configure CTFd for use with WrongSecrets CTF Party.

## What is CTFd?

CTFd is an open-source Capture The Flag (CTF) platform used to manage challenges, teams, scoring, and flags during security competitions.

WrongSecrets can integrate with CTFd to provide a complete CTF experience for participants.

## Automated Setup

The AWS, Azure, and GCP deployment scripts included in this repository automatically deploy a CTFd instance alongside WrongSecrets.

Deployment guides:

* [AWS Setup](../../aws/README.md)
* [Azure Setup](../../azure/README.md)
* [GCP Setup](../../gcp/README.md)

After deployment, CTFd will be installed through Helm and configured to work with the WrongSecrets environment.

## Accessing CTFd

If no ingress or load balancer has been configured, you can access CTFd locally using port forwarding.

```bash
kubectl port-forward -n ctfd \
$(kubectl get pods --namespace ctfd \
-l "app.kubernetes.io/name=ctfd,app.kubernetes.io/instance=ctfd" \
-o jsonpath="{.items[0].metadata.name}") \
8000:8000
```

Then open:

```text
http://localhost:8000
```

in your browser.

## Creating Challenge Data

WrongSecrets challenge definitions can be generated using the Juice Shop CTF CLI.

Install:

```bash
npm install -g juice-shop-ctf-cli@10.0.1
```

Run:

```bash
juice-shop-ctf
```

When prompted:

* Choose CTFd
* Enter your WrongSecrets URL
* Do not include a trailing slash
* The default key is `test`
* Enable hints if desired

The tool will generate challenge files that can be imported into CTFd.

## Importing Challenges

1. Sign in to CTFd as an administrator.
2. Open the Administration Panel.
3. Use the backup/import functionality.
4. Import the generated challenge package.
5. Verify that all challenges were imported successfully.

## 2-Domain Configuration

If you are using the 2-domain setup, the generated challenge package is not sufficient on its own.

After importing the challenge package into CTFd, you must manually override the generated flags with the actual flag values used by your WrongSecrets deployment.

Refer to the main project README for detailed instructions on the 2-domain setup process.

## Manual Setup

If you do not use the automated cloud deployment scripts:

1. Create a Kubernetes cluster.
2. Install Helm.
3. Create a namespace for CTFd:

```bash
kubectl create namespace ctfd
```

4. Install CTFd using Helm:

```bash
helm upgrade --install ctfd -n ctfd oci://ghcr.io/bman46/ctfd/ctfd
```

5. Expose the service using one of the following methods:

   * Ingress
   * LoadBalancer
   * Port Forwarding

6. Import the generated challenge package.

## Version Compatibility

Be careful when using:

* CTFd >= 3.5.0
* WrongSecrets < 1.5.11

Check that `challenges.json` is 1-indexed before importing. A 0-indexed file can cause imports to fail.

## Customizing CTFd

To customize the CTFd landing page, use the fragment located at:

```text
k8s/ctfd_resources/index_fragment.html
```

This fragment can be added through the CTFd administration interface to better integrate the look and feel with WrongSecrets CTF Party.

## Troubleshooting

### CTFd is not reachable

Check:

```bash
kubectl get pods -n ctfd
kubectl get svc -n ctfd
```

### Port forwarding fails

Verify that the CTFd pod is running:

```bash
kubectl get pods -n ctfd
```

### Challenges are missing

Re-import the generated challenge package and verify that the generation process completed successfully.
