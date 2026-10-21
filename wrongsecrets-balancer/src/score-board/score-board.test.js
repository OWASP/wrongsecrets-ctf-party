jest.mock('../kubernetes');
jest.mock('../logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const request = require('supertest');
const { getJuiceShopInstances } = require('../kubernetes');
const { getTopTeams, invalidateScoreboardCache } = require('./score-board');
const app = require('../app');

describe('score-board getTopTeams', () => {
  let req;
  let res;

  beforeEach(() => {
    invalidateScoreboardCache();
    req = {};
    res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    getJuiceShopInstances.mockReset();
  });

  test('successfully processes instances with direct items property and sorts by score', async () => {
    getJuiceShopInstances.mockResolvedValue({
      items: [
        {
          metadata: {
            labels: { team: 'team-bronze' },
            annotations: {
              'wrongsecrets-ctf-party/challenges': JSON.stringify([
                { key: 'challenge0' }, // difficulty 1 -> 100 pts
              ]),
            },
          },
        },
        {
          metadata: {
            labels: { team: 'team-gold' },
            annotations: {
              'wrongsecrets-ctf-party/challenges': JSON.stringify([
                { key: 'challenge7' }, // difficulty 4 -> 400 pts
                { key: 'challenge18' }, // difficulty 5 -> 500 pts
              ]),
            },
          },
        },
      ],
    });

    await getTopTeams(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.send.mock.calls[0][0];
    expect(response.totalTeams).toBe(2);
    expect(response.teams).toHaveLength(2);
    expect(response.teams[0].name).toBe('team-gold');
    expect(response.teams[0].score).toBe(1700);
    expect(response.teams[1].name).toBe('team-bronze');
    expect(response.teams[1].score).toBe(100);
  });

  test('handles legacy instances.body.items structure correctly', async () => {
    getJuiceShopInstances.mockResolvedValue({
      body: {
        items: [
          {
            metadata: {
              labels: { team: 'team-legacy' },
              annotations: {
                'wrongsecrets-ctf-party/challenges': JSON.stringify([
                  { key: 'challenge1' }, // difficulty 1 -> 100 pts
                ]),
              },
            },
          },
        ],
      },
    });

    await getTopTeams(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.send.mock.calls[0][0];
    expect(response.totalTeams).toBe(1);
    expect(response.teams[0].score).toBe(100);
  });

  test('does not yield NaN when challenges exceed known difficulty map', async () => {
    getJuiceShopInstances.mockResolvedValue({
      items: [
        {
          metadata: {
            labels: { team: 'team-advanced' },
            annotations: {
              'wrongsecrets-ctf-party/challenges': JSON.stringify([
                { key: 'challenge74' }, // unmapped challenge
              ]),
            },
          },
        },
      ],
    });

    await getTopTeams(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.send.mock.calls[0][0];
    expect(response.teams[0].score).toBe(100);
    expect(Number.isNaN(response.teams[0].score)).toBe(false);
  });

  test('gracefully handles missing or malformed challenges annotations', async () => {
    getJuiceShopInstances.mockResolvedValue({
      items: [
        {
          metadata: {
            name: 'team-malformed-instance',
            labels: { team: 'team-malformed' },
            annotations: {
              'wrongsecrets-ctf-party/challenges': '{invalid-json',
            },
          },
        },
        {
          metadata: {
            name: 'team-no-annotations-instance',
            labels: { team: 'team-no-annotations' },
          },
        },
      ],
    });

    await getTopTeams(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.send.mock.calls[0][0];
    expect(response.totalTeams).toBe(2);
    expect(response.teams[0].score).toBe(0);
    expect(response.teams[1].score).toBe(0);
  });

  test('returns 500 status when getJuiceShopInstances rejects', async () => {
    getJuiceShopInstances.mockRejectedValue(new Error('K8s API down'));

    await getTopTeams(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Failed to retrieve scoreboard data',
    });
  });

  test('filters by app: wrongsecrets and deduplicates multiple deployments for the same team', async () => {
    getJuiceShopInstances.mockResolvedValue({
      items: [
        {
          metadata: {
            name: 'wrongsecrets-desktop',
            labels: { team: 'team-omega', app: 'virtualdesktop' },
            annotations: {},
          },
        },
        {
          metadata: {
            name: 't-team-omega-wrongsecrets',
            labels: { team: 'team-omega', app: 'wrongsecrets' },
            annotations: {
              'wrongsecrets-ctf-party/challenges': JSON.stringify([{ key: 'challenge0' }]),
            },
          },
        },
      ],
    });

    await getTopTeams(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.send.mock.calls[0][0];
    expect(response.totalTeams).toBe(1);
    expect(response.teams).toHaveLength(1);
    expect(response.teams[0].name).toBe('team-omega');
    expect(response.teams[0].score).toBe(100);
  });

  test('GET /balancer/score-board/top returns scoreboard payload through Express router', async () => {
    getJuiceShopInstances.mockResolvedValue({
      items: [
        {
          metadata: {
            name: 't-team-routed-wrongsecrets',
            labels: { team: 'team-routed', app: 'wrongsecrets' },
            annotations: {
              'wrongsecrets-ctf-party/challenges': JSON.stringify([{ key: 'challenge1' }]),
            },
          },
        },
      ],
    });

    const response = await request(app)
      .get('/balancer/score-board/top')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body.totalTeams).toBe(1);
    expect(response.body.teams[0].name).toBe('team-routed');
    expect(response.body.teams[0].score).toBe(100);
  });

  test('uses difficulty stored directly on solved challenge progress object', async () => {
    getJuiceShopInstances.mockResolvedValue({
      items: [
        {
          metadata: {
            labels: { team: 'team-explicit-diff' },
            annotations: {
              'wrongsecrets-ctf-party/challenges': JSON.stringify([
                { key: 'challenge74', difficulty: 5 }, // explicit difficulty from body -> 50 pts
              ]),
            },
          },
        },
      ],
    });

    await getTopTeams(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.send.mock.calls[0][0];
    expect(response.teams[0].score).toBe(1000);
  });

  test('caches scoreboard response within TTL and clears on invalidateScoreboardCache', async () => {
    getJuiceShopInstances.mockResolvedValue({
      items: [
        {
          metadata: {
            labels: { team: 'team-cached' },
            annotations: {
              'wrongsecrets-ctf-party/challenges': JSON.stringify([{ key: 'challenge0' }]),
            },
          },
        },
      ],
    });

    await getTopTeams(req, res);
    expect(getJuiceShopInstances).toHaveBeenCalledTimes(1);

    // Second call within TTL should return cached payload without querying k8s again
    await getTopTeams(req, res);
    expect(getJuiceShopInstances).toHaveBeenCalledTimes(1);

    // Invalidation clears the cache
    invalidateScoreboardCache();
    await getTopTeams(req, res);
    expect(getJuiceShopInstances).toHaveBeenCalledTimes(2);
  });

  test('GET /balancer/score-board/ serves the scoreboard UI html', async () => {
    await request(app)
      .get('/balancer/score-board/')
      .expect(200)
      .expect('Content-Type', /text\/html/);
  });

  test('filters challenges that were already completed so they are not counted again', async () => {
    getJuiceShopInstances.mockResolvedValue({
      items: [
        {
          metadata: {
            labels: { team: 'team-duplicate-test' },
            annotations: {
              'wrongsecrets-ctf-party/challenges': JSON.stringify([
                { key: 'challenge0' }, // diff 1 -> 100 pts
                { key: 'challenge0' }, // duplicate solve of challenge0
                { key: 'challenge1' }, // diff 1 -> 100 pts
                { key: 'challenge0' }, // another duplicate
              ]),
            },
          },
        },
      ],
    });

    await getTopTeams(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.send.mock.calls[0][0];
    expect(response.teams).toHaveLength(1);
    expect(response.teams[0].score).toBe(200); // 100 + 100 (duplicates ignored)
    expect(response.teams[0].challenges).toHaveLength(2);
    expect(response.teams[0].challenges.map((c) => c.key)).toEqual(['challenge0', 'challenge1']);
  });

  test('prevents player adjustment of challenge metadata by enforcing authoritative difficulty and stripping unexpected fields', async () => {
    getJuiceShopInstances.mockResolvedValue({
      items: [
        {
          metadata: {
            labels: { team: 'team-tamper-test' },
            annotations: {
              'wrongsecrets-ctf-party/challenges': JSON.stringify([
                {
                  key: 'challenge0',
                  difficulty: 999, // tampered difficulty, official is 1
                  customPoints: 10000,
                  hacked: true,
                },
              ]),
            },
          },
        },
      ],
    });

    await getTopTeams(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.send.mock.calls[0][0];
    expect(response.teams[0].score).toBe(100); // Enforced to authoritative difficulty (1 * 100 = 100)
    expect(response.teams[0].challenges[0]).toEqual({
      key: 'challenge0',
      difficulty: 1,
    });
    expect(response.teams[0].challenges[0].customPoints).toBeUndefined();
    expect(response.teams[0].challenges[0].hacked).toBeUndefined();
  });

  test('GET /balancer/score-board redirects to trailing slash for scoreboard UI', async () => {
    await request(app).get('/balancer/score-board').expect(301);
  });
});
