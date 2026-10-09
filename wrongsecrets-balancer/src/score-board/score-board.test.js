jest.mock('../kubernetes');
jest.mock('../logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { getJuiceShopInstances } = require('../kubernetes');
const { getTopTeams } = require('./score-board');

describe('score-board getTopTeams', () => {
  let req;
  let res;

  beforeEach(() => {
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
                { key: 'challenge0' }, // difficulty 1 -> 10 pts
              ]),
            },
          },
        },
        {
          metadata: {
            labels: { team: 'team-gold' },
            annotations: {
              'wrongsecrets-ctf-party/challenges': JSON.stringify([
                { key: 'challenge7' }, // difficulty 4 -> 40 pts
                { key: 'challenge18' }, // difficulty 5 -> 50 pts
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
    expect(response.teams[0].score).toBe(90);
    expect(response.teams[1].name).toBe('team-bronze');
    expect(response.teams[1].score).toBe(10);
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
                  { key: 'challenge1' }, // difficulty 1 -> 10 pts
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
    expect(response.teams[0].score).toBe(10);
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
    expect(response.teams[0].score).toBe(10);
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
});
