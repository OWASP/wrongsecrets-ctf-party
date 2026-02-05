const {
  KubeConfig,
  AppsV1Api,
  CoreV1Api,
  CustomObjectsApi,
  PatchUtils,
  RbacAuthorizationV1Api,
  NetworkingV1Api,
} = require('@kubernetes/client-node');

const kc = new KubeConfig();
kc.loadFromCluster();

// This will be needed only in case of k8s_env=gcp
const { auth: authGCPClient } = require('google-auth-library');
const { google } = require('googleapis');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

// Instantiates a client
const secretsClient = new SecretManagerServiceClient();

// Helper function to authenticate with GCP workload identity
async function authenticateGCP() {
  const authClient = await authGCPClient.getClient({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  return authClient;
}

// Helper function to assign the GCP service account access to secret manager
async function secretmanagerGCPAccess(secretName, member) {
  // Get the current IAM policy.
  const [policy] = await secretsClient.getIamPolicy({
    resource: secretName,
  });

  // Add the user with accessor permissions to the bindings list.
  policy.bindings.push({
    role: 'roles/secretmanager.secretAccessor',
    members: [member],
  });

  // Save the updated IAM policy.
  await secretsClient.setIamPolicy({
    resource: secretName,
    policy: policy,
  });

  console.log(`Updated IAM policy for ${secretName}`);
}

const k8sAppsApi = kc.makeApiClient(AppsV1Api);
const k8sCoreApi = kc.makeApiClient(CoreV1Api);
const k8sCustomAPI = kc.makeApiClient(CustomObjectsApi);
const k8sRBACAPI = kc.makeApiClient(RbacAuthorizationV1Api);
const k8sNetworkingApi = kc.makeApiClient(NetworkingV1Api);

// Environment variables
const awsAccountEnv = process.env.IRSA_ROLE;
const awsSecretsmanagerSecretName1 = process.env.AWS_SECRETS_MANAGER_SECRET_ID_1;
const awsSecretsmanagerSecretName2 = process.env.AWS_SECRETS_MANAGER_SECRET_ID_2;
const azureTenantId = process.env.AZ_KEY_VAULT_TENANT_ID;
const keyvaultName = process.env.AZ_KEY_VAULT_NAME;
const azureVaultURI = process.env.AZ_VAULT_URI;
const azurePodClientId = process.env.AZ_POD_CLIENT_ID;
const keyvaultSecretName1 = process.env.AZ_KEYVAULT_SECRET_ID_1;
const keyvaultSecretName2 = process.env.AZ_KEYVAULT_SECRET_ID_2;
const gcpSecretsmanagerSecretName1 = process.env.GCP_SECRETS_MANAGER_SECRET_ID_1;
const gcpSecretsmanagerSecretName2 = process.env.GCP_SECRETS_MANAGER_SECRET_ID_2;
const gcpProject = process.env.GCP_PROJECT_ID;
const challenge33Value = process.env.CHALLENGE33_VALUE;
const wrongSecretsContainterTag = process.env.WRONGSECRETS_TAG;
const wrongSecretsDekstopTag = process.env.WRONGSECRETS_DESKTOP_TAG;
const heroku_wrongsecret_ctf_url = process.env.REACT_APP_HEROKU_WRONGSECRETS_URL;

const { get } = require('./config');
const { logger } = require('./logger');

// Add input validation helper function
// Enhanced validateTeamName function with better error handling
const validateTeamName = (team) => {
  if (!team || typeof team !== 'string') {
    logger.error(`Invalid team name provided: ${team} (type: ${typeof team})`);
    throw new Error(`Invalid team name provided: ${team}`);
  }

  const trimmed = team.trim();
  if (trimmed === '') {
    logger.error(`Empty team name provided after trimming: "${team}"`);
    throw new Error('Team name cannot be empty');
  }

  logger.info(`Validated team name: "${trimmed}"`);
  return trimmed;
};

// Move safeApiCall to the top
const safeApiCall = async (apiCall, operation) => {
  try {
    logger.info(`Executing API call for operation: ${operation}`);
    if (typeof apiCall !== 'function') {
      logger.error(`Invalid API call function provided for operation: ${operation}`);
      throw new Error(`Invalid API call function provided for operation: ${operation}`);
    }
    const response = await apiCall();
    logger.info(`API call ${operation} completed successfully`);
    return response;
  } catch (error) {
    logger.error(`${operation} failed:`, {
      message: error.message,
      statusCode: error.statusCode,
      body: error.body,
    });
    logger.error(`Error details for operation ${operation}: ${JSON.stringify(error, null, 2)}`);
    // Return null for 404 errors (resource not found)
    if (error.statusCode === 404) {
      logger.warn(`${operation} returned 404: Resource not found`);
      return null;
    }

    throw error;
  }
};

// Check if Sealed Secrets controller is installed and ready
const checkSealedSecretsController = async () => {
  try {
    logger.info('Checking Sealed Secrets controller deployment status...');
    const response = await safeApiCall(
      () =>
        k8sAppsApi.readNamespacedDeployment({
          name: 'ws-sealedsecrets-sealed-secrets',
          namespace: 'kube-system',
        }),
      'Check Sealed Secrets controller'
    );
    const deployment = response;
    const isReady = deployment.status && deployment.status.readyReplicas > 0;

    logger.info(`Sealed Secrets controller status: ${isReady ? 'Ready' : 'Not Ready'}`);
    return isReady;
  } catch (error) {
    logger.warn('Sealed Secrets controller check failed:', error.message);
    return false;
  }
};

// Fix the getJuiceShopInstanceForTeamname function - correct parameter order
const getJuiceShopInstanceForTeamname = async (teamname) => {
  logger.info(`checking readiness for ${teamname}`);
  try {
    const validatedTeamName = validateTeamName(teamname);
    const deploymentName = `t-${validatedTeamName}-wrongsecrets`;
    const namespace = `t-${validatedTeamName}`;

    logger.info(`Checking deployment for ${deploymentName} in namespace ${namespace}`);
    // FIX: Correct parameter order - name first, then namespace
    const res = await safeApiCall(
      () => k8sAppsApi.readNamespacedDeployment({ name: deploymentName, namespace: namespace }),
      `Check deployment for team ${teamname}`
    );
    if (!res) {
      logger.info(`No deployment found for team ${teamname}`);
      return undefined;
    }

    const deployment = res;

    if (
      Object.prototype.hasOwnProperty.call(deployment, 'metadata') &&
      Object.prototype.hasOwnProperty.call(deployment.metadata, 'annotations')
    ) {
      return {
        readyReplicas: deployment.status?.readyReplicas || 0,
        availableReplicas: deployment.status?.availableReplicas || 0,
        passcodeHash: deployment.metadata.annotations['wrongsecrets-ctf-party/passcode'],
      };
    }
    return undefined;
  } catch (error) {
    logger.error(`Error checking deployment for team ${teamname}:`, error.message);
    if (error.message && error.message.includes('not found')) {
      return undefined;
    }
    throw error;
  }
};

// Create basic functions
const createConfigmapForTeam = async (team) => {
  const configmap = {
    apiVersion: 'v1',
    data: {
      'funny.entry': 'helloCTF-configmap',
    },
    kind: 'ConfigMap',
    metadata: {
      annotations: {},
      name: 'secrets-file',
      namespace: `t-${team}`,
    },
  };
  return k8sCoreApi
    .createNamespacedConfigMap({ namespace: 't-' + team, body: configmap })
    .catch((error) => {
      throw new Error(error.response.message);
    });
};

const createSecretsfileForTeam = async (team) => {
  const secret = {
    apiVersion: 'v1',
    data: {
      funnier: 'RmxhZzogYXJlIHlvdSBoYXZpbmcgZnVuIHlldD8=',
    },
    kind: 'Secret',
    type: 'Opaque',
    metadata: {
      name: 'funnystuff',
      namespace: `t-${team}`,
    },
  };
  return k8sCoreApi
    .createNamespacedSecret({ namespace: 't-' + team, body: secret })
    .catch((error) => {
      throw new Error(error.response.message);
    });
};

const createChallenge33SecretForTeam = async (team) => {
  const secret = {
    apiVersion: 'v1',
    data: {
      answer: `${challenge33Value}`,
    },
    kind: 'Secret',
    type: 'generic',
    metadata: {
      name: 'challenge33',
      namespace: `t-${team}`,
      annotations: {
        'kubectl.kubernetes.io/last-applied-configuration':
          "apiVersion: 'v1',kind: 'Secret', metadata: { annotations: {}, name: 'challenge33', namespace: 'default',},stringData: { answer: 'This was a standardValue as SecureSecret' },type: 'generic',",
      },
    },
  };
  return k8sCoreApi
    .createNamespacedSecret({ namespace: 't-' + team, body: secret })
    .catch((error) => {
      throw new Error(error.response.message);
    });
};

/**
 * Create a SealedSecret in the team's namespace for secure secret management
 * @param {string} team - The team name
 * @param {string} secretName - The name for the SealedSecret
 * @param {Object} secretData - Object containing key-value pairs for the secret
 */
const createSealedSecretForTeam = async (team, secretName, secretData) => {
  try {
    // Note: In production, you would seal the data using kubeseal CLI or the controller's public key
    // For this example, we're creating a template that would need to be sealed externally
    const sealedSecretManifest = {
      apiVersion: 'bitnami.com/v1alpha1',
      kind: 'SealedSecret',
      metadata: {
        name: secretName,
        namespace: `t-${team}`,
        labels: {
          'app.kubernetes.io/name': 'wrongsecrets',
          'app.kubernetes.io/instance': `wrongsecrets-${team}`,
          'app.kubernetes.io/part-of': 'wrongsecrets-ctf-party',
        },
      },
      spec: {
        template: {
          metadata: {
            name: secretName,
            namespace: `t-${team}`,
            labels: {
              'app.kubernetes.io/name': 'wrongsecrets',
              'app.kubernetes.io/instance': `wrongsecrets-${team}`,
            },
          },
          type: 'Opaque',
        },
        encryptedData: secretData, // This should be pre-sealed data
      },
    };

    const response = await k8sCustomAPI.createNamespacedCustomObject({
      group: 'bitnami.com',
      version: 'v1alpha1',
      namespace: `t-${team}`,
      plural: 'sealedsecrets',
      body: sealedSecretManifest,
    });

    logger.info(`Created SealedSecret ${secretName} for team ${team}`);
    return response;
  } catch (error) {
    logger.error(`Failed to create SealedSecret for team ${team}:`, error.body || error);
    throw new Error(`Failed to create SealedSecret: ${error.message}`);
  }
};

/**
 * Create a sealed secret for challenge 33 specific to the team
 * TODO: REPLACE WITH CHALLENGE 53 FOR ACTUAL SEALED SECRET
 * @param {string} team - The team name
 */
const createSealedChallenge33SecretForTeam = async (team) => {
  const secretName = 'challenge33';
  const secretData = {
    // Note: These values should be sealed using kubeseal before deployment
    answer: challenge33Value || 'default-challenge33-value',
  };

  return createSealedSecretForTeam(team, secretName, secretData);
};

/**
 * Get the Sealed Secrets controller public key for sealing secrets
 */
const getSealedSecretsPublicKey = async () => {
  try {
    const response = await k8sCoreApi.readNamespacedSecret({
      name: 'sealed-secrets-key',
      namespace: 'kube-system',
    });
    return response.data['tls.crt'];
  } catch (error) {
    logger.error('Failed to get Sealed Secrets public key:', error.body || error);
    throw new Error(`Failed to get public key: ${error.message}`);
  }
};

/**
 * Enhanced namespace creation with SealedSecret support
 */
const createNameSpaceForTeam = async (team) => {
  const namedNameSpace = {
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: {
      name: `t-${team}`,
      labels: {
        name: `t-${team}`,
        'pod-security.kubernetes.io/audit': 'restricted',
        'pod-security.kubernetes.io/enforce': 'baseline',
      },
    },
  };

  await k8sCoreApi.createNamespace({ name: 't-' + team, body: namedNameSpace }).catch((error) => {
    throw new Error(JSON.stringify(error));
  });

  // Check if Sealed Secrets controller is available
  const sealedSecretsReady = await checkSealedSecretsController();

  if (sealedSecretsReady) {
    logger.info(`Sealed Secrets controller is ready, will create sealed secrets for team ${team}`);
  } else {
    logger.warn(
      `Sealed Secrets controller not ready, falling back to regular secrets for team ${team}`
    );
  }
};

// Fill in the createK8sChallenge53DeploymentForTeam function
const createK8sChallenge53DeploymentForTeam = async ({ team, passcodeHash }) => {
  logger.info(`Creating Challenge 53 deployment for team ${team}`);

  const deploymentChallenge53Config = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: `t-${team}-secret-challenge-53`,
      namespace: `t-${team}`,
      labels: {
        app: 'secret-challenge-53',
        team: `${team}`,
        'deployment-context': get('deploymentContext'),
      },
      annotations: {
        'wrongsecrets-ctf-party/lastRequest': `${new Date().getTime()}`,
        'wrongsecrets-ctf-party/lastRequestReadable': new Date().toString(),
        'wrongsecrets-ctf-party/passcode': passcodeHash,
        'wrongsecrets-ctf-party/challengesSolved': '0',
        'wrongsecrets-ctf-party/challenges': '[]',
      },
    },
    spec: {
      progressDeadlineSeconds: 20,
      replicas: 1,
      revisionHistoryLimit: 10,
      selector: {
        matchLabels: {
          app: 'secret-challenge-53',
          team: `${team}`,
          'deployment-context': get('deploymentContext'),
        },
      },
      template: {
        metadata: {
          labels: {
            app: 'secret-challenge-53',
            team: `${team}`,
            'deployment-context': get('deploymentContext'),
          },
          name: 'secret-challenge-53',
        },
        spec: {
          securityContext: {
            runAsUser: 2000,
            runAsGroup: 2000,
            fsGroup: 2000,
          },
          containers: [
            {
              image: `jeroenwillemsen/wrongsecrets-challenge53:${wrongSecretsDekstopTag}`,
              name: 'secret-challenge-53',
              imagePullPolicy: 'IfNotPresent',
              resources: {
                requests: {
                  memory: '32Mi',
                  cpu: '50m',
                  'ephemeral-storage': '100Mi',
                },
                limits: {
                  memory: '64Mi',
                  cpu: '100m',
                  'ephemeral-storage': '200Mi',
                },
              },
              securityContext: {
                capabilities: {
                  drop: ['ALL'],
                },
                allowPrivilegeEscalation: false,
                readOnlyRootFilesystem: true,
                runAsNonRoot: true,
                privileged: false,
                seccompProfile: {
                  type: 'RuntimeDefault',
                },
              },
              env: [
                {
                  name: 'TEAM_NAME',
                  value: team,
                },
                {
                  name: 'DEPLOYMENT_CONTEXT',
                  value: get('deploymentContext'),
                },
              ],
              volumeMounts: [
                {
                  mountPath: '/tmp',
                  name: 'ephemeral',
                },
              ],
            },
          ],
          volumes: [
            {
              name: 'ephemeral',
              emptyDir: {},
            },
          ],
          tolerations: get('wrongsecrets.tolerations'),
          affinity: get('wrongsecrets.affinity'),
          runtimeClassName: get('wrongsecrets.runtimeClassName')
            ? get('wrongsecrets.runtimeClassName')
            : undefined,
        },
      },
    },
  };

  try {
    logger.info(`Deploying Challenge 53 to namespace t-${team}`);
    const response = await k8sAppsApi.createNamespacedDeployment({
      namespace: `t-${team}`,
      body: deploymentChallenge53Config,
    });

    logger.info(`Successfully created Challenge 53 deployment for team ${team}`);
    return response;
  } catch (error) {
    logger.error(`Failed to create Challenge 53 deployment for team ${team}:`, error.message);
    throw new Error(`Failed to create Challenge 53 deployment: ${error.message}`);
  }
};

// Add helper function to check Challenge 53 deployment status
const getChallenge53InstanceForTeam = async (team) => {
  logger.info(`Checking Challenge 53 deployment status for team ${team}`);

  try {
    const validatedTeamName = validateTeamName(team);
    const deploymentName = `t-${validatedTeamName}-secret-challenge-53`;
    const namespace = `t-${validatedTeamName}`;

    logger.info(`Checking Challenge 53 deployment ${deploymentName} in namespace ${namespace}`);

    const res = await safeApiCall(
      () => k8sAppsApi.readNamespacedDeployment({ name: deploymentName, namespace: namespace }),
      `Check Challenge 53 deployment for team ${team}`
    );

    if (!res || !res.body) {
      logger.info(`No Challenge 53 deployment found for team ${team}`);
      return undefined;
    }

    const deployment = res.body;

    return {
      readyReplicas: deployment.status?.readyReplicas || 0,
      availableReplicas: deployment.status?.availableReplicas || 0,
      replicas: deployment.status?.replicas || 0,
      conditions: deployment.status?.conditions || [],
    };
  } catch (error) {
    logger.error(`Error checking Challenge 53 deployment for team ${team}:`, error.message);
    if (error.message && error.message.includes('not found')) {
      return undefined;
    }
    throw error;
  }
};

// Add function to delete Challenge 53 deployment
const deleteChallenge53DeploymentForTeam = async (team) => {
  logger.info(`Deleting Challenge 53 deployment for team ${team}`);

  try {
    const validatedTeamName = validateTeamName(team);
    const deploymentName = `t-${validatedTeamName}-secret-challenge-53`;
    await k8sAppsApi.deleteNamespacedDeployment({ name: deploymentName, namespace: `t-${team}` });
    logger.info(`Successfully deleted Challenge 53 deployment for team ${team}`);
  } catch (error) {
    if (error.statusCode === 404) {
      logger.warn(`Challenge 53 deployment not found for team ${team}, nothing to delete`);
      return;
    }
    logger.error(`Failed to delete Challenge 53 deployment for team ${team}:`, error.message);
    throw new Error(`Failed to delete Challenge 53 deployment: ${error.message}`);
  }
};

/**
 * Enhanced deployment creation with SealedSecret integration
 */
const createK8sDeploymentForTeam = async ({ team, passcodeHash }) => {
  // Check if we should use SealedSecrets
  const useSealedSecrets = await checkSealedSecretsController();

  if (useSealedSecrets) {
    // Create sealed secrets for the team
    await createSealedChallenge33SecretForTeam(team);
  }

  const deploymentWrongSecretsConfig = {
    metadata: {
      namespace: `t-${team}`,
      name: `t-${team}-wrongsecrets`,
      labels: {
        app: 'wrongsecrets',
        team: `${team}`,
        'deployment-context': get('deploymentContext'),
      },
      annotations: {
        'wrongsecrets-ctf-party/lastRequest': `${new Date().getTime()}`,
        'wrongsecrets-ctf-party/lastRequestReadable': new Date().toString(),
        'wrongsecrets-ctf-party/passcode': passcodeHash,
        'wrongsecrets-ctf-party/challengesSolved': '0',
        'wrongsecrets-ctf-party/challenges': '[]',
      },
    },
    spec: {
      selector: {
        matchLabels: {
          app: 'wrongsecrets',
          team: `${team}`,
          'deployment-context': get('deploymentContext'),
        },
      },
      template: {
        metadata: {
          labels: {
            app: 'wrongsecrets',
            team: `${team}`,
            'deployment-context': get('deploymentContext'),
          },
        },
        spec: {
          automountServiceAccountToken: false,
          securityContext: {
            runAsUser: 2000,
            runAsGroup: 2000,
            fsGroup: 2000,
          },
          containers: [
            {
              name: 'wrongsecrets',
              image: `jeroenwillemsen/wrongsecrets:${wrongSecretsContainterTag}`,
              imagePullPolicy: get('wrongsecrets.imagePullPolicy'),
              securityContext: {
                allowPrivilegeEscalation: false,
                readOnlyRootFilesystem: true,
                runAsNonRoot: true,
                capabilities: { drop: ['ALL'] },
                seccompProfile: { type: 'RuntimeDefault' },
              },
              env: [
                {
                  name: 'hints_enabled',
                  value: 'false',
                },
                {
                  name: 'ctf_enabled',
                  value: 'true',
                },
                {
                  name: 'ctf_key',
                  value: 'notarealkeyyouknowbutyoumightgetflags',
                },
                {
                  name: 'K8S_ENV',
                  value: 'k8s',
                },
                {
                  name: 'CTF_SERVER_ADDRESS',
                  value: `${heroku_wrongsecret_ctf_url}`,
                },
                {
                  name: 'challenge_acht_ctf_to_provide_to_host_value',
                  value: 'provideThisKeyToHostThankyouAlllGoodDoYouLikeRandomLogging?',
                },
                {
                  name: 'challenge_thirty_ctf_to_provide_to_host_value',
                  value: 'provideThisKeyToHostWhenYouRealizeLSIsOK?',
                },
                {
                  name: 'SPECIAL_K8S_SECRET',
                  valueFrom: {
                    configMapKeyRef: {
                      name: 'secrets-file',
                      key: 'funny.entry',
                    },
                  },
                },
                {
                  name: 'SPECIAL_SPECIAL_K8S_SECRET',
                  valueFrom: {
                    secretKeyRef: {
                      name: 'funnystuff',
                      key: 'funnier',
                    },
                  },
                },
                {
                  name: 'CHALLENGE33',
                  valueFrom: {
                    secretKeyRef: {
                      name: 'challenge33',
                      key: 'answer',
                    },
                  },
                },
                ...get('wrongsecrets.env', []),
              ],
              envFrom: get('wrongsecrets.envFrom'),
              ports: [
                {
                  containerPort: 8080,
                },
              ],
              readinessProbe: {
                httpGet: {
                  path: '/actuator/health/readiness',
                  port: 8080,
                },
                initialDelaySeconds: 90,
                timeoutSeconds: 30,
                periodSeconds: 10,
                failureThreshold: 10,
              },
              livenessProbe: {
                httpGet: {
                  path: '/actuator/health/liveness',
                  port: 8080,
                },
                initialDelaySeconds: 70,
                timeoutSeconds: 30,
                periodSeconds: 30,
              },
              resources: {
                requests: {
                  memory: '512Mi',
                  cpu: '200m',
                  'ephemeral-storage': '1Gi',
                },
                limits: {
                  memory: '512Mi',
                  cpu: '500m',
                  'ephemeral-storage': '2Gi',
                },
              },
              volumeMounts: [
                {
                  mountPath: '/tmp',
                  name: 'ephemeral',
                },
              ],
            },
          ],
          volumes: [
            // {
            //   name: 'wrongsecrets-config',
            //   configMap: {
            //     name: 'wrongsecrets-config',
            //   },
            // },
            {
              name: 'ephemeral',
              emptyDir: {},
            },
            // ...get('wrongsecrets.volumes', []),
          ],
          tolerations: get('wrongsecrets.tolerations'),
          affinity: get('wrongsecrets.affinity'),
          runtimeClassName: get('wrongsecrets.runtimeClassName')
            ? get('wrongsecrets.runtimeClassName')
            : undefined,
        },
      },
    },
  };
  return k8sAppsApi
    .createNamespacedDeployment({ namespace: 't-' + team, body: deploymentWrongSecretsConfig })
    .catch((error) => {
      logger.error(
        `Failed to create deployment for team ${team}:`,
        error.body || error.message || error
      );
      throw new Error(
        error.message ||
          error.body?.message ||
          'Failed to create deployment for body: ' +
            JSON.stringify(deploymentWrongSecretsConfig, null, 2)
      );
    });
};

//BEGIN AWS
const createAWSSecretsProviderForTeam = async (team) => {
  const secretProviderClass = {
    apiVersion: 'secrets-store.csi.x-k8s.io/v1',
    kind: 'SecretProviderClass',
    metadata: {
      name: 'wrongsecrets-aws-secretsmanager',
      namespace: `t-${team}`,
    },
    spec: {
      provider: 'aws',
      parameters: {
        objects: `- objectName: "${awsSecretsmanagerSecretName1}"\n  objectType: "secretsmanager"\n- objectName: "${awsSecretsmanagerSecretName2}"\n  objectType: "secretsmanager"\n`,
      },
    },
  };
  return k8sCustomAPI
    .createNamespacedCustomObject({
      group: 'secrets-store.csi.x-k8s.io',
      version: 'v1',
      namespace: `t-${team}`,
      plural: 'secretproviderclasses',
      body: secretProviderClass,
    })
    .catch((error) => {
      throw new Error(JSON.stringify(error));
    });
};

const patchServiceAccountForTeamForAWS = async (team) => {
  const patch = {
    metadata: {
      annotations: {
        'eks.amazonaws.com/role-arn': `${awsAccountEnv}`,
      },
    },
  };
  return k8sCoreApi
    .patchNamespacedServiceAccount({
      name: 'default',
      namespace: `t-${team}`,
      body: patch,
      pretty: undefined,
      dryRun: undefined,
      fieldManager: undefined,
      fieldValidation: undefined,
      force: undefined,
      headers: { 'Content-type': PatchUtils.PATCH_FORMAT_JSON_MERGE_PATCH },
    })
    .catch((error) => {
      throw new Error(JSON.stringify(error));
    });
};

const createAWSDeploymentForTeam = async ({ team, passcodeHash }) => {
  const deploymentWrongSecretsConfig = {
    metadata: {
      namespace: `t-${team}`,
      name: `t-${team}-wrongsecrets`,
      labels: {
        app: 'wrongsecrets',
        team: `${team}`,
        'deployment-context': get('deploymentContext'),
      },
      annotations: {
        'wrongsecrets-ctf-party/lastRequest': `${new Date().getTime()}`,
        'wrongsecrets-ctf-party/lastRequestReadable': new Date().toString(),
        'wrongsecrets-ctf-party/passcode': passcodeHash,
        'wrongsecrets-ctf-party/challengesSolved': '0',
        'wrongsecrets-ctf-party/challenges': '[]',
      },
    },
    spec: {
      selector: {
        matchLabels: {
          app: 'wrongsecrets',
          team: `${team}`,
          'deployment-context': get('deploymentContext'),
        },
      },
      template: {
        metadata: {
          labels: {
            app: 'wrongsecrets',
            team: `${team}`,
            'deployment-context': get('deploymentContext'),
          },
        },
        spec: {
          automountServiceAccountToken: false,
          securityContext: {
            runAsUser: 2000,
            runAsGroup: 2000,
            fsGroup: 2000,
          },
          containers: [
            {
              name: 'wrongsecrets',
              image: `jeroenwillemsen/wrongsecrets:${wrongSecretsContainterTag}`,
              imagePullPolicy: get('wrongsecrets.imagePullPolicy'),
              // resources: get('wrongsecrets.resources'),
              securityContext: {
                allowPrivilegeEscalation: false,
                readOnlyRootFilesystem: true,
                runAsNonRoot: true,
                capabilities: { drop: ['ALL'] },
                seccompProfile: { type: 'RuntimeDefault' },
              },
              env: [
                {
                  name: 'hints_enabled',
                  value: 'false',
                },
                {
                  name: 'ctf_enabled',
                  value: 'true',
                },
                {
                  name: 'ctf_key',
                  value: 'notarealkeyyouknowbutyoumightgetflags',
                },
                {
                  name: 'K8S_ENV',
                  value: 'aws',
                },
                {
                  name: 'APP_VERSION',
                  value: `${wrongSecretsContainterTag}-ctf`,
                },
                {
                  name: 'CTF_SERVER_ADDRESS',
                  value: `${heroku_wrongsecret_ctf_url}`,
                },
                {
                  name: 'FILENAME_CHALLENGE9',
                  value: `${awsSecretsmanagerSecretName1}`,
                },
                {
                  name: 'FILENAME_CHALLENGE10',
                  value: `${awsSecretsmanagerSecretName2}`,
                },
                {
                  name: 'challenge_acht_ctf_to_provide_to_host_value',
                  value: 'provideThisKeyToHostThankyouAlllGoodDoYouLikeRandomLogging?',
                },
                {
                  name: 'challenge_thirty_ctf_to_provide_to_host_value',
                  value: 'provideThisKeyToHostWhenYouRealizeLSIsOK?',
                },
                {
                  name: 'SPECIAL_K8S_SECRET',
                  valueFrom: {
                    configMapKeyRef: {
                      name: 'secrets-file',
                      key: 'funny.entry',
                    },
                  },
                },
                {
                  name: 'SPECIAL_SPECIAL_K8S_SECRET',
                  valueFrom: {
                    secretKeyRef: {
                      name: 'funnystuff',
                      key: 'funnier',
                    },
                  },
                },
                {
                  name: 'CHALLENGE33',
                  valueFrom: {
                    secretKeyRef: {
                      name: 'challenge33',
                      key: 'answer',
                    },
                  },
                },
                // ...get('wrongsecrets.env', []),
              ],
              // envFrom: get('wrongsecrets.envFrom'),
              ports: [
                {
                  containerPort: 8080,
                },
              ],
              readinessProbe: {
                httpGet: {
                  path: '/actuator/health/readiness',
                  port: 8080,
                },
                initialDelaySeconds: 90,
                timeoutSeconds: 30,
                periodSeconds: 10,
                failureThreshold: 10,
              },
              livenessProbe: {
                httpGet: {
                  path: '/actuator/health/liveness',
                  port: 8080,
                },
                initialDelaySeconds: 70,
                timeoutSeconds: 30,
                periodSeconds: 30,
              },
              resources: {
                requests: {
                  memory: '512Mi',
                  cpu: '200m',
                  'ephemeral-storage': '1Gi',
                },
                limits: {
                  memory: '512Mi',
                  cpu: '500m',
                  'ephemeral-storage': '2Gi',
                },
              },
              volumeMounts: [
                // {
                //   name: 'wrongsecrets-config',
                //   mountPath: '/wrongsecrets/config/wrongsecrets-ctf-party.yaml',
                //   subPath: 'wrongsecrets-ctf-party.yaml',
                // },
                {
                  mountPath: '/tmp',
                  name: 'ephemeral',
                },
                {
                  name: 'secrets-store-inline',
                  mountPath: '/mnt/secrets-store',
                  readOnly: true,
                },
                // ...get('wrongsecrets.volumeMounts', []),
              ],
            },
          ],
          volumes: [
            {
              name: 'secrets-store-inline',
              csi: {
                driver: 'secrets-store.csi.k8s.io',
                readOnly: true,
                volumeAttributes: {
                  secretProviderClass: 'wrongsecrets-aws-secretsmanager',
                },
              },
            },
            {
              name: 'ephemeral',
              emptyDir: {},
            },
          ],
          tolerations: get('wrongsecrets.tolerations'),
          affinity: get('wrongsecrets.affinity'),
          runtimeClassName: get('wrongsecrets.runtimeClassName')
            ? get('wrongsecrets.runtimeClassName')
            : undefined,
        },
      },
    },
  };
  return k8sAppsApi
    .createNamespacedDeployment({ namespace: 't-' + team, body: deploymentWrongSecretsConfig })
    .catch((error) => {
      throw new Error(error.response.body.message);
    });
};

//END AWS

//BEGIN AZURE
const createAzureSecretsProviderForTeam = async (team) => {
  // Define the YAML-formatted objects field as a string
  const objectsYaml = `
    array:
    - |
      objectName: "${keyvaultSecretName1}"
      objectType: "secret"
    - |
      objectName: "${keyvaultSecretName2}"
      objectType: "secret"
    `;

  const secretProviderClass = {
    apiVersion: 'secrets-store.csi.x-k8s.io/v1',
    kind: 'SecretProviderClass',
    metadata: {
      name: 'azure-wrongsecrets-vault',
      namespace: `t-${team}`,
    },
    spec: {
      provider: 'azure',
      parameters: {
        usePodIdentity: 'true',
        tenantId: `${azureTenantId}`,
        keyvaultName: `${keyvaultName}`,
        objects: objectsYaml,
      },
    },
  };

  return k8sCustomAPI
    .createNamespacedCustomObject({
      group: 'secrets-store.csi.x-k8s.io',
      version: 'v1',
      namespace: `t-${team}`,
      plural: 'secretproviderclasses',
      body: secretProviderClass,
    })
    .catch((error) => {
      throw new Error(JSON.stringify(error));
    });
};

const createAzureDeploymentForTeam = async ({ team, passcodeHash }) => {
  const deploymentWrongSecretsConfig = {
    metadata: {
      namespace: `t-${team}`,
      name: `t-${team}-wrongsecrets`,
      labels: {
        app: 'wrongsecrets',
        aadpodidbinding: 'wrongsecrets-pod-id',
        team: `${team}`,
        'deployment-context': get('deploymentContext'),
      },
      annotations: {
        'wrongsecrets-ctf-party/lastRequest': `${new Date().getTime()}`,
        'wrongsecrets-ctf-party/lastRequestReadable': new Date().toString(),
        'wrongsecrets-ctf-party/passcode': passcodeHash,
        'wrongsecrets-ctf-party/challengesSolved': '0',
        'wrongsecrets-ctf-party/challenges': '[]',
      },
    },
    spec: {
      selector: {
        matchLabels: {
          app: 'wrongsecrets',
          aadpodidbinding: 'wrongsecrets-pod-id',
          team: `${team}`,
          'deployment-context': get('deploymentContext'),
        },
      },
      template: {
        metadata: {
          labels: {
            app: 'wrongsecrets',
            aadpodidbinding: 'wrongsecrets-pod-id',
            team: `${team}`,
            'deployment-context': get('deploymentContext'),
          },
        },
        spec: {
          automountServiceAccountToken: false,
          securityContext: {
            runAsUser: 2000,
            runAsGroup: 2000,
            fsGroup: 2000,
          },
          containers: [
            {
              name: 'wrongsecrets',
              image: `jeroenwillemsen/wrongsecrets:${wrongSecretsContainterTag}`,
              imagePullPolicy: get('wrongsecrets.imagePullPolicy'),
              securityContext: {
                allowPrivilegeEscalation: false,
                readOnlyRootFilesystem: true,
                runAsNonRoot: true,
                capabilities: { drop: ['ALL'] },
                seccompProfile: { type: 'RuntimeDefault' },
              },
              env: [
                {
                  name: 'hints_enabled',
                  value: 'false',
                },
                {
                  name: 'ctf_enabled',
                  value: 'true',
                },
                {
                  name: 'ctf_key',
                  value: 'notarealkeyyouknowbutyoumightgetflags',
                },
                {
                  name: 'K8S_ENV',
                  value: 'azure',
                },
                {
                  name: 'APP_VERSION',
                  value: `${wrongSecretsContainterTag}-ctf`,
                },
                {
                  name: 'CTF_SERVER_ADDRESS',
                  value: `${heroku_wrongsecret_ctf_url}`,
                },
                {
                  name: 'FILENAME_CHALLENGE9',
                  value: `${keyvaultSecretName1}`,
                },
                {
                  name: 'FILENAME_CHALLENGE10',
                  value: `${keyvaultSecretName2}`,
                },
                {
                  name: 'challenge_acht_ctf_to_provide_to_host_value',
                  value: 'provideThisKeyToHostThankyouAlllGoodDoYouLikeRandomLogging?',
                },
                {
                  name: 'challenge_thirty_ctf_to_provide_to_host_value',
                  value: 'provideThisKeyToHostWhenYouRealizeLSIsOK?',
                },
                {
                  name: 'SPECIAL_K8S_SECRET',
                  valueFrom: {
                    configMapKeyRef: {
                      name: 'secrets-file',
                      key: 'funny.entry',
                    },
                  },
                },
                {
                  name: 'SPECIAL_SPECIAL_K8S_SECRET',
                  valueFrom: {
                    secretKeyRef: {
                      name: 'funnystuff',
                      key: 'funnier',
                    },
                  },
                },
                {
                  name: 'SPRING_CLOUD_AZURE_KEYVAULT_SECRET_PROPERTYSOURCEENABLED',
                  value: 'true',
                },
                {
                  name: 'SPRING_CLOUD_AZURE_KEYVAULT_SECRET_PROPERTYSOURCES_0_NAME',
                  value: 'wrongsecrets-3',
                },
                {
                  name: 'SPRING_CLOUD_AZURE_KEYVAULT_SECRET_PROPERTYSOURCES_0_ENDPOINT',
                  value: `${azureVaultURI}`,
                },
                {
                  name: 'SPRING_CLOUD_AZURE_KEYVAULT_SECRET_PROPERTYSOURCES_0_CREDENTIAL_CLIENTID',
                  value: `${azurePodClientId}`,
                },
                {
                  name: 'SPRING_CLOUD_AZURE_KEYVAULT_SECRET_PROPERTYSOURCES_0_CREDENTIAL_MANAGEDIDENTITYENABLED',
                  value: `true`,
                },
                {
                  name: 'SPRING_CLOUD_VAULT_URI',
                  value: 'http://vault.vault.svc.cluster.local:8200',
                },
                {
                  name: 'JWT_PATH',
                  value: '/var/run/secrets/kubernetes.io/serviceaccount/token',
                },
                {
                  name: 'CHALLENGE33',
                  valueFrom: {
                    secretKeyRef: {
                      name: 'challenge33',
                      key: 'answer',
                    },
                  },
                },
              ],
              envFrom: get('wrongsecrets.envFrom'),
              ports: [
                {
                  containerPort: 8080,
                },
              ],
              readinessProbe: {
                httpGet: {
                  path: '/actuator/health/readiness',
                  port: 8080,
                },
                initialDelaySeconds: 90,
                timeoutSeconds: 30,
                periodSeconds: 10,
                failureThreshold: 10,
              },
              livenessProbe: {
                httpGet: {
                  path: '/actuator/health/liveness',
                  port: 8080,
                },
                initialDelaySeconds: 70,
                timeoutSeconds: 30,
                periodSeconds: 30,
              },
              resources: {
                requests: {
                  memory: '512Mi',
                  cpu: '200m',
                  'ephemeral-storage': '1Gi',
                },
                limits: {
                  memory: '512Mi',
                  cpu: '500m',
                  'ephemeral-storage': '2Gi',
                },
              },
              volumeMounts: [
                // {
                //   name: 'wrongsecrets-config',
                //   mountPath: '/wrongsecrets/config/wrongsecrets-ctf-party.yaml',
                //   subPath: 'wrongsecrets-ctf-party.yaml',
                // },
                {
                  mountPath: '/tmp',
                  name: 'ephemeral',
                },
                {
                  name: 'secrets-store-inline',
                  mountPath: '/mnt/secrets-store',
                  readOnly: true,
                },
                // ...get('wrongsecrets.volumeMounts', []),
              ],
            },
          ],
          volumes: [
            {
              name: 'secrets-store-inline',
              csi: {
                driver: 'secrets-store.csi.k8s.io',
                readOnly: true,
                volumeAttributes: {
                  secretProviderClass: 'azure-wrongsecrets-vault',
                },
              },
            },
            {
              name: 'ephemeral',
              emptyDir: {},
            },
          ],
          tolerations: get('wrongsecrets.tolerations'),
          affinity: get('wrongsecrets.affinity'),
          runtimeClassName: get('wrongsecrets.runtimeClassName')
            ? get('wrongsecrets.runtimeClassName')
            : undefined,
        },
      },
    },
  };
  return k8sAppsApi
    .createNamespacedDeployment({ namespace: 't-' + team, body: deploymentWrongSecretsConfig })
    .catch((error) => {
      throw new Error(error.response.body.message);
    });
};

//END AZURE

//BEGIN NETWORK POLICIES
const getKubernetesEndpointToWhitelist = async () => {
  try {
    // FIX: Use correct parameter order and response structure
    const response = await k8sCoreApi.readNamespacedEndpoints({
      name: 'kubernetes',
      namespace: 'default',
    });
    // FIX: Extract subsets from the correct response structure
    const subsets = response.subsets;

    logger.info(`Kubernetes endpoints subsets: ${JSON.stringify(subsets)}`);

    if (!subsets || subsets.length === 0) {
      logger.warn('No subsets found in kubernetes endpoints');
      return [];
    }

    return subsets.flatMap((subset) => subset.addresses.map((address) => address.ip));
  } catch (error) {
    logger.error('Failed to get Kubernetes endpoints:', error.message);
    throw new Error(`Failed to get Kubernetes endpoints: ${error.message}`);
  }
};

const createNSPsforTeam = async (team) => {
  const ipaddresses = await getKubernetesEndpointToWhitelist();

  const nspAllowkubectl = {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'NetworkPolicy',
    metadata: {
      name: 'access-kubectl-from-virtualdeskop',
      namespace: `t-${team}`,
    },
    spec: {
      podSelector: {
        matchLabels: {
          app: 'virtualdesktop',
        },
      },
      egress: [
        {
          to: ipaddresses.map((address) => ({
            ipBlock: {
              cidr: `${address}/32`,
            },
          })),
          ports: [
            {
              port: 443,
              protocol: 'TCP',
            },
            {
              port: 8443,
              protocol: 'TCP',
            },
            {
              port: 80,
              protocol: 'TCP',
            },
            {
              port: 10250,
              protocol: 'TCP',
            },
            {
              port: 53,
              protocol: 'UDP',
            },
          ],
        },
      ],
    },
  };

  const nspDefaultDeny = {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'NetworkPolicy',
    metadata: {
      name: 'default-deny-all',
      namespace: `t-${team}`,
    },
    spec: {
      podSelector: {},
      policyTypes: ['Ingress', 'Egress'],
    },
  };

  const nsAllowBalancer = {
    kind: 'NetworkPolicy',
    apiVersion: 'networking.k8s.io/v1',
    metadata: {
      name: 'balancer-access-to-namespace',
      namespace: `t-${team}`,
    },
    spec: {
      podSelector: {},
      ingress: [
        {
          from: [
            {
              namespaceSelector: {
                matchLabels: {
                  'kubernetes.io/metadata.name': 'default',
                },
              },
            },
            {
              podSelector: {
                matchLabels: {
                  'app.kubernetes.io/name': 'wrongsecrets-ctf-party',
                },
              },
            },
          ],
        },
      ],
      egress: [
        {
          to: [
            {
              namespaceSelector: {
                matchLabels: {
                  'kubernetes.io/metadata.name': 'default',
                },
              },
            },
            {
              podSelector: {
                matchLabels: {
                  'app.kubernetes.io/name': 'wrongsecrets-ctf-party',
                },
              },
            },
          ],
        },
      ],
    },
  };

  const nsAllowWrongSecretstoVirtualDesktop = {
    kind: 'NetworkPolicy',
    apiVersion: 'networking.k8s.io/v1',
    metadata: {
      name: 'allow-wrongsecrets-access',
      namespace: `t-${team}`,
    },
    spec: {
      podSelector: {
        matchLabels: {
          app: 'wrongsecrets',
        },
      },
      ingress: [
        {
          from: [
            {
              podSelector: {
                matchLabels: {
                  app: 'virtualdesktop',
                },
              },
            },
          ],
        },
      ],
      egress: [
        {
          to: [
            {
              podSelector: {
                matchLabels: {
                  app: 'virtualdesktop',
                },
              },
            },
          ],
        },
      ],
    },
  };

  const nsAllowVirtualDesktoptoWrongSecrets = {
    kind: 'NetworkPolicy',
    apiVersion: 'networking.k8s.io/v1',
    metadata: {
      name: 'allow-virtualdesktop-access',
      namespace: `t-${team}`,
    },
    spec: {
      podSelector: {
        matchLabels: {
          app: 'virtualdesktop',
        },
      },
      ingress: [
        {
          from: [
            {
              podSelector: {
                matchLabels: {
                  app: 'wrongsecrets',
                },
              },
            },
          ],
        },
      ],
      egress: [
        {
          to: [
            {
              podSelector: {
                matchLabels: {
                  app: 'wrongsecrets',
                },
              },
            },
          ],
        },
      ],
    },
  };

  const nsAllowToDoKubeCTLFromWebTop = {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'NetworkPolicy',
    metadata: {
      name: 'allow-webtop-kubesystem',
      namespace: `t-${team}`,
    },
    spec: {
      podSelector: {
        matchLabels: {
          app: 'virtualdesktop',
        },
      },
      policyTypes: ['Egress'],
      egress: [
        {
          to: [
            {
              namespaceSelector: {
                matchLabels: {
                  'kubernetes.io/metadata.name': 'kube-system',
                },
              },
            },
          ],
          ports: [
            {
              port: 8443,
              protocol: 'TCP',
            },
            {
              port: 8443,
              protocol: 'UDP',
            },
            {
              port: 443,
              protocol: 'TCP',
            },
            {
              port: 443,
              protocol: 'UDP',
            },
          ],
        },
      ],
      ingress: [
        {
          from: [
            {
              namespaceSelector: {
                matchLabels: {
                  'kubernetes.io/metadata.name': 'kube-system',
                },
              },
            },
          ],
          ports: [
            {
              port: 8443,
              protocol: 'TCP',
            },
            {
              port: 8443,
              protocol: 'UDP',
            },
            {
              port: 443,
              protocol: 'TCP',
            },
            {
              port: 443,
              protocol: 'UDP',
            },
          ],
        },
      ],
    },
  };

  const nsAllowOnlyDNS = {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'NetworkPolicy',
    metadata: {
      name: 'deny-all-egress-excpet-dns',
      namespace: `t-${team}`,
    },
    spec: {
      namespaceSelector: {
        matchLabels: {
          'kubernetes.io/metadata.name': `t-${team}`,
        },
      },
      policyTypes: ['Egress'],
      egress: [
        {
          ports: [
            {
              port: 53,
              protocol: 'UDP',
            },
            {
              port: 53,
              protocol: 'TCP',
            },
          ],
        },
      ],
    },
  };

  const broaderallow = {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'NetworkPolicy',
    metadata: {
      name: 'kubectl-policy',
      namespace: `t-${team}`,
    },
    spec: {
      podSelector: {
        matchLabels: {
          app: 'virtualdesktop',
        },
      },
      policyTypes: ['Ingress', 'Egress'],
      ingress: [
        {
          from: [
            {
              namespaceSelector: {
                matchLabels: {
                  'kubernetes.io/metadata.name': 'kube-system',
                },
              },
              podSelector: {},
            },
            {
              namespaceSelector: {
                matchLabels: {
                  'kubernetes.io/metadata.name': 'default',
                },
              },
              podSelector: {},
            },
            {
              namespaceSelector: {
                matchLabels: {
                  'kubernetes.io/metadata.name': `t-${team}`,
                },
              },
              podSelector: {},
            },
          ],
        },
      ],
      egress: [
        {
          to: [
            {
              namespaceSelector: {
                matchLabels: {
                  'kubernetes.io/metadata.name': 'kube-system',
                },
              },
              podSelector: {},
            },
            {
              namespaceSelector: {
                matchLabels: {
                  'kubernetes.io/metadata.name': `t-${team}`,
                },
              },
              podSelector: {},
            },
          ],
        },
      ],
    },
  };

  logger.info(`applying nspAllowkubectl for ${team}`);
  await k8sNetworkingApi
    .createNamespacedNetworkPolicy({ namespace: `t-${team}`, body: nspAllowkubectl })
    .catch((error) => {
      throw new Error(JSON.stringify(error));
    });
  logger.info(`applying nspDefaultDeny for ${team}`);
  await k8sNetworkingApi
    .createNamespacedNetworkPolicy({ namespace: `t-${team}`, body: nspDefaultDeny })
    .catch((error) => {
      throw new Error(JSON.stringify(error));
    });
  logger.info(`applying nsAllowOnlyDNS for ${team}`);
  await k8sNetworkingApi
    .createNamespacedNetworkPolicy({ namespace: `t-${team}`, body: nsAllowOnlyDNS })
    .catch((error) => {
      throw new Error(JSON.stringify(error));
    });
  logger.info(`applying nsAllowBalancer for ${team}`);
  await k8sNetworkingApi
    .createNamespacedNetworkPolicy({ namespace: `t-${team}`, body: nsAllowBalancer })
    .catch((error) => {
      throw new Error(JSON.stringify(error));
    });
  logger.info(`applying nsAllowWrongSecretstoVirtualDesktop for ${team}`);
  await k8sNetworkingApi
    .createNamespacedNetworkPolicy({
      namespace: `t-${team}`,
      body: nsAllowWrongSecretstoVirtualDesktop,
    })
    .catch((error) => {
      throw new Error(JSON.stringify(error));
    });
  logger.info(`applying nsAllowVirtualDesktoptoWrongSecrets for ${team}`);
  await k8sNetworkingApi
    .createNamespacedNetworkPolicy({
      namespace: `t-${team}`,
      body: nsAllowVirtualDesktoptoWrongSecrets,
    })
    .catch((error) => {
      throw new Error(JSON.stringify(error));
    });
  logger.info(`applying broaderallow for ${team}`);
  await k8sNetworkingApi
    .createNamespacedNetworkPolicy({ namespace: `t-${team}`, body: broaderallow })
    .catch((error) => {
      throw new Error(JSON.stringify(error));
    });
  logger.info(`applying nsAllowToDoKubeCTLFromWebTop for ${team}`);
  return k8sNetworkingApi
    .createNamespacedNetworkPolicy({ namespace: `t-${team}`, body: nsAllowToDoKubeCTLFromWebTop })
    .catch((error) => {
      throw new Error(JSON.stringify(error));
    });
};

//END NETWORK POLICIES

//BEGIN RBAC
const createServiceAccountForWebTop = async (team) => {
  const webtopSA = {
    apiVersion: 'v1',
    kind: 'ServiceAccount',
    metadata: {
      name: 'webtop-sa',
      namespace: `t-${team}`,
    },
  };
  return k8sCoreApi
    .createNamespacedServiceAccount({ namespace: `t-${team}`, body: webtopSA })
    .catch((error) => {
      throw new Error(JSON.stringify(error));
    });
};

const createRoleForWebTop = async (team) => {
  const res = await k8sCoreApi.listNamespacedPod({
    namespace: `t-${team}`,
    pretty: true,
    allowWatchBookmarks: true,
    _continue: undefined,
    fieldSelector: undefined,
    labelSelector: `app=secret-challenge-53,team=${team},deployment-context=${get('deploymentContext')}`,
    limit: 1,
  });
  const podName = res.items[0].metadata.name;
  const roleDefinitionForWebtop = {
    kind: 'Role',
    apiVersion: 'rbac.authorization.k8s.io/v1',
    metadata: {
      namespace: `t-${team}`,
      name: 'virtualdesktop-team-role',
    },
    rules: [
      {
        apiGroups: [''],
        resources: ['secrets'],
        verbs: ['get', 'list'],
      },
      {
        apiGroups: [''],
        resources: ['configmaps'],
        verbs: ['get', 'list'],
      },
      {
        apiGroups: [''],
        resources: ['pods/exec'],
        verbs: ['create'],
        resourceNames: [`${podName}`],
      },
      {
        apiGroups: [''],
        resources: ['pods'],
        verbs: ['patch', 'update'],
        resourceNames: [`${podName}`],
      },
      {
        apiGroups: [''],
        resources: ['pod', 'pods', 'pods/log'],
        verbs: ['get', 'list', 'watch'],
      },
      {
        apiGroups: ['apps'],
        resources: ['deployments', 'deployment'],
        verbs: ['get', 'list', 'watch'],
      },
    ],
  };
  return k8sRBACAPI
    .createNamespacedRole({ namespace: `t-${team}`, body: roleDefinitionForWebtop })
    .catch((error) => {
      throw new Error(JSON.stringify(error));
    });
};

const createRoleBindingForWebtop = async (team) => {
  const roleBindingforWebtop = {
    kind: 'RoleBinding',
    metadata: {
      name: 'virtualdesktop-team-rolebinding',
      namespace: `t-${team}`,
    },
    subjects: [{ kind: 'ServiceAccount', name: 'webtop-sa', namespace: `t-${team}` }],
    roleRef: {
      kind: 'Role',
      name: 'virtualdesktop-team-role',
      apiGroup: 'rbac.authorization.k8s.io',
    },
  };
  return k8sRBACAPI
    .createNamespacedRoleBinding({ namespace: `t-${team}`, body: roleBindingforWebtop })
    .catch((error) => {
      throw new Error(JSON.stringify(error));
    });
};

//END RBAC

//BEGIN DESKTOP AND SERVICES
const createDesktopDeploymentForTeam = async ({ team, passcodeHash }) => {
  const deploymentWrongSecretsDesktopConfig = {
    metadata: {
      name: `t-${team}-virtualdesktop`,
      namespace: `t-${team}`,
      labels: {
        app: 'virtualdesktop',
        team,
        'deployment-context': get('deploymentContext'),
      },
      annotations: {
        'wrongsecrets-ctf-party/lastRequest': `${new Date().getTime()}`,
        'wrongsecrets-ctf-party/lastRequestReadable': new Date().toString(),
        'wrongsecrets-ctf-party/passcode': passcodeHash,
      },
    },
    spec: {
      selector: {
        matchLabels: {
          app: 'virtualdesktop',
          team,
          'deployment-context': get('deploymentContext'),
        },
      },
      template: {
        metadata: {
          labels: {
            app: 'virtualdesktop',
            team,
            'deployment-context': get('deploymentContext'),
            namespace: `t-${team}`,
          },
        },
        spec: {
          serviceAccountName: 'webtop-sa',
          containers: [
            {
              name: 'virtualdesktop',
             image: `lscr.io/linuxserver/webtop:${wrongSecretsDekstopTag}`,
              imagePullPolicy: get('virtualdesktop.imagePullPolicy'),
              resources: {
                requests: {
                  memory: '2.5G',
                  cpu: '600m',
                  'ephemeral-storage': '4Gi',
                },
                limits: {
                  memory: '4.0G',
                  cpu: '2000m',
                  'ephemeral-storage': '8Gi',
                },
              },
              securityContext: {
                allowPrivilegeEscalation: true,
                readOnlyRootFilesystem: false,
                runAsNonRoot: false,
              },
              env: [
                {
                  name: 'PUID',
                  value: '1000',
                },
                {
                  name: 'PGID',
                  value: '1000',
                },
                ...get('virtualdesktop.env', []),
              ],
              envFrom: get('virtualdesktop.envFrom'),
              ports: [
                {
                  containerPort: 6080,
                },
              ],
              volumeMounts: [
                {
                  mountPath: '/config',
                  name: 'config-fs',
                },
              ],
              readinessProbe: {
                httpGet: {
                  path: '/',
                  port: 3000,
                },
                initialDelaySeconds: 24,
                periodSeconds: 2,
                failureThreshold: 10,
              },
              livenessProbe: {
                httpGet: {
                  path: '/',
                  port: 3000,
                },
                initialDelaySeconds: 30,
                periodSeconds: 15,
              },
            },
          ],
          volumes: [
            {
              emptyDir: {
                medium: 'Memory',
                sizeLimit: '160Mi',
              },
              name: 'config-fs',
            },
          ],
          tolerations: get('virtualdesktop.tolerations'),
          affinity: get('virtualdesktop.affinity'),
          runtimeClassName: get('virtualdesktop.runtimeClassName')
            ? get('virtualdesktop.runtimeClassName')
            : undefined,
        },
      },
    },
  };

  return k8sAppsApi
    .createNamespacedDeployment({
      namespace: 't-' + team,
      body: deploymentWrongSecretsDesktopConfig,
    })
    .catch((error) => {
      throw new Error(error.response.body.message);
    });
};

const createServiceForTeam = async (teamname) => {
  return k8sCoreApi
    .createNamespacedService({
      namespace: 't-' + teamname,
      body: {
        metadata: {
          namespace: `t-${teamname}`,
          name: `t-${teamname}-wrongsecrets`,
          labels: {
            app: 'wrongsecrets',
            team: teamname,
            'deployment-context': get('deploymentContext'),
          },
        },
        spec: {
          selector: {
            app: 'wrongsecrets',
            team: teamname,
            'deployment-context': get('deploymentContext'),
          },
          ports: [
            {
              port: 8080,
            },
          ],
        },
      },
    })
    .catch((error) => {
      throw new Error(error.response.body.message);
    });
};

const createDesktopServiceForTeam = async (teamname) => {
  return k8sCoreApi
    .createNamespacedService({
      namespace: 't-' + teamname,
      body: {
        metadata: {
          name: `t-${teamname}-virtualdesktop`,
          namespace: `t-${teamname}`,
          labels: {
            app: 'virtualdesktop',
            team: teamname,
            'deployment-context': get('deploymentContext'),
          },
        },
        spec: {
          selector: {
            app: 'virtualdesktop',
            team: teamname,
            'deployment-context': get('deploymentContext'),
          },
          ports: [
            {
              port: 8080,
              targetPort: 3000,
            },
          ],
        },
      },
    })
    .catch((error) => {
      throw new Error(error.response.body.message);
    });
};
//END DESKTOP AND SERVICES

// Management functions
const getJuiceShopInstances = () => {
  return k8sAppsApi
    .listDeploymentForAllNamespaces({
      allowWatchBookmarks: true,
      _continue: undefined,
      fieldSelector: undefined,
      labelSelector: 'app in (wrongsecrets, virtualdesktop, secret-challenge-53)',
      limit: 200,
    })
    .catch((error) => {
      logger.info('error for getJuiceShopInstances: {}', error);
      throw new Error(error.response.body.message);
    });
};

const updateLastRequestTimestampForTeam = (teamname) => {
  const options = { headers: { 'Content-type': PatchUtils.PATCH_FORMAT_JSON_MERGE_PATCH } };
  return k8sAppsApi
    .patchNamespacedDeployment({
      name: `t-${teamname}-wrongsecrets`,
      namespace: `t-${teamname}`,
      body: {
        metadata: {
          annotations: {
            'wrongsecrets-ctf-party/lastRequest': `${new Date().getTime()}`,
            'wrongsecrets-ctf-party/lastRequestReadable': new Date().toString(),
          },
        },
      },
      options: options,
    })
    .catch((error) => {
      logger.info('error for updateLastRequestTimestampForTeam: {}', error);
      throw new Error(error.response.body.message);
    });
};

const changePasscodeHashForTeam = async (teamname, passcodeHash) => {
  const options = { headers: { 'Content-type': PatchUtils.PATCH_FORMAT_JSON_MERGE_PATCH } };
  const deploymentPatch = {
    metadata: {
      annotations: {
        'wrongsecrets-ctf-party/passcode': passcodeHash,
      },
    },
  };

  return k8sAppsApi.patchNamespacedDeployment({
    name: `t-${teamname}-wrongsecrets`,
    namespace: `t-${teamname}`,
    body: deploymentPatch,
    options: options,
  });
};

const deleteNamespaceForTeam = async (team) => {
  await k8sCoreApi.deleteNamespace({ name: `t-${team}` }).catch((error) => {
    throw new Error(error.response.body.message);
  });
};

const deletePodForTeam = async (team) => {
  const res = await k8sCoreApi.listNamespacedPod({
    namespace: `t-${team}`,
    pretty: true,
    allowWatchBookmarks: true,
    _continue: undefined,
    fieldSelector: undefined,
    labelSelector: `app=wrongsecrets,team=${team},deployment-context=${get('deploymentContext')}`,
  });

  const pods = res.items;

  if (pods.length !== 1) {
    throw new Error(`Unexpected number of pods ${pods.length}`);
  }

  const podname = pods[0].metadata.name;

  await k8sCoreApi.deleteNamespacedPod({ name: podname, namespace: `t-${team}` });
};

const deleteDesktopPodForTeam = async (team) => {
  const res = await k8sCoreApi.listNamespacedPod({
    namespace: `t-${team}`,
    pretty: true,
    allowWatchBookmarks: true,
    _continue: undefined,
    fieldSelector: undefined,
    labelSelector: `app=virtualdesktop,team=${team},deployment-context=${get('deploymentContext')}`,
  });

  const pods = res.items;

  if (pods.length !== 1) {
    throw new Error(`Unexpected number of pods ${pods.length}`);
  }

  const podname = pods[0].metadata.name;

  await k8sCoreApi.deleteNamespacedPod({ name: podname, namespace: `t-${team}` });
};

// Add missing GCP functions if they don't exist
const createGCPSecretsProviderForTeam = async (team) => {
  const secretsYaml = `
    - resourceName: "projects/${gcpProject}/secrets/wrongsecret-1/versions/latest"
      fileName: "${gcpSecretsmanagerSecretName1}"
    - resourceName: "projects/${gcpProject}/secrets/wrongsecret-2/versions/latest"
      fileName: "${gcpSecretsmanagerSecretName2}"
    `;
  const secretProviderClass = {
    apiVersion: 'secrets-store.csi.x-k8s.io/v1',
    kind: 'SecretProviderClass',
    metadata: {
      name: 'wrongsecrets-gcp-secretsmanager',
      namespace: `t-${team}`,
    },
    spec: {
      provider: 'gcp',
      parameters: {
        secrets: secretsYaml,
      },
    },
  };
  return k8sCustomAPI
    .createNamespacedCustomObject({
      group: 'secrets-store.csi.x-k8s.io',
      version: 'v1',
      namespace: `t-${team}`,
      plural: 'secretproviderclasses',
      body: secretProviderClass,
    })
    .catch((error) => {
      throw new Error(JSON.stringify(error));
    });
};

const createIAMServiceAccountForTeam = async (team) => {
  try {
    const authClient = await authenticateGCP();
    const serviceAccountName = `team-${team}`;
    const projectId = `${gcpProject}`;
    const iam = google.iam('v1');

    const createServiceAccountResponse = await iam.projects.serviceAccounts.create({
      name: `projects/${projectId}`,
      requestBody: {
        accountId: serviceAccountName,
        serviceAccount: {
          displayName: 'Service Account Display Name',
        },
      },
      auth: authClient,
    });

    console.log(`Service account created: ${createServiceAccountResponse.data.name}`);

    const member = `serviceAccount:${createServiceAccountResponse.data.email}`;

    await secretmanagerGCPAccess(`projects/${gcpProject}/secrets/wrongsecret-1`, member);
    await secretmanagerGCPAccess(`projects/${gcpProject}/secrets/wrongsecret-2`, member);
    await secretmanagerGCPAccess(`projects/${gcpProject}/secrets/wrongsecret-3`, member);

    console.log('Secret Manager Secret Accessor role granted.');
  } catch (error) {
    console.error('Error creating service account:', error);
  }
};

const bindIAMServiceAccountToWorkloadForTeam = async (team) => {
  const authClient = await authenticateGCP();
  const projectId = `${gcpProject}`;
  const serviceAccountEmail = `team-${team}@${gcpProject}.iam.gserviceaccount.com`;
  const resource = `projects/${projectId}/serviceAccounts/${serviceAccountEmail}`;

  const roleBinding = {
    role: 'roles/iam.workloadIdentityUser',
    members: [`serviceAccount:owasp-wrongsecrets.svc.id.goog[t-${team}/default]`],
  };

  const res = await authClient.request({
    url: `https://iam.googleapis.com/v1/${resource}:setIamPolicy`,
    method: 'POST',
    data: {
      policy: {
        bindings: [roleBinding],
      },
    },
  });

  console.log(`Role binding added: ${JSON.stringify(res.data, null, 2)}`);
};

const patchServiceAccountForTeamForGCP = async (team) => {
  const patch = {
    metadata: {
      annotations: {
        'iam.gke.io/gcp-service-account': `team-${team}@${gcpProject}.iam.gserviceaccount.com`,
      },
    },
  };
  const options = { headers: { 'Content-type': PatchUtils.PATCH_FORMAT_JSON_MERGE_PATCH } };

  return k8sCoreApi
    .patchNamespacedServiceAccount(
      { name: 'default', namespace: `t-${team}`, body: patch },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      options
    )
    .catch((error) => {
      throw new Error(JSON.stringify(error));
    });
};

const createGCPDeploymentForTeam = async ({ team, passcodeHash }) => {
  const deploymentWrongSecretsConfig = {
    metadata: {
      namespace: `t-${team}`,
      name: `t-${team}-wrongsecrets`,
      labels: {
        app: 'wrongsecrets',
        team: `${team}`,
        'deployment-context': get('deploymentContext'),
      },
      annotations: {
        'wrongsecrets-ctf-party/lastRequest': `${new Date().getTime()}`,
        'wrongsecrets-ctf-party/lastRequestReadable': new Date().toString(),
        'wrongsecrets-ctf-party/passcode': passcodeHash,
        'wrongsecrets-ctf-party/challengesSolved': '0',
        'wrongsecrets-ctf-party/challenges': '[]',
      },
    },
    spec: {
      selector: {
        matchLabels: {
          app: 'wrongsecrets',
          team: `${team}`,
          'deployment-context': get('deploymentContext'),
        },
      },
      template: {
        metadata: {
          labels: {
            app: 'wrongsecrets',
            team: `${team}`,
            'deployment-context': get('deploymentContext'),
          },
        },
        spec: {
          automountServiceAccountToken: false,
          serviceAccountName: 'default',
          securityContext: {
            runAsUser: 2000,
            runAsGroup: 2000,
            fsGroup: 2000,
          },
          containers: [
            {
              name: 'wrongsecrets',
              image: `jeroenwillemsen/wrongsecrets:${wrongSecretsContainterTag}`,
              imagePullPolicy: get('wrongsecrets.imagePullPolicy'),
              securityContext: {
                allowPrivilegeEscalation: false,
                readOnlyRootFilesystem: true,
                runAsNonRoot: true,
                capabilities: { drop: ['ALL'] },
                seccompProfile: { type: 'RuntimeDefault' },
              },
              env: [
                {
                  name: 'hints_enabled',
                  value: 'false',
                },
                {
                  name: 'ctf_enabled',
                  value: 'true',
                },
                {
                  name: 'ctf_key',
                  value: 'notarealkeyyouknowbutyoumightgetflags',
                },
                {
                  name: 'K8S_ENV',
                  value: 'gcp',
                },
                {
                  name: 'APP_VERSION',
                  value: `${wrongSecretsContainterTag}-ctf`,
                },
                {
                  name: 'CTF_SERVER_ADDRESS',
                  value: `${heroku_wrongsecret_ctf_url}`,
                },
                {
                  name: 'FILENAME_CHALLENGE9',
                  value: `${gcpSecretsmanagerSecretName1}`,
                },
                {
                  name: 'FILENAME_CHALLENGE10',
                  value: `${gcpSecretsmanagerSecretName2}`,
                },
                {
                  name: 'challenge_acht_ctf_to_provide_to_host_value',
                  value: 'provideThisKeyToHostThankyouAlllGoodDoYouLikeRandomLogging?',
                },
                {
                  name: 'challenge_thirty_ctf_to_provide_to_host_value',
                  value: 'provideThisKeyToHostWhenYouRealizeLSIsOK?',
                },
                {
                  name: 'SPECIAL_K8S_SECRET',
                  valueFrom: {
                    configMapKeyRef: {
                      name: 'secrets-file',
                      key: 'funny.entry',
                    },
                  },
                },
                {
                  name: 'SPECIAL_SPECIAL_K8S_SECRET',
                  valueFrom: {
                    secretKeyRef: {
                      name: 'funnystuff',
                      key: 'funnier',
                    },
                  },
                },
                {
                  name: 'SPRING_CLOUD_VAULT_URI',
                  value: 'http://vault.vault.svc.cluster.local:8200',
                },
                {
                  name: 'JWT_PATH',
                  value: '/var/run/secrets/kubernetes.io/serviceaccount/token',
                },
                {
                  name: 'CHALLENGE33',
                  valueFrom: {
                    secretKeyRef: {
                      name: 'challenge33',
                      key: 'answer',
                    },
                  },
                },
              ],
              envFrom: get('wrongsecrets.envFrom'),
              ports: [
                {
                  containerPort: 8080,
                },
              ],
              readinessProbe: {
                httpGet: {
                  path: '/actuator/health/readiness',
                  port: 8080,
                },
                initialDelaySeconds: 90,
                timeoutSeconds: 30,
                periodSeconds: 10,
                failureThreshold: 10,
              },
              livenessProbe: {
                httpGet: {
                  path: '/actuator/health/liveness',
                  port: 8080,
                },
                initialDelaySeconds: 70,
                timeoutSeconds: 30,
                periodSeconds: 30,
              },
              resources: {
                requests: {
                  memory: '512Mi',
                  cpu: '200m',
                  'ephemeral-storage': '1Gi',
                },
                limits: {
                  memory: '512Mi',
                  cpu: '500m',
                  'ephemeral-storage': '2Gi',
                },
              },
              volumeMounts: [
                {
                  mountPath: '/tmp',
                  name: 'ephemeral',
                },
                {
                  name: 'secrets-store-inline',
                  mountPath: '/mnt/secrets-store',
                  readOnly: true,
                },
              ],
            },
          ],
          volumes: [
            {
              name: 'secrets-store-inline',
              csi: {
                driver: 'secrets-store.csi.k8s.io',
                readOnly: true,
                volumeAttributes: {
                  secretProviderClass: 'wrongsecrets-gcp-secretsmanager',
                },
              },
            },
            {
              name: 'ephemeral',
              emptyDir: {},
            },
          ],
          tolerations: get('wrongsecrets.tolerations'),
          affinity: get('wrongsecrets.affinity'),
          runtimeClassName: get('wrongsecrets.runtimeClassName')
            ? get('wrongsecrets.runtimeClassName')
            : undefined,
        },
      },
    },
  };
  return k8sAppsApi
    .createNamespacedDeployment({ namespace: 't-' + team, body: deploymentWrongSecretsConfig })
    .catch((error) => {
      throw new Error(error.response.body.message);
    });
};

// FIXED EXPORT PATTERN - ALL FUNCTIONS WITH CONSISTENT REFERENCES
module.exports = {
  // Helper functions
  safeApiCall,
  validateTeamName,
  checkSealedSecretsController,

  // Core functions
  createConfigmapForTeam,
  createSecretsfileForTeam,
  createChallenge33SecretForTeam,
  createSealedSecretForTeam,
  createSealedChallenge33SecretForTeam,
  getSealedSecretsPublicKey,
  createNameSpaceForTeam,
  createK8sDeploymentForTeam,
  createK8sChallenge53DeploymentForTeam,
  getChallenge53InstanceForTeam,
  deleteChallenge53DeploymentForTeam,

  // AWS functions
  createAWSSecretsProviderForTeam,
  patchServiceAccountForTeamForAWS,
  createAWSDeploymentForTeam,

  // Azure functions
  createAzureSecretsProviderForTeam,
  createAzureDeploymentForTeam, // NOW PROPERLY EXPORTED

  // GCP functions
  createGCPSecretsProviderForTeam,
  createIAMServiceAccountForTeam,
  bindIAMServiceAccountToWorkloadForTeam,
  patchServiceAccountForTeamForGCP,
  createGCPDeploymentForTeam,

  // Networking functions
  getKubernetesEndpointToWhitelist,
  createNSPsforTeam,

  // RBAC functions
  createServiceAccountForWebTop,
  createRoleForWebTop,
  createRoleBindingForWebtop,

  // Desktop and Services
  createDesktopDeploymentForTeam,
  createServiceForTeam,
  createDesktopServiceForTeam,

  // Management functions
  getJuiceShopInstances,
  getJuiceShopInstanceForTeamname, // THIS IS THE KEY ONE THAT WAS MISSING
  updateLastRequestTimestampForTeam,
  changePasscodeHashForTeam,
  deleteNamespaceForTeam,
  deletePodForTeam,
  deleteDesktopPodForTeam,
};
