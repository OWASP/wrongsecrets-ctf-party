# Copilot Instructions for OWASP WrongSecrets CTF Party

## Project Overview

OWASP WrongSecrets CTF Party is a Kubernetes-based multi-tenant platform for running Capture The Flag (CTF) events using OWASP WrongSecrets. This project is a fork of MultiJuicer, specifically adapted for security education through hands-on secret management challenges.

**Key Purpose:** Enable security professionals and students to learn about secrets management vulnerabilities through practical CTF exercises in isolated, auto-provisioned environments.

## Architecture Overview

### Core Components
- **wrongsecrets-balancer/**: Node.js/Express.js backend application that manages team provisioning and load balancing
- **wrongsecrets-balancer/ui/**: React frontend for the CTF interface  
- **helm/**: Helm charts for Kubernetes deployment
- **aws/**, **gcp/**, **azure/**: Cloud-specific Terraform infrastructure as code
- **scripts/**: Utility scripts for management and monitoring

### Technology Stack
- **Backend**: Node.js 18+, Express.js, Kubernetes client libraries
- **Frontend**: React with Create React App
- **Infrastructure**: Kubernetes, Helm, Docker, Terraform
- **Cloud Platforms**: AWS EKS, GCP GKE, Azure AKS, local minikube
- **Testing**: Jest for unit tests, Supertest for API testing
- **Code Quality**: ESLint, Prettier, pre-commit hooks, conventional commits

### Multi-Tenant Architecture
Each team gets:
- Dedicated Kubernetes namespace
- Individual WrongSecrets application instance
- Isolated Webtop (Linux desktop) environment  
- Resource limits: 1.5 CPU, 2GB RAM, 4GB storage per user

## Development Guidelines

### Getting Started
1. **Prerequisites**: Node.js 18+, Docker, Kubernetes (minikube), Terraform (for cloud deployments)
2. **Setup**: 
   ```bash
   npm install                           # Root dependencies
   cd wrongsecrets-balancer && npm install  # Backend dependencies
   cd ui && npm install                  # Frontend dependencies
   ```
3. **Local Development**: Use minikube setup via `build-and-deploy-minikube.sh`

### Code Organization

#### Backend (`wrongsecrets-balancer/src/`)
- **`index.js`**: Main application entry point
- **`teams/`**: Team management, provisioning, and lifecycle
- **`proxy/`**: Load balancing and request routing
- **`config/`**: Configuration management
- **`__mocks__/`**: Test mocks for Kubernetes operations

#### Key Patterns
- Use Express.js middleware for authentication and validation
- Leverage Kubernetes client library for cluster operations
- Implement resource cleanup to prevent namespace sprawl
- Use Joi for API request validation

### Testing Standards

#### Unit Testing
- Use Jest with Supertest for API endpoint testing
- Mock Kubernetes operations to avoid cluster dependencies
- Maintain test coverage for team lifecycle operations
- Test file location: `src/**/*.test.js`

#### Running Tests
```bash
cd wrongsecrets-balancer
npm run test        # Run all tests
npm run lint        # ESLint code quality checks
```

**Note**: One proxy test may fail locally if frontend isn't built - this is expected in development.

### Code Quality Standards

#### ESLint Configuration
- Extends standard JavaScript rules with Prettier integration
- Custom rules in `eslint.config.mjs`
- Automatic formatting with Prettier (`.prettierrc`)

#### Commit Standards
- **Required**: Conventional Commits format (enforced by commitlint)
- Examples: `feat: add team deletion endpoint`, `fix: resolve namespace cleanup issue`
- Link PRs to issues: `closes #123` in commit messages

#### Pre-commit Hooks
Automatically enforced via `.pre-commit-config.yaml`:
- YAML validation
- Terraform formatting and validation  
- Helm documentation generation
- Conventional commit message validation

### Security Considerations

#### This is a Security Education Tool
- **Context**: Designed to teach about security vulnerabilities through controlled exposure
- **Intentional Vulnerabilities**: Some components may contain deliberate security issues for educational purposes
- **Production Hardening**: Apply additional security measures when deploying for actual CTF events

#### Security Best Practices for Development
- Never commit real secrets or credentials
- Use Kubernetes secrets and cloud secret managers appropriately
- Validate all user inputs (team names, configurations)
- Implement proper resource quotas and network policies
- Regular dependency updates via Renovate bot

### Infrastructure and Deployment

#### Kubernetes Resources
- **Namespaces**: One per team with naming convention `team-{teamName}`
- **Network Policies**: Isolation between teams, controlled API access
- **Resource Quotas**: CPU, memory, and storage limits per namespace
- **Service Accounts**: Scoped permissions for Webtop kubectl access

#### Cloud Deployment Patterns
- **AWS**: EKS with IRSA, Secrets Manager, Parameter Store integration
- **GCP**: GKE with Workload Identity, Secret Manager
- **Azure**: AKS with managed identity, Key Vault
- **All clouds**: Auto-scaling node pools, managed databases

#### Terraform Modules
- Modular infrastructure in `{cloud}/` directories
- State management with cloud storage backends
- Consistent variable naming and output patterns
- Include monitoring and logging setup

### Common Development Tasks

#### Adding New Features
1. Start with tests (TDD approach when possible)
2. Implement backend API endpoints in appropriate modules
3. Add frontend components if UI changes needed
4. Update Helm values if new configuration required
5. Test locally with minikube before cloud deployment

#### Debugging Team Issues
- Use `kubectl get -l app=wrongsecrets -o custom-columns-file=wrongsecrets.txt deployments`
- Check namespace events: `kubectl get events -n team-{name}`
- Review balancer logs: `kubectl logs -l app=wrongsecrets-balancer`

#### Scaling Considerations
- Monitor resource usage with `kubectl top nodes/pods`
- Adjust node pool sizes based on concurrent users
- Consider pod disruption budgets for maintenance

### Frontend Development (React UI)

#### Development Server
```bash
cd wrongsecrets-balancer/ui
npm start    # Development server on localhost:3000
npm run build # Production build for testing
```

#### UI Architecture
- Create React App with standard project structure
- Proxy configuration for backend API communication
- Responsive design for CTF management interface

### Documentation Updates

When making changes:
- Update README files for new features or setup changes
- Update Helm chart documentation (auto-generated by pre-commit)
- Update cloud-specific deployment guides in respective directories
- Add security considerations for new features

### Performance and Monitoring

#### Resource Management
- Each user requires ~1.5 CPU, 2GB RAM minimum
- Plan cluster capacity: 100 users ≈ 150-250 CPUs, 200-350GB RAM
- Use HPA (Horizontal Pod Autoscaler) for dynamic scaling

#### Monitoring Setup
- Prometheus metrics collection
- Resource usage dashboards
- Team lifecycle event logging
- Failed deployment alerting

### Troubleshooting Common Issues

#### Webtop Kubernetes API Access
- Verify API server endpoint: `kubectl -n kube-system get pod -l component=kube-apiserver`
- Run `./scripts/patch-nsp-for-kubectl.sh` to update network policies
- Check service account permissions in team namespaces

#### Deployment Failures
- Review team provisioning logs in balancer
- Check resource quotas and node capacity
- Validate Helm template generation
- Ensure proper RBAC permissions

### Contributing Workflow

1. **Issues First**: Create or comment on GitHub issues before major changes
2. **Branch Naming**: Use descriptive names like `fix/team-cleanup-bug`
3. **Small PRs**: Keep changes focused and atomic
4. **Testing**: Ensure tests pass and add tests for new functionality
5. **Documentation**: Update relevant docs with changes
6. **Review**: Address feedback promptly and thoroughly

For more detailed contribution guidelines, see [CONTRIBUTING.md](../CONTRIBUTING.md).