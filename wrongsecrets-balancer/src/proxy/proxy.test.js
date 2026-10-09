jest.mock('../kubernetes');
jest.mock('http-proxy');

const { advanceBy, advanceTo, clear } = require('jest-date-mock');
const request = require('supertest');
const { __mockProxy } = require('http-proxy');

const app = require('../app');
const { get } = require('../config');
const {
  attachUpgradeHandler,
  evictConnectionCache,
  clearConnectionCache,
  pruneConnectionCache,
  connectionCache,
} = require('./proxy');
const {
  getJuiceShopInstanceForTeamname,
  updateLastRequestTimestampForTeam,
  deleteNamespaceForTeam,
} = require('../kubernetes');

afterAll(async () => {
  await new Promise((resolve) => setTimeout(() => resolve(), 500)); // avoid jest open handle error
});

beforeEach(() => {
  clear();
  getJuiceShopInstanceForTeamname.mockClear();
  updateLastRequestTimestampForTeam.mockClear();
  __mockProxy.web.mockClear();
  __mockProxy.ws.mockClear();
});

test('/balancer/ should return the balancer ui', async () => {
  await request(app)
    .get('/balancer/')
    // if this returns a 302 locally this is likely caused by not having the frontend compiled. run `npm run build` in `wrongsecrets-balancer/ui`
    .expect(200)
    .expect('Content-Type', /text\/html/);
});

test('should proxy requests going to JuiceShop when they got a team cookie', async () => {
  await request(app)
    .get('/rest/admin/application-version')
    .set('Cookie', ['balancer=t-team42'])
    .send()
    .expect(200)
    .expect('proxied');
});

test("should redirect to /balancer/ when requests don't have a team cookie", async () => {
  await request(app)
    .get('/rest/admin/application-version')
    .send()
    .expect(302)
    .then((res) => {
      expect(res.header.location).toBe('/balancer/');
    });
});

test('should set the last-connect timestamp when a new team gets proxied the first time', async () => {
  advanceTo(new Date(1555555555555));

  await request(app)
    .get('/rest/admin/application-version')
    .set('Cookie', ['balancer=t-team-last-connect-test'])
    .send()
    .expect(200)
    .expect('proxied');

  expect(updateLastRequestTimestampForTeam).toHaveBeenCalledWith('team-last-connect-test');
});

test('should update the last-connect timestamp on requests at most every 10sec', async () => {
  advanceTo(new Date(1000000000000));

  await request(app)
    .get('/rest/admin/application-version')
    .set('Cookie', ['balancer=t-team-update-last-connect-test'])
    .send()
    .expect(200)
    .expect('proxied');

  expect(updateLastRequestTimestampForTeam).toHaveBeenCalledWith('team-update-last-connect-test');

  updateLastRequestTimestampForTeam.mockClear();

  await request(app)
    .get('/rest/admin/application-version')
    .set('Cookie', ['balancer=t-team-update-last-connect-test'])
    .send()
    .expect(200)
    .expect('proxied');

  expect(updateLastRequestTimestampForTeam).not.toHaveBeenCalled();

  // Wait for >10s
  advanceBy(10 * 1000 + 1);

  await request(app)
    .get('/rest/admin/application-version')
    .set('Cookie', ['balancer=t-team-update-last-connect-test'])
    .send()
    .expect(200)
    .expect('proxied');

  expect(updateLastRequestTimestampForTeam).toHaveBeenCalledWith('team-update-last-connect-test');
});

test('should only call getJuiceShopInstanceForTeamname on requests at most every 10sec', async () => {
  advanceTo(new Date(1000000000000));

  await request(app)
    .get('/rest/admin/application-version')
    .set('Cookie', ['balancer=t-team-get-instance-test'])
    .send()
    .expect(200);

  expect(getJuiceShopInstanceForTeamname).toHaveBeenCalled();

  getJuiceShopInstanceForTeamname.mockClear();

  await request(app)
    .get('/rest/admin/application-version')
    .set('Cookie', ['balancer=t-team-get-instance-test'])
    .send()
    .expect(200)
    .expect('proxied');

  expect(getJuiceShopInstanceForTeamname).not.toHaveBeenCalled();

  // Wait for >10s
  advanceBy(10 * 1000 + 1);

  await request(app)
    .get('/rest/admin/application-version')
    .set('Cookie', ['balancer=t-team-get-instance-test'])
    .send()
    .expect(200)
    .expect('proxied');

  expect(getJuiceShopInstanceForTeamname).toHaveBeenCalled();
});

test('should redirect to /balancer/ when the instance is currently restarting', async () => {
  getJuiceShopInstanceForTeamname.mockReturnValue({ readyReplicas: 0 });

  await request(app)
    .get('/rest/admin/application-version')
    .set('Cookie', ['balancer=t-restarting-instance'])
    .send()
    .expect(302)
    .then((res) => {
      expect(res.header.location).toBe(
        '/balancer/?msg=instance-restarting&teamname=restarting-instance'
      );
    });
});

test('should redirect to /balancer/ when the instance is not existing', async () => {
  getJuiceShopInstanceForTeamname.mockImplementation(() => {
    throw new Error();
  });

  await request(app)
    .get('/rest/admin/application-version')
    .set('Cookie', ['balancer=t-missing-instance'])
    .send()
    .expect(302)
    .then((res) => {
      expect(res.header.location).toBe(
        '/balancer/?msg=instance-not-found&teamname=missing-instance'
      );
    });
});

test('should reject admin actions for malformed team names', async () => {
  await request(app)
    .post('/balancer/admin/teams/TEAM/restart')
    .set('Cookie', [`${get('cookieParser.cookieName')}=t-${get('admin.username')}`])
    .expect(400);
});

test('should rewrite /balancer/mcp to /mcp before proxying', async () => {
  __mockProxy.web.mockClear();

  await request(app).post('/balancer/mcp').set('Cookie', ['balancer=t-team42']).send().expect(200);

  expect(__mockProxy.web).toHaveBeenCalledTimes(1);
  const proxiedReq = __mockProxy.web.mock.calls[0][0];
  const target = __mockProxy.web.mock.calls[0][2];

  expect(proxiedReq.url).toBe('/mcp');
  expect(target.target).toBe('http://t-team42-wrongsecrets.t-team42.svc:8090');
});

test('should forward json body for /balancer/mcp requests', async () => {
  __mockProxy.web.mockClear();

  const payload = { jsonrpc: '2.0', id: 1, method: 'tools/list' };

  await request(app)
    .post('/balancer/mcp')
    .set('Cookie', ['balancer=t-team42'])
    .send(payload)
    .expect(200);

  const proxiedReq = __mockProxy.web.mock.calls[0][0];
  expect(proxiedReq.body).toEqual(payload);
});

test('should attach websocket upgrade handler only once', () => {
  const listeners = {};
  const server = {
    on: jest.fn((event, handler) => {
      listeners[event] = handler;
    }),
  };

  attachUpgradeHandler(server);
  attachUpgradeHandler(server);

  expect(server.on).toHaveBeenCalledTimes(1);
  expect(listeners.upgrade).toBeDefined();
});

test('should proxy /websockets upgrades to virtualdesktop with valid team cookie', () => {
  const listeners = {};
  const server = {
    on: jest.fn((event, handler) => {
      listeners[event] = handler;
    }),
  };

  attachUpgradeHandler(server);

  const socket = { destroy: jest.fn() };
  const req = {
    url: '/websockets',
    headers: {
      cookie: 'balancer=t-team42',
    },
  };
  const head = Buffer.from('');

  listeners.upgrade(req, socket, head);

  expect(socket.destroy).not.toHaveBeenCalled();
  expect(__mockProxy.ws).toHaveBeenCalledTimes(1);
  expect(__mockProxy.ws).toHaveBeenCalledWith(req, socket, head, {
    target: 'ws://t-team42-virtualdesktop.t-team42.svc:8080',
    ws: true,
  });
});

test('should proxy /socket.io upgrades to virtualdesktop with valid team cookie', () => {
  const listeners = {};
  const server = {
    on: jest.fn((event, handler) => {
      listeners[event] = handler;
    }),
  };

  attachUpgradeHandler(server);

  const socket = { destroy: jest.fn() };
  const req = {
    url: '/socket.io/?EIO=4&transport=websocket',
    headers: {
      cookie: 'balancer=t-team42',
    },
  };
  const head = Buffer.from('');

  listeners.upgrade(req, socket, head);

  expect(socket.destroy).not.toHaveBeenCalled();
  expect(__mockProxy.ws).toHaveBeenCalledTimes(1);
  expect(__mockProxy.ws).toHaveBeenCalledWith(req, socket, head, {
    target: 'ws://t-team42-virtualdesktop.t-team42.svc:8080',
    ws: true,
  });
});

test('should proxy websocket upgrade when desktop referer is present', () => {
  const listeners = {};
  const server = {
    on: jest.fn((event, handler) => {
      listeners[event] = handler;
    }),
  };

  attachUpgradeHandler(server);

  const socket = { destroy: jest.fn() };
  const req = {
    url: '/unlisted-websocket-route',
    headers: {
      cookie: 'balancer=t-team42',
      referer: 'http://localhost:3000/?desktop',
    },
  };

  listeners.upgrade(req, socket, Buffer.from(''));

  expect(socket.destroy).not.toHaveBeenCalled();
  expect(__mockProxy.ws).toHaveBeenCalledTimes(1);
});

test('should destroy socket for unsupported websocket upgrade paths', () => {
  const listeners = {};
  const server = {
    on: jest.fn((event, handler) => {
      listeners[event] = handler;
    }),
  };

  attachUpgradeHandler(server);

  const socket = { destroy: jest.fn() };
  const req = {
    url: '/unsupported-path',
    headers: {
      cookie: 'balancer=t-team42',
    },
  };

  listeners.upgrade(req, socket, Buffer.from(''));

  expect(socket.destroy).toHaveBeenCalledTimes(1);
  expect(__mockProxy.ws).not.toHaveBeenCalled();
});

describe('connectionCache eviction and bounded lifecycle', () => {
  beforeEach(() => {
    clearConnectionCache();
  });

  test('evictConnectionCache deletes specific team entry', () => {
    connectionCache.set('team-alpha', Date.now());
    connectionCache.set('team-beta', Date.now());

    evictConnectionCache('team-alpha');

    expect(connectionCache.has('team-alpha')).toBe(false);
    expect(connectionCache.has('team-beta')).toBe(true);
  });

  test('clearConnectionCache empties the entire cache', () => {
    connectionCache.set('team-alpha', Date.now());
    connectionCache.set('team-beta', Date.now());

    clearConnectionCache();

    expect(connectionCache.size).toBe(0);
  });

  test('pruneConnectionCache removes entries older than TTL', () => {
    const now = 1000000;
    connectionCache.set('team-stale', now - 70000);
    connectionCache.set('team-fresh', now - 10000);

    pruneConnectionCache(now);

    expect(connectionCache.has('team-stale')).toBe(false);
    expect(connectionCache.has('team-fresh')).toBe(true);
  });

  test('evicts cache entry when instance readiness check fails', async () => {
    connectionCache.set('team-failing', Date.now() - 20000);
    getJuiceShopInstanceForTeamname.mockRejectedValue(new Error('Instance not found'));

    await request(app)
      .get('/rest/admin/application-version')
      .set('Cookie', ['balancer=t-team-failing'])
      .send()
      .expect(302);

    expect(connectionCache.has('team-failing')).toBe(false);
  });

  test('admin instance deletion evicts team from connection cache', async () => {
    connectionCache.set('team-to-delete', Date.now());
    deleteNamespaceForTeam.mockResolvedValue();

    await request(app)
      .delete('/balancer/admin/teams/team-to-delete/delete')
      .set('Cookie', [`balancer=t-${get('admin.username')}`])
      .send()
      .expect(200);

    expect(connectionCache.has('team-to-delete')).toBe(false);
  });
});
