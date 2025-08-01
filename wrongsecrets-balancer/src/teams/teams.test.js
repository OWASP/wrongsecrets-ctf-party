jest.mock('../kubernetes');
jest.mock('http-proxy');

const request = require('supertest');
const bcrypt = require('bcryptjs');
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
  createServiceAccountForWebTop,
  createRoleForWebTop,
  createRoleBindingForWebtop,
  createNSPsforTeam,
} = require('../kubernetes');

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
    .send({ hmacvalue: '4c8dd1f1306727c537aa96f0c59968b719740f2a30ccda92044ea59622565564' })
    .expect(200)
    .then(({ body }) => {
      expect(body.message).toBe('Created Instance');
      expect(body.passcode).toMatch(/[a-zA-Z0-9]{7}/);
      passcode = body.passcode;
    });

  expect(createConfigmapForTeam).toHaveBeenCalled();
  expect(createSecretsfileForTeam).toHaveBeenCalled();
  expect(createChallenge33SecretForTeam).toHaveBeenCalled();
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
  expect(createServiceForTeam).toBeCalledWith('team42');
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
  const team = 't-test-team';

  changePasscodeHashForTeam.mockImplementation(() => {
    throw new Error(`deployments.apps "${team}-wrongsecrets" not found`);
  });

  await request(app)
    .post(`/balancer/teams/reset-passcode`)
    .set('Cookie', [`${get('cookieParser.cookieName')}=${team}`])
    .send()
    .expect(404);
});

test('reset passcode resets passcode to new value if team exists', async () => {
  const team = 't-test-team';

  let newPasscode = null;

  await request(app)
    .post(`/balancer/teams/reset-passcode`)
    .set('Cookie', [`${get('cookieParser.cookieName')}=${team}`])
    .send()
    .expect(200)
    .then(({ body }) => {
      expect(body.message).toBe('Reset Passcode');
      expect(body.passcode).toMatch(/[a-zA-Z0-9]{7}/);
      newPasscode = body.passcode;
    });

  expect(changePasscodeHashForTeam).toHaveBeenCalled();

  const callArgs = changePasscodeHashForTeam.mock.calls[0];
  expect(callArgs[0]).toBe(team);
  expect(bcrypt.compareSync(newPasscode, callArgs[1])).toBe(true);
});
