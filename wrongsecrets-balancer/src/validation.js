const TEAMNAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function isValidTeamname(teamname) {
  return typeof teamname === 'string' && TEAMNAME_PATTERN.test(teamname);
}

function isValidAdminTeamname(teamname) {
  return (
    typeof teamname === 'string' && teamname.startsWith('t-') && isValidTeamname(teamname.slice(2))
  );
}

module.exports = {
  TEAMNAME_PATTERN,
  isValidTeamname,
  isValidAdminTeamname,
};
