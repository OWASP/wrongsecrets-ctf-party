# WrongSecrets CTF Party

WrongSecrets CTF Party is a Kubernetes-based multi-tenant platform for running OWASP WrongSecrets CTF events. Built on Node.js, React, and Kubernetes, it provides dynamic team management with isolated namespaces and integrated virtual desktops.

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Working Effectively

Bootstrap, build, and test the repository:

**Core Dependencies (Required):**
- Node.js v20+ (project targets v22)
- npm
- Docker 
- kubectl
- Helm 3
- yq

**Install and Build Process:**
1. `npm ci` -- root dependencies (1 second)
2. `cd wrongsecrets-balancer && npm ci` -- NEVER CANCEL: Takes 5 seconds on subsequent runs, 90 seconds fresh. Set timeout to 3+ minutes.
3. `cd wrongsecrets-balancer/ui && npm ci` -- NEVER CANCEL: Takes 13 seconds on subsequent runs, 160 seconds fresh. Set timeout to 5+ minutes.
4. `cd wrongsecrets-balancer/ui && npm run build` -- UI build required for tests (13 seconds, set timeout to 60 seconds)
5. `cd cleaner && npm ci` -- cleaner dependencies (3 seconds)

**Testing:**
- `cd wrongsecrets-balancer && npm test` -- balancer tests (2 seconds) 
- `cd cleaner && npm test` -- cleaner tests (2 seconds)
- **CRITICAL**: UI must be built first or balancer tests fail with 302 redirect errors

**Linting:**
- `cd wrongsecrets-balancer && npm run lint` -- balancer linting (1 second)
- `cd cleaner && npm run lint` -- cleaner linting (1 second)

**Development:**
- `cd wrongsecrets-balancer/ui && npm start` -- UI development server on localhost:3000
- The UI proxies to localhost:4000 for backend API calls

## Validation

**Always run complete validation steps after making changes:**

1. **Build Validation:**
   ```bash
   # Install all dependencies (NEVER CANCEL - set 10 minute timeout)
   npm ci
   cd wrongsecrets-balancer && npm ci
   cd ui && npm ci && npm run build
   cd ../../cleaner && npm ci
   ```

2. **Test Validation:**
   ```bash
   # Run all tests (set 2 minute timeout)
   cd wrongsecrets-balancer && npm test
   cd ../cleaner && npm test  
   ```

3. **Lint Validation:**
   ```bash
   cd wrongsecrets-balancer && npm run lint
   cd ../cleaner && npm run lint
   ```

**Manual Testing Scenarios:**
After making code changes, validate these user workflows:
- Team creation flow: Create a team and verify namespace creation logic
- Load balancer functionality: Test proxy routing and cookie handling
- Cleanup functionality: Test namespace cleanup logic with different scenarios

**Docker Build (Limited):**
- Docker builds may fail in restricted environments due to certificate/network issues
- Build scripts exist: `./build-and-deploy.sh` and `./build-and-deploy-container.sh`
- These require minikube or Kubernetes cluster access

**Pre-commit Validation:**
Always run before committing (requires additional tools):
```bash
# Note: May require installing terraform, helm-docs, terraform-docs
pre-commit run --all-files
```

## Common Tasks

**Key Components:**
- `wrongsecrets-balancer/`: Node.js Express app - team management and load balancing
- `wrongsecrets-balancer/ui/`: React frontend - team creation and admin interface  
- `cleaner/`: Node.js app - Kubernetes namespace cleanup job
- `helm/wrongsecrets-ctf-party/`: Helm chart for Kubernetes deployment
- `aws/`, `gcp/`, `azure/`: Cloud provider deployment scripts

**Important Files:**
- `wrongsecrets-balancer/src/app.js`: Main Express application
- `wrongsecrets-balancer/src/teams/teams.js`: Team management logic
- `wrongsecrets-balancer/src/proxy/proxy.js`: Load balancer proxy logic
- `cleaner/src/main.js`: Namespace cleanup logic
- `helm/wrongsecrets-ctf-party/values.yaml`: Configuration values

**Kubernetes Deployment:**
```bash
# Check required tools (all must be installed)
source ./scripts/check-available-commands.sh
checkCommandsAvailable helm docker kubectl yq

# For minikube development
./build-and-deploy-minikube.sh  # Includes minikube setup
# OR
minikube start --cpus=6 --memory=10000MB --network-plugin=cni --cni=calico
./build-and-deploy.sh
kubectl port-forward service/wrongsecrets-balancer 3000:3000
```

**Production Configuration:**
Key production settings in `helm/wrongsecrets-ctf-party/values.yaml`:
- `balancer.cookie.cookieParserSecret`: Set to random 24-char string
- `balancer.cookie.secure`: Set to `true` for HTTPS
- `balancer.replicas`: Set to `2+` for high availability
- `wrongsecrets.maxInstances`: Set per event size (-1 for unlimited)
- Environment variables in `balancer.env` section

**Build Requirements:**
- **NEVER CANCEL long-running npm installs** - they can take 3-5 minutes
- UI build is required before running balancer tests
- All components must be built in correct order
- Docker builds require proper network/certificate setup

**Timing Expectations:**
- npm ci (root): 1 second  
- npm ci (balancer): 5 seconds subsequent, 90 seconds fresh - NEVER CANCEL, set 3+ minute timeout
- npm ci (UI): 13 seconds subsequent, 160 seconds fresh - NEVER CANCEL, set 5+ minute timeout  
- npm run build (UI): 13 seconds - set 60 second timeout
- npm test: 1-2 seconds each component
- npm run lint: <1 second each component  
- Complete build chain: 35 seconds - NEVER CANCEL, set 10+ minute timeout
- Docker builds: 2-5 minutes when working
- Full deployment: 5-10 minutes depending on image pulls

**Common Issues:**
- Tests fail with 302 errors: UI not built - run `npm run build` in UI directory
- Docker build cert errors: Expected in restricted environments
- Missing tools: Run command availability check script first
- Namespace cleanup errors: Expected in test environment without real Kubernetes

## Repository Structure

```
/
├── wrongsecrets-balancer/          # Main application
│   ├── src/                        # Node.js backend code
│   ├── ui/                         # React frontend
│   └── package.json                # Dependencies & scripts
├── cleaner/                        # Cleanup job
│   ├── src/
│   └── package.json
├── helm/wrongsecrets-ctf-party/    # Kubernetes deployment
├── aws/, gcp/, azure/              # Cloud provider configs
├── scripts/                        # Utility scripts
└── guides/                         # Documentation
```