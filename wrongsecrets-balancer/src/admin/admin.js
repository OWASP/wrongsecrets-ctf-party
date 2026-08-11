const express = require('express');
const Joi = require('joi');
const expressJoiValidation = require('express-joi-validation');

const router = express.Router();
const validator = expressJoiValidation.createValidator();

const {
  getJuiceShopInstances,
  deletePodForTeam,
  deleteNamespaceForTeam,
  deleteDesktopPodForTeam,
  deleteChallenge53DeploymentForTeam,
} = require('../kubernetes');

const { get } = require('../config');
const { logger } = require('../logger');
const { TEAMNAME_PATTERN, isValidAdminTeamname } = require('../validation');

const paramsSchema = Joi.object({
  team: Joi.string().required().max(16).pattern(TEAMNAME_PATTERN),
});

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
function ensureAdminLogin(req, res, next) {
  logger.debug('Running admin check');
  if (!isValidAdminTeamname(req.teamname)) {
    return res.status(401).send();
  }

  if (req.teamname === `t-${get('admin.username')}`) {
    logger.debug('Admin check succeeded');
    return next();
  }
  return res.status(401).send();
}

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
async function listInstances(req, res) {
  try {
    logger.info('Listing all team instances');

    const instances = await getJuiceShopInstances();

    // Fix: Check if instances and instances.body exist
    if (!instances || !instances.items) {
      logger.warn('No instances found or invalid response structure');
      return res.status(200).json({
        items: [],
      });
    }

    const teams = instances.items
      .filter((deployment) => deployment.metadata.labels.app === 'wrongsecrets')
      .map((deployment) => {
        const team = deployment.metadata.labels.team;
        const annotations = deployment.metadata.annotations || {};

        return {
          team,
          name: deployment.metadata.name,
          ready: deployment.status?.readyReplicas > 0,
          createdAt: new Date(deployment.metadata.creationTimestamp),
          lastConnect: new Date(
            parseInt(annotations['wrongsecrets-ctf-party/lastRequest']) ||
              deployment.metadata.creationTimestamp
          ),
        };
      });

    res.status(200).json({
      items: teams,
    });
  } catch (error) {
    logger.error('Error listing instances:', error.message);
    res.status(500).json({
      error: 'Failed to list instances',
      message: error.message,
    });
  }
}

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
async function restartInstance(req, res) {
  try {
    const teamname = req.params.team;
    logger.info(`Restarting deployment for team: '${teamname}'`);

    await deletePodForTeam(teamname);

    res.send();
  } catch (error) {
    logger.error(error);
    res.status(500).send();
  }
}

async function restartDesktopInstance(req, res) {
  try {
    const teamname = req.params.team;
    logger.info(`Restarting Dektopdeployment for team: '${teamname}'`);

    await deleteDesktopPodForTeam(teamname);

    res.send();
  } catch (error) {
    logger.error(error);
    res.status(500).send();
  }
}

async function restartChallenge53Deployment(req, res) {
  try {
    const teamname = req.params.team;
    logger.info(`Restarting challenge53 for team: '${teamname}'`);
    await deleteChallenge53DeploymentForTeam(teamname);
    res.send();
  } catch (error) {
    logger.error(error);
    res.status(500).send();
  }
}

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
async function deleteInstance(req, res) {
  try {
    const teamname = req.params.team;
    logger.info(`Deleting deployment for team: '${teamname}'`);

    await deleteNamespaceForTeam(teamname);

    res.send();
  } catch (error) {
    logger.error(error);
    res.status(500).send();
  }
}

router.use(ensureAdminLogin);
router.get('/all', listInstances);
router.post('/teams/:team/restart', validator.params(paramsSchema), restartInstance);
router.post('/teams/:team/restartdesktop', validator.params(paramsSchema), restartDesktopInstance);
router.post(
  '/teams/:team/restartchallenge53',
  validator.params(paramsSchema),
  restartChallenge53Deployment
);
router.delete('/teams/:team/delete', validator.params(paramsSchema), deleteInstance);
module.exports = router;
