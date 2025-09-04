# Windows Development Setup Guide for WrongSecrets CTF Party

This guide provides a step-by-step process for setting up the local development environment for WrongSecrets CTF Party on a Windows machine. The setup on Windows has several specific challenges, and this guide provides the reliable workarounds needed to get the application running.

## 1. Prerequisites
Before you begin, you must install the following tools:

- **Git:** [https://git-scm.com/downloads](https://git-scm.com/downloads) (Ensure you install **Git Bash**).
- **Docker Desktop for Windows:** [https://www.docker.com/products/docker-desktop/](https://www.docker.com/products/docker-desktop/)
- **Minikube:** [https://minikube.sigs.k8s.io/docs/start/](https://minikube.sigs.k8s.io/docs/start/)
- **Helm:** [https://helm.sh/docs/intro/install/](https://helm.sh/docs/intro/install/)
- **kubectl:** This is usually installed automatically with Docker Desktop. [https://kubernetes.io/docs/tasks/tools/install-kubectl-windows/](https://kubernetes.io/docs/tasks/tools/install-kubectl-windows/)
- **yq:** [https://github.com/mikefarah/yq/#install](https://github.com/mikefarah/yq/#install) (The `winget install MikeFarah.yq` method is recommended).

## 2. System Configuration
These Windows-specific configurations are crucial for a successful setup.

### a. Enable Hardware Virtualization (BIOS/UEFI)
Minikube and Docker require hardware virtualization (VT-x for Intel or AMD-V for AMD) to be enabled in your computer's BIOS/UEFI. The steps to do this vary by computer manufacturer. You will need to restart your computer and press a key (like `F2`, `F10`, or `DEL`) during boot to enter the setup menu.

*To find the exact steps, search online for: `how to enable virtualization in BIOS for <Your PC Brand and Model>`.*

### b. Configure Docker Desktop Memory (WSL 2)
The project requires at least 11GB of RAM to be allocated to Minikube. You must configure your Docker Desktop's WSL 2 backend to provide this memory.

1.  Open File Explorer and navigate to your user profile folder by typing `%USERPROFILE%` in the address bar.
2.  Create a new file in this folder named exactly **`.wslconfig`**.
3.  Add the following content to the file to set the memory limit:
    ```ini
    [wsl2]
    memory=12GB
    ```
4.  To apply the changes, open PowerShell and run `wsl --shutdown`. Then, restart Docker Desktop.

### c. Use a Simple File Path (No Spaces)
Some tools used in this project (like Cypress) can fail if the project is located in a folder with spaces in the name (e.g., `C:\Users\Your Name`). It is strongly recommended to clone the project directly to the root of your drive, for example: `C:\wrongsecrets-ctf-party`.

## 3. Manual Deployment Guide
The included `.sh` scripts have several compatibility issues on Windows. The following manual steps are the most reliable way to start the environment. All commands should be run in a **Git Bash** terminal.

1.  **Start Minikube Cluster:**
    ```bash
    minikube start --cpus=4 --memory=11000MB --driver=docker --network-plugin=cni --cni=calico
    ```
2.  **Update Helm Repositories:**
    This fixes a potential caching issue with Helm.
    ```bash
    helm repo update
    ```
3.  **Deploy the Application:**
    This command uses the local Helm chart to install the application. Make sure you have applied the necessary workarounds in `helm/wrongsecrets-ctf-party/values.yaml` and `build-and-deploy.sh` to use public images.
    ```bash
    helm upgrade --install wrongsecrets ./helm/wrongsecrets-ctf-party
    ```
4.  **Check Pod Status:**
    Watch the pods as they start up. Wait for `wrongsecrets-balancer` to show `STATUS` as `Running` and `READY` as `1/1`.
    ```bash
    kubectl get pods --watch
    ```
5.  **Access the Application:**
   Once the pods are running, press `Ctrl + C` to stop the watch. Open a **new terminal** and run:
    ```bash
    kubectl port-forward service/wrongsecrets-balancer 3000:3000
    ```
   The application is now available at `http://localhost:3000`.

## 4. Troubleshooting Common Errors
- **Error:** `minikube: command not found`
  - **Solution:** You have not added the location of `minikube.exe` to your Windows PATH environment variable.
- **Error:** `Exiting due to MK_USAGE: Docker Desktop has only X memory but you specified Y`
  - **Solution:** Your `.wslconfig` file is missing or has a value that is too low. Refer to section 2b.
- **Error:** `helm: no cached repo found`
  - **Solution:** Run `helm repo update` to refresh Helm's list of available charts.
- **Error:** `Pods are stuck in Pending` or `ImagePullBackOff`
  - **Solution:** This usually means Kubernetes cannot find the specified Docker image. Ensure your `helm/wrongsecrets-ctf-party/values.yaml` is configured to use the correct public repository names and that your `build-and-deploy.sh` script is not overriding these values.
