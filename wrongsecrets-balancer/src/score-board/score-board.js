const express = require('express');

const router = express.Router();

const { getJuiceShopInstances } = require('../kubernetes');
const { logger } = require('../logger');

// Generated via curl https://wrongsecrets-ctf.herokuapp.com/api/challenges | jq '.data | map({ key: .key, value: .difficulty }) | from_entries'
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
});

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
async function getTopTeams(req, res) {
  try {
    const instances = await getJuiceShopInstances();

    logger.debug('Listing teams');

    const items = instances?.items || instances?.body?.items || [];

    const teams = items.map((team) => {
      let challengeProgress;
      try {
        const rawProgress =
          team.metadata?.annotations?.['wrongsecrets-ctf-party/challenges'] ?? '[]';
        challengeProgress = JSON.parse(rawProgress);
      } catch (err) {
        logger.warn(`Failed to parse challenges annotation for team ${team.metadata?.name}:`, err);
        challengeProgress = [];
      }

      const scoredChallenges = challengeProgress.map((progress) => {
        let difficulty = keyDifficultyMapping[progress.key];

        if (difficulty === undefined) {
          logger.warn(
            `Difficulty for challenge "${progress.key}" is unknown. Falling back to default difficulty.`
          );
          difficulty = 1;
        }

        return {
          ...progress,
          difficulty,
        };
      });

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

    teams.sort((a, b) => b.score - a.score);
    // Get the top 25 teams
    const topTeams = teams.slice(0, 25);

    return res.status(200).send({ totalTeams: items.length, teams: topTeams });
  } catch (error) {
    logger.error('Failed to get scoreboard data:', error);
    return res.status(500).json({ message: 'Failed to retrieve scoreboard data' });
  }
}

router.get('/top', getTopTeams);

module.exports = router;
module.exports.getTopTeams = getTopTeams;
module.exports.keyDifficultyMapping = keyDifficultyMapping;
