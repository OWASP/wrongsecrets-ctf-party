const express = require('express');

const router = express.Router();

const { getJuiceShopInstances } = require('../kubernetes');
const { logger } = require('../logger');

// Generated via curl https://wrongsecrets-ctf.herokuapp.com/api/challenges | jq '.data | map({ key: (.key | sub("-"; "")), value: .difficulty }) | from_entries'
const keyDifficultyMapping = Object.freeze({
  challenge0: 1,
  challenge1: 1,
  challenge2: 1,
  challenge3: 1,
  challenge4: 2,
  challenge5: 2,
  challenge6: 2,
  challenge7: 4,
  challenge8: 2,
  challenge9: 3,
  challenge10: 4,
  challenge11: 4,
  challenge12: 3,
  challenge13: 3,
  challenge14: 4,
  challenge15: 2,
  challenge16: 3,
  challenge17: 3,
  challenge18: 5,
  challenge19: 4,
  challenge20: 4,
  challenge21: 5,
  challenge22: 5,
  challenge23: 1,
  challenge24: 2,
  challenge25: 2,
  challenge26: 2,
  challenge27: 2,
  challenge28: 1,
  challenge29: 1,
  challenge30: 2,
  challenge31: 1,
  challenge32: 2,
  challenge33: 2,
  challenge34: 2,
  challenge35: 1,
  challenge36: 5,
  challenge37: 2,
  challenge38: 1,
  challenge39: 1,
  challenge40: 1,
  challenge41: 3,
  challenge42: 2,
  challenge43: 1,
  challenge44: 4,
  challenge45: 4,
  challenge46: 4,
  challenge47: 2,
  challenge48: 2,
  challenge49: 3,
  challenge50: 2,
  challenge51: 2,
  challenge52: 2,
  challenge53: 3,
  challenge54: 2,
  challenge55: 1,
  challenge56: 1,
  challenge57: 2,
  challenge58: 2,
  challenge59: 2,
  challenge60: 2,
  challenge61: 2,
});

let cachedScoreboardResponse = null;
let lastScoreboardFetchTime = 0;
const SCOREBOARD_CACHE_TTL_MS = 3000;

function invalidateScoreboardCache() {
  cachedScoreboardResponse = null;
  lastScoreboardFetchTime = 0;
}

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
async function getTopTeams(req, res) {
  try {
    const now = Date.now();
    if (cachedScoreboardResponse && now - lastScoreboardFetchTime < SCOREBOARD_CACHE_TTL_MS) {
      return res.status(200).send(cachedScoreboardResponse);
    }

    const instances = await getJuiceShopInstances();

    logger.debug('Listing teams');

    const items = instances?.items || instances?.body?.items || [];

    const wrongsecretsDeployments = items.filter(
      (item) => item.metadata?.labels?.app === 'wrongsecrets'
    );
    const targetDeployments = wrongsecretsDeployments.length > 0 ? wrongsecretsDeployments : items;

    const rawTeams = targetDeployments.map((team) => {
      let challengeProgress;
      try {
        const rawProgress =
          team.metadata?.annotations?.['wrongsecrets-ctf-party/challenges'] ?? '[]';
        challengeProgress = JSON.parse(rawProgress);
      } catch (err) {
        logger.warn(`Failed to parse challenges annotation for team ${team.metadata?.name}:`, err);
        challengeProgress = [];
      }

      const seenChallenges = new Set();
      const scoredChallenges = [];

      for (const progress of Array.isArray(challengeProgress) ? challengeProgress : []) {
        if (!progress || typeof progress.key !== 'string' || !/^challenge\d+$/.test(progress.key)) {
          continue;
        }

        // Filter challenges that were already completed not to be counted again
        if (seenChallenges.has(progress.key)) {
          continue;
        }
        seenChallenges.add(progress.key);

        // Metadata protection: Authoritative server mapping always takes precedence over user/annotation values
        let difficulty = keyDifficultyMapping[progress.key];
        if (difficulty === undefined) {
          if (
            typeof progress.difficulty === 'number' &&
            !Number.isNaN(progress.difficulty) &&
            progress.difficulty >= 1 &&
            progress.difficulty <= 5
          ) {
            difficulty = Math.floor(progress.difficulty);
          } else {
            logger.warn(
              `Difficulty for challenge "${progress.key}" is unknown. Falling back to default difficulty.`
            );
            difficulty = 1;
          }
        }

        // Only retain authoritative { key, difficulty } metadata
        scoredChallenges.push({
          key: progress.key,
          difficulty,
        });
      }

      let score = 0;
      for (const { difficulty } of scoredChallenges) {
        score += (difficulty || 1) * 10;
      }

      return {
        name: team.metadata?.labels?.team || team.metadata?.name,
        score,
        challenges: scoredChallenges,
      };
    });

    const teamMap = new Map();
    for (const team of rawTeams) {
      if (!teamMap.has(team.name) || team.score > teamMap.get(team.name).score) {
        teamMap.set(team.name, team);
      }
    }
    const teams = Array.from(teamMap.values());
    teams.sort((a, b) => b.score - a.score);
    // Get the top 25 teams
    const topTeams = teams.slice(0, 25);

    const payload = { totalTeams: teams.length, teams: topTeams };
    cachedScoreboardResponse = payload;
    lastScoreboardFetchTime = now;

    return res.status(200).send(payload);
  } catch (error) {
    logger.error('Failed to get scoreboard data:', error);
    return res.status(500).json({ message: 'Failed to retrieve scoreboard data' });
  }
}

router.get('/top', getTopTeams);

module.exports = router;
module.exports.getTopTeams = getTopTeams;
module.exports.keyDifficultyMapping = keyDifficultyMapping;
module.exports.invalidateScoreboardCache = invalidateScoreboardCache;
