jest.mock('../kubernetes');
jest.mock('http-proxy');

const crypto = require('crypto');
const request = require('supertest');
const bcrypt = require('bcryptjs');

process.env.REACT_APP_CREATE_TEAM_HMAC_KEY = 'test-hmac-key';

const app = require('../app');
const { get } = require('../config');
const {
  getJuiceShopInstanceForTeamname,
  getJuiceShopInstances,
  createK8sDeploymentForTeam,
  createK8sChallenge53DeploymentForTeam,
  createDesktopDeploymentForTeam,
  createServiceForTeam,
  createNameSpaceForTeam,
  createDesktopServiceForTeam,
  changePasscodeHashForTeam,
  createConfigmapForTeam,
  createSecretsfileForTeam,
  createChallenge33SecretForTeam,
  createChallenge62SecretForTeam,
  createChallenge62ConfigMapForTeam,
  createServiceAccountForWebTop,
  createRoleForWebTop,
  createRoleBindingForWebtop,
  createNSPsforTeam,
} = require('../kubernetes');

const validHmacFor = (teamname) =>
  crypto
    .createHmac('sha256', process.env.REACT_APP_CREATE_TEAM_HMAC_KEY)
    .update(teamname, 'utf-8')
    .digest('hex');

afterEach(() => {
  getJuiceShopInstanceForTeamname.mockReset();
  getJuiceShopInstances.mockReset();
  changePasscodeHashForTeam.mockReset();
});

describe('teamname validation', () => {
  test.each([
    ['team-42', true],
    ['01234567890123456789', false],
    ['TEAM', false],
    ['te++am', false],
    ['-team', false],
    ['team-', false],
  ])('teamname "%s" should pass validation: %p', async (teamname, shouldPassValidation) => {
    await request(app)
      .post(`/balancer/teams/${teamname}/join`, {})
      .expect(shouldPassValidation ? 401 : 400);
  });

  test.each(['01234567890123456789', 'TEAM', 'te++am', '-team', 'team-'])(
    'invalid teamname "%s" should never reach instance creation',
    async (teamname) => {
      await request(app).post(`/balancer/teams/${teamname}/join`).send({}).expect(400);

      expect(getJuiceShopInstanceForTeamname).not.toHaveBeenCalled();
      expect(createNameSpaceForTeam).not.toHaveBeenCalled();
      expect(createK8sDeploymentForTeam).not.toHaveBeenCalled();
    }
  );
});

describe('passcode validation', () => {
  test.each([
    ['12345678', true],
    ['ABCDEFGH', true],
    ['12abCD34', true],
    ['te++am12', false],
    ['123456789', false],
    ['1234567', false],
  ])('passcode "%s" should pass validation: %p', async (passcode, shouldPassValidation) => {
    getJuiceShopInstanceForTeamname.mockImplementation(async () => {
      return {
        // lowered salt to keep hashing quick
        passcodeHash: bcrypt.hashSync('foo', 2),
      };
    });

    await request(app)
      .post(`/balancer/teams/teamname/join`, {})
      .send({ passcode })
      .expect(shouldPassValidation ? 401 : 400);
  });
});

test('returns a 500 error code when kubernetes returns a unexpected error code while looking for existing deployments', async () => {
  getJuiceShopInstanceForTeamname.mockImplementation(() => {
    throw new Error(`kubernetes cluster is on burning. Evacuate immediately!`);
  });

  await request(app).post('/balancer/teams/team42/join', {}).expect(500);
});

test('requires authentication response when the deployment exists but no passcode was provided', async () => {
  getJuiceShopInstanceForTeamname.mockImplementation(async () => {
    return {
      // lowered salt to keep hashing quick
      passcodeHash: bcrypt.hashSync('foo', 2),
    };
  });

  await request(app).post('/balancer/teams/team42/join', {}).expect(401);
});

test('requires authentication when the passcode is incorrect', async () => {
  getJuiceShopInstanceForTeamname.mockImplementation(async () => {
    return {
      // lowered salt to keep hashing quick
      passcodeHash: bcrypt.hashSync('12345678', 2),
    };
  });

  await request(app).post('/balancer/teams/team42/join').send({ passcode: '01234567' }).expect(401);
});

test('joins team when the passcode is correct and the instance exists', async () => {
  getJuiceShopInstanceForTeamname.mockImplementation(async () => {
    return {
      passcodeHash: bcrypt.hashSync('12345678', 2),
    };
  });

  await request(app)
    .post('/balancer/teams/team42/join')
    .send({ passcode: '12345678' })
    .expect(200)
    .then(({ body }) => {
      expect(body.message).toBe('Joined Team');
    });
});

test('create team fails when max instances is reached', async () => {
  getJuiceShopInstanceForTeamname.mockImplementation(async () => {
    throw new Error(`deployments.apps "t-team42-wrongsecrets" not found`);
  });
  getJuiceShopInstances.mockImplementation(async () => {
    return {
      items: [
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
      ],
    };
  });

  await request(app)
    .post('/balancer/teams/team42/join')
    .expect(500)
    .then(({ body }) => {
      expect(body.message).toBe('Reached Maximum Instance Count');
    });
});

test('create team creates a instance for team via k8s service', async () => {
  getJuiceShopInstanceForTeamname.mockImplementation(async () => {
    throw new Error(`deployments.apps "t-team42-wrongsecrets" not found`);
  });

  // Add mock for Challenge 53 deployment
  createK8sChallenge53DeploymentForTeam.mockImplementation(async () => {
    return {
      body: {
        metadata: {
          name: 'secret-challenge-53',
          namespace: 't-team42',
        },
      },
    };
  });

  let passcode = null;

  await request(app)
    .post('/balancer/teams/team42/join')
    .send({ hmacvalue: validHmacFor('team42') })
    .expect(200)
    .then(({ body }) => {
      expect(body.message).toBe('Created Instance');
      expect(body.passcode).toMatch(/^[A-Z0-9]{8}$/);
      passcode = body.passcode;
    });

  expect(createConfigmapForTeam).toHaveBeenCalled();
  expect(createSecretsfileForTeam).toHaveBeenCalled();
  expect(createChallenge33SecretForTeam).toHaveBeenCalled();
  expect(createChallenge62SecretForTeam).toHaveBeenCalled();
  expect(createChallenge62ConfigMapForTeam).toHaveBeenCalled();
  expect(createK8sChallenge53DeploymentForTeam).toHaveBeenCalled();
  expect(createNameSpaceForTeam).toHaveBeenCalled();
  expect(createK8sDeploymentForTeam).toHaveBeenCalled();
  expect(createDesktopDeploymentForTeam).toHaveBeenCalled();
  expect(createDesktopServiceForTeam).toHaveBeenCalled();
  expect(createServiceAccountForWebTop).toHaveBeenCalled();
  expect(createRoleForWebTop).toHaveBeenCalled();
  expect(createNSPsforTeam).toHaveBeenCalled();
  expect(createRoleBindingForWebtop).toHaveBeenCalled();
  const createDeploymentForTeamCallArgs = createK8sDeploymentForTeam.mock.calls[0][0];
  expect(createDeploymentForTeamCallArgs.team).toBe('team42');
  expect(bcrypt.compareSync(passcode, createDeploymentForTeamCallArgs.passcodeHash)).toBe(true);
  expect(createServiceForTeam).toHaveBeenCalledWith('team42');
});

test('create team fails when namespace creation throws an error', async () => {
  getJuiceShopInstanceForTeamname.mockImplementation(async () => {
    throw new Error(`deployments.apps "t-team42-wrongsecrets" not found`);
  });
  createNameSpaceForTeam.mockImplementation(async () => {
    throw new Error('Kubernetes API error');
  });

  await request(app)
    .post('/balancer/teams/team42/join')
    .send({ hmacvalue: validHmacFor('team42') })
    .expect(500);

  expect(createConfigmapForTeam).not.toHaveBeenCalled();
  expect(createSecretsfileForTeam).not.toHaveBeenCalled();
});

test('logout clears the team cookie', async () => {
  await request(app)
    .post('/balancer/teams/logout')
    .expect(200)
    .then((res) => {
      expect(res.headers['set-cookie']).toEqual(
        expect.arrayContaining([expect.stringContaining(`${get('cookieParser.cookieName')}=`)])
      );
      expect(res.headers['set-cookie']).toEqual(
        expect.arrayContaining([expect.stringContaining('Expires=Thu, 01 Jan 1970 00:00:00 GMT')])
      );
    });
});

test('reset passcode needs authentication if no cookie is sent', async () => {
  await request(app).post('/balancer/teams/reset-passcode').send().expect(401);
});

test('reset passcode is forbidden for admin', async () => {
  await request(app)
    .post('/balancer/teams/reset-passcode')
    .set('Cookie', [`${get('cookieParser.cookieName')}=t-${get('admin.username')}`])
    .send()
    .expect(403);
});

test('reset passcode fails with not found if team does not exist', async () => {
  const teamCookieValue = 't-test-team';
  const expectedCleanedTeam = 'test-team';

  changePasscodeHashForTeam.mockImplementation(() => {
    throw new Error(`deployments.apps "t-${expectedCleanedTeam}-wrongsecrets" not found`);
  });

  await request(app)
    .post(`/balancer/teams/reset-passcode`)
    .set('Cookie', [`${get('cookieParser.cookieName')}=${teamCookieValue}`])
    .send()
    .expect(404);
});

test('reset passcode resets passcode to new value if team exists', async () => {
  const teamCookieValue = 't-test-team';
  const expectedCleanedTeam = 'test-team';

  let newPasscode = null;

  await request(app)
    .post(`/balancer/teams/reset-passcode`)
    .set('Cookie', [`${get('cookieParser.cookieName')}=${teamCookieValue}`])
    .send()
    .expect(200)
    .then(({ body }) => {
      expect(body.message).toBe('Reset Passcode');
      expect(body.passcode).toMatch(/^[A-Z0-9]{8}$/);
      newPasscode = body.passcode;
    });

  expect(changePasscodeHashForTeam).toHaveBeenCalled();

  const callArgs = changePasscodeHashForTeam.mock.calls[0];
  expect(callArgs[0]).toBe(expectedCleanedTeam);
  expect(bcrypt.compareSync(newPasscode, callArgs[1])).toBe(true);
});

describe('wait-till-ready polling', () => {
  test('returns 200 immediately if deployment is already ready', async () => {
    getJuiceShopInstanceForTeamname.mockResolvedValue({ readyReplicas: 1 });

    await request(app).get('/balancer/teams/team42/wait-till-ready').expect(200);
  });

  test('handles transient undefined (missing deployment) and resolves on next check', async () => {
    getJuiceShopInstanceForTeamname
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ readyReplicas: 1 });

    await request(app).get('/balancer/teams/team42/wait-till-ready').expect(200);
  });
});

describe('parallel team provisioning dependencies and staging barriers', () => {
  const createDeferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };

  const setupInstanceNotFound = () => {
    getJuiceShopInstanceForTeamname.mockImplementation(async () => {
      throw new Error('deployments.apps "t-team42-wrongsecrets" not found');
    });
    getJuiceShopInstances.mockImplementation(async () => {
      return { items: [] };
    });
  };

  test('TEST 1: Namespace barrier - NO Stage 2 or Stage 3 operations start before namespace resolves', async () => {
    setupInstanceNotFound();
    const nsDeferred = createDeferred();
    let nsStartedResolve;
    const nsStartedPromise = new Promise((r) => {
      nsStartedResolve = r;
    });

    createNameSpaceForTeam.mockImplementation(() => {
      nsStartedResolve();
      return nsDeferred.promise;
    });

    let stage2Started = false;
    const markStage2Started = () => {
      stage2Started = true;
      return Promise.resolve();
    };

    createConfigmapForTeam.mockImplementation(markStage2Started);
    createSecretsfileForTeam.mockImplementation(markStage2Started);
    createChallenge33SecretForTeam.mockImplementation(markStage2Started);
    createChallenge62SecretForTeam.mockImplementation(markStage2Started);
    createChallenge62ConfigMapForTeam.mockImplementation(markStage2Started);
    createServiceAccountForWebTop.mockImplementation(markStage2Started);
    createServiceForTeam.mockImplementation(markStage2Started);
    createDesktopServiceForTeam.mockImplementation(markStage2Started);
    createNSPsforTeam.mockImplementation(markStage2Started);
    createK8sChallenge53DeploymentForTeam.mockImplementation(markStage2Started);

    const teamCreationPromise = request(app)
      .post('/balancer/teams/team42/join')
      .send({ hmacvalue: validHmacFor('team42') });
    const resPromise = teamCreationPromise.then((r) => r);

    // Wait deterministically for namespace creation to start
    await nsStartedPromise;

    expect(createNameSpaceForTeam).toHaveBeenCalled();
    expect(stage2Started).toBe(false);
    expect(createConfigmapForTeam).not.toHaveBeenCalled();
    expect(createK8sDeploymentForTeam).not.toHaveBeenCalled();

    // Now resolve namespace
    nsDeferred.resolve();
    const res = await resPromise;
    expect(res.status).toBe(200);
    expect(stage2Started).toBe(true);
  });

  test('TEST 2: Stage 2 concurrency - independent operations start concurrently before any resolve', async () => {
    setupInstanceNotFound();
    createNameSpaceForTeam.mockResolvedValue();

    const configMapDeferred = createDeferred();
    const secretDeferred = createDeferred();
    const saDeferred = createDeferred();
    const challenge53Deferred = createDeferred();

    const started = [];
    const checkAllStarted = () => {
      if (
        started.includes('configmap') &&
        started.includes('secretsfile') &&
        started.includes('serviceaccount') &&
        started.includes('challenge53')
      ) {
        allStartedResolve();
      }
    };

    let allStartedResolve;
    const allStartedPromise = new Promise((r) => {
      allStartedResolve = r;
    });

    createConfigmapForTeam.mockImplementation(() => {
      started.push('configmap');
      checkAllStarted();
      return configMapDeferred.promise;
    });
    createSecretsfileForTeam.mockImplementation(() => {
      started.push('secretsfile');
      checkAllStarted();
      return secretDeferred.promise;
    });
    createServiceAccountForWebTop.mockImplementation(() => {
      started.push('serviceaccount');
      checkAllStarted();
      return saDeferred.promise;
    });
    createK8sChallenge53DeploymentForTeam.mockImplementation(() => {
      started.push('challenge53');
      checkAllStarted();
      return challenge53Deferred.promise;
    });

    const teamCreationPromise = request(app)
      .post('/balancer/teams/team42/join')
      .send({ hmacvalue: validHmacFor('team42') });
    const resPromise = teamCreationPromise.then((r) => r);

    // Deterministically wait until all 4 have concurrently started without resolving any
    await allStartedPromise;

    expect(started).toContain('configmap');
    expect(started).toContain('secretsfile');
    expect(started).toContain('serviceaccount');
    expect(started).toContain('challenge53');

    // Stage 3 must not have started yet
    expect(createK8sDeploymentForTeam).not.toHaveBeenCalled();
    expect(createDesktopDeploymentForTeam).not.toHaveBeenCalled();
    expect(createRoleForWebTop).not.toHaveBeenCalled();

    // Now resolve all
    configMapDeferred.resolve();
    secretDeferred.resolve();
    saDeferred.resolve();
    challenge53Deferred.resolve();

    const res = await resPromise;
    expect(res.status).toBe(200);
  });

  test('TEST 3: Stage 3 barrier - Stage 3 does NOT start until ALL Stage 2 promises resolve', async () => {
    setupInstanceNotFound();
    createNameSpaceForTeam.mockResolvedValue();

    const d1 = createDeferred(); // Configmap
    const d2 = createDeferred(); // Secret
    const d3 = createDeferred(); // ServiceAccount

    let d1StartedResolve;
    const d1Started = new Promise((r) => {
      d1StartedResolve = r;
    });
    let d2StartedResolve;
    const d2Started = new Promise((r) => {
      d2StartedResolve = r;
    });
    let d3StartedResolve;
    const d3Started = new Promise((r) => {
      d3StartedResolve = r;
    });

    createConfigmapForTeam.mockImplementation(() => {
      d1StartedResolve();
      return d1.promise;
    });
    createSecretsfileForTeam.mockImplementation(() => {
      d2StartedResolve();
      return d2.promise;
    });
    createServiceAccountForWebTop.mockImplementation(() => {
      d3StartedResolve();
      return d3.promise;
    });

    let stage3Started = false;
    createK8sDeploymentForTeam.mockImplementation(() => {
      stage3Started = true;
      return Promise.resolve();
    });

    const teamCreationPromise = request(app)
      .post('/balancer/teams/team42/join')
      .send({ hmacvalue: validHmacFor('team42') });
    const resPromise = teamCreationPromise.then((r) => r);

    // Wait until all 3 have started
    await Promise.all([d1Started, d2Started, d3Started]);
    expect(stage3Started).toBe(false);

    // Resolve 1st Stage 2 promise
    d1.resolve();
    await new Promise((r) => setImmediate(r));
    expect(stage3Started).toBe(false);

    // Resolve 2nd Stage 2 promise
    d2.resolve();
    await new Promise((r) => setImmediate(r));
    expect(stage3Started).toBe(false);

    // Resolve 3rd Stage 2 promise - now all Stage 2 promises are resolved
    d3.resolve();

    const res = await resPromise;
    expect(res.status).toBe(200);
    expect(stage3Started).toBe(true);
  });

  test('TEST 4: Challenge 53 to Role barrier - createRoleForWebTop does NOT start before Challenge 53 deployment resolves', async () => {
    setupInstanceNotFound();
    createNameSpaceForTeam.mockResolvedValue();

    const challenge53Deferred = createDeferred();
    let challenge53StartedResolve;
    const challenge53Started = new Promise((r) => {
      challenge53StartedResolve = r;
    });

    createK8sChallenge53DeploymentForTeam.mockImplementation(() => {
      challenge53StartedResolve();
      return challenge53Deferred.promise;
    });

    let roleStarted = false;
    createRoleForWebTop.mockImplementation(() => {
      roleStarted = true;
      return Promise.resolve();
    });

    const teamCreationPromise = request(app)
      .post('/balancer/teams/team42/join')
      .send({ hmacvalue: validHmacFor('team42') });
    const resPromise = teamCreationPromise.then((r) => r);

    await challenge53Started;
    expect(createK8sChallenge53DeploymentForTeam).toHaveBeenCalled();
    expect(roleStarted).toBe(false);
    expect(createRoleForWebTop).not.toHaveBeenCalled();

    challenge53Deferred.resolve();
    const res = await resPromise;
    expect(res.status).toBe(200);
    expect(roleStarted).toBe(true);
  });

  test('TEST 5: Desktop Deployment dependency - createDesktopDeploymentForTeam does NOT start before ServiceAccount resolves', async () => {
    setupInstanceNotFound();
    createNameSpaceForTeam.mockResolvedValue();

    const saDeferred = createDeferred();
    let saStartedResolve;
    const saStarted = new Promise((r) => {
      saStartedResolve = r;
    });

    createServiceAccountForWebTop.mockImplementation(() => {
      saStartedResolve();
      return saDeferred.promise;
    });

    let desktopDeploymentStarted = false;
    createDesktopDeploymentForTeam.mockImplementation(() => {
      desktopDeploymentStarted = true;
      return Promise.resolve();
    });

    const teamCreationPromise = request(app)
      .post('/balancer/teams/team42/join')
      .send({ hmacvalue: validHmacFor('team42') });
    const resPromise = teamCreationPromise.then((r) => r);

    await saStarted;
    expect(createServiceAccountForWebTop).toHaveBeenCalled();
    expect(desktopDeploymentStarted).toBe(false);

    saDeferred.resolve();
    const res = await resPromise;
    expect(res.status).toBe(200);
    expect(desktopDeploymentStarted).toBe(true);
  });

  test('TEST 6: RoleBinding barrier - createRoleBindingForWebtop does NOT start before createRoleForWebTop resolves', async () => {
    setupInstanceNotFound();
    createNameSpaceForTeam.mockResolvedValue();

    const roleDeferred = createDeferred();
    let roleStartedResolve;
    const roleStarted = new Promise((r) => {
      roleStartedResolve = r;
    });

    createRoleForWebTop.mockImplementation(() => {
      roleStartedResolve();
      return roleDeferred.promise;
    });

    let roleBindingStarted = false;
    createRoleBindingForWebtop.mockImplementation(() => {
      roleBindingStarted = true;
      return Promise.resolve();
    });

    const teamCreationPromise = request(app)
      .post('/balancer/teams/team42/join')
      .send({ hmacvalue: validHmacFor('team42') });
    const resPromise = teamCreationPromise.then((r) => r);

    await roleStarted;
    expect(createRoleForWebTop).toHaveBeenCalled();
    expect(roleBindingStarted).toBe(false);

    roleDeferred.resolve();
    const res = await resPromise;
    expect(res.status).toBe(200);
    expect(roleBindingStarted).toBe(true);
  });

  test('TEST 7: WrongSecrets Deployment dependencies - does NOT start before ConfigMaps and Secrets resolve', async () => {
    setupInstanceNotFound();
    createNameSpaceForTeam.mockResolvedValue();

    const secret33Deferred = createDeferred();
    let secret33StartedResolve;
    const secret33Started = new Promise((r) => {
      secret33StartedResolve = r;
    });

    createChallenge33SecretForTeam.mockImplementation(() => {
      secret33StartedResolve();
      return secret33Deferred.promise;
    });

    let wrongsecretsDeploymentStarted = false;
    createK8sDeploymentForTeam.mockImplementation(() => {
      wrongsecretsDeploymentStarted = true;
      return Promise.resolve();
    });

    const teamCreationPromise = request(app)
      .post('/balancer/teams/team42/join')
      .send({ hmacvalue: validHmacFor('team42') });
    const resPromise = teamCreationPromise.then((r) => r);

    await secret33Started;
    expect(createChallenge33SecretForTeam).toHaveBeenCalled();
    expect(wrongsecretsDeploymentStarted).toBe(false);

    secret33Deferred.resolve();
    const res = await resPromise;
    expect(res.status).toBe(200);
    expect(wrongsecretsDeploymentStarted).toBe(true);
  });

  test('TEST 8: Stage 2 failure returns 500 and prevents Stage 3 execution', async () => {
    setupInstanceNotFound();
    createNameSpaceForTeam.mockResolvedValue();
    createConfigmapForTeam.mockRejectedValue(new Error('ConfigMap creation failed'));

    const res = await request(app)
      .post('/balancer/teams/team42/join')
      .send({ hmacvalue: validHmacFor('team42') })
      .expect(500);

    expect(res.body).toEqual({ message: 'Failed to Create Instance' });
    expect(createK8sDeploymentForTeam).not.toHaveBeenCalled();
    expect(createDesktopDeploymentForTeam).not.toHaveBeenCalled();
    expect(createRoleForWebTop).not.toHaveBeenCalled();
    expect(createRoleBindingForWebtop).not.toHaveBeenCalled();
  });

  test('TEST 9: Stage 3 failure returns 500 and prevents Stage 4 RoleBinding execution', async () => {
    setupInstanceNotFound();
    createNameSpaceForTeam.mockResolvedValue();
    createRoleForWebTop.mockRejectedValue(new Error('Role creation failed'));

    const res = await request(app)
      .post('/balancer/teams/team42/join')
      .send({ hmacvalue: validHmacFor('team42') })
      .expect(500);

    expect(res.body).toEqual({ message: 'Failed to Create Instance' });
    expect(createRoleBindingForWebtop).not.toHaveBeenCalled();
  });

  test('TEST 10: Namespace failure returns 500 and prevents all namespaced resources from starting', async () => {
    setupInstanceNotFound();
    createNameSpaceForTeam.mockRejectedValue(new Error('Namespace quota exceeded'));

    const res = await request(app)
      .post('/balancer/teams/team42/join')
      .send({ hmacvalue: validHmacFor('team42') })
      .expect(500);

    expect(res.body).toEqual({ message: 'Failed to Create Instance' });
    expect(createConfigmapForTeam).not.toHaveBeenCalled();
    expect(createSecretsfileForTeam).not.toHaveBeenCalled();
    expect(createChallenge33SecretForTeam).not.toHaveBeenCalled();
    expect(createChallenge62SecretForTeam).not.toHaveBeenCalled();
    expect(createChallenge62ConfigMapForTeam).not.toHaveBeenCalled();
    expect(createServiceAccountForWebTop).not.toHaveBeenCalled();
    expect(createServiceForTeam).not.toHaveBeenCalled();
    expect(createDesktopServiceForTeam).not.toHaveBeenCalled();
    expect(createNSPsforTeam).not.toHaveBeenCalled();
    expect(createK8sChallenge53DeploymentForTeam).not.toHaveBeenCalled();
    expect(createK8sDeploymentForTeam).not.toHaveBeenCalled();
    expect(createDesktopDeploymentForTeam).not.toHaveBeenCalled();
    expect(createRoleForWebTop).not.toHaveBeenCalled();
    expect(createRoleBindingForWebtop).not.toHaveBeenCalled();
  });

  test('TEST 11: Stage 4 RoleBinding failure returns 500', async () => {
    setupInstanceNotFound();
    createNameSpaceForTeam.mockResolvedValue();
    createRoleBindingForWebtop.mockRejectedValue(new Error('RoleBinding creation failed'));

    const res = await request(app)
      .post('/balancer/teams/team42/join')
      .send({ hmacvalue: validHmacFor('team42') })
      .expect(500);

    expect(res.body).toEqual({ message: 'Failed to Create Instance' });
  });

  test('TEST 12: Multiple concurrent Stage 2 rejections cleanly return 500 without crashing', async () => {
    setupInstanceNotFound();
    createNameSpaceForTeam.mockResolvedValue();
    createConfigmapForTeam.mockRejectedValue(new Error('ConfigMap error'));
    createSecretsfileForTeam.mockRejectedValue(new Error('Secret error'));
    createServiceAccountForWebTop.mockRejectedValue(new Error('SA error'));

    const res = await request(app)
      .post('/balancer/teams/team42/join')
      .send({ hmacvalue: validHmacFor('team42') })
      .expect(500);

    expect(res.body).toEqual({ message: 'Failed to Create Instance' });
  });
});
