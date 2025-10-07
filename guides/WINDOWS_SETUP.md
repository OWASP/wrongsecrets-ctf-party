# Windows Development Setup Guide for WrongSecrets CTF Party

This guide provides a step-by-step process for setting up the local development environment for WrongSecrets CTF Party on a Windows machine.

## 1. Prerequisites

Before you begin, you must install the following tools:
- **Git:** [https://git-scm.com/downloads](https://git-scm.com/downloads) (Ensure **Git Bash** is installed)
- **Docker Desktop for Windows:** [https://www.docker.com/products/docker-desktop/](https://www.docker.com/products/docker-desktop/)
- **Minikube:** [https://minikube.sigs.k8s.io/docs/start/](https://minikube.sigs.k8s.io/docs/start/)
- **Helm:** [https://helm.sh/docs/intro/install/](https://helm.sh/docs/intro/install/)
- **kubectl:** (Included with Docker Desktop)
- **yq:** [https://github.com/mikefarah/yq/#install](https://github.com/mikefarah/yq/#install)

## 2. System Configuration

These Windows-specific configurations are crucial for a successful setup.

### a. Enable Hardware Virtualization (BIOS/UEFI)

Minikube and Docker require hardware virtualization (VT-x or AMD-V) to be enabled in your computer's BIOS/UEFI. You will need to restart your computer and press a key (like `F2`, `F10`, or `DEL`) during boot to enter the setup menu. Search online for instructions specific to your computer model.

### b. Configure Docker Desktop Memory (WSL 2)

The project requires at least 11GB of RAM. You must configure Docker's WSL 2 backend to provide this memory.
1.  Create a file named `.wslconfig` in your user profile folder (`C:\Users\YourName`).
2.  Add the following content:
    ```ini
    [wsl2]
    memory=12GB
    ```
3.  Restart the WSL service by running `wsl --shutdown` in PowerShell, then restart Docker Desktop.

## 3. Manual Deployment Guide

The included scripts have compatibility issues on Windows. A manual deployment is more reliable. Run these commands in **Git Bash**:

1.  **Start Minikube Cluster:**
    ```bash
    minikube start --cpus=4 --memory=11000MB --driver=docker --network-plugin=cni --cni=calico
    ```
    or if you have less memory available and still want to give it a spin:
    ```bash
    minikube start --cpus=4 --memory=6000MB --driver=docker --network-plugin=cni --cni=calico
    ```
2.  **Update Helm Repositories:**
    ```bash
    helm repo update
    ```
3.  **Deploy the Application:**
    ```bash
    helm upgrade --install wrongsecrets ./helm/wrongsecrets-ctf-party
    ```
4.  **Check Pod Status:**
    ```bash
    kubectl get pods --watch
    ```
    Wait for `wrongsecrets-balancer` to be `Running` and `1/1`, then press `Ctrl + C`.

5.  **Access the Application:**
    In a new terminal, run:
    ```bash
    kubectl port-forward service/wrongsecrets-balancer 3000:3000
    ```
   The application is now available at `http://localhost:3000`.
