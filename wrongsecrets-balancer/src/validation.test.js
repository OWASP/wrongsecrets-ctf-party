const { isValidAdminTeamname, isValidTeamname } = require('./validation');

describe('isValidTeamname', () => {
  test.each([
    ['a', true],
    ['ab', true],
    ['team-42', true],
    ['a--b', true],
    ['-team', false],
    ['team-', false],
    ['TEAM', false],
    ['', false],
  ])('validates %s', (teamname, expected) => {
    expect(isValidTeamname(teamname)).toBe(expected);
  });
});

describe('isValidAdminTeamname', () => {
  test.each([
    ['t-a', true],
    ['t-team-42', true],
    ['team-42', false],
    ['t-TEAM', false],
    ['t-team-', false],
    ['', false],
  ])('validates %s', (teamname, expected) => {
    expect(isValidAdminTeamname(teamname)).toBe(expected);
  });
});
