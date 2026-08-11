const config = require('../config/config.json');
const crypto = require('crypto');
const lodashGet = require('lodash/get');
const memoize = require('lodash/memoize');
const { logger } = require('./logger');

const fetchConfigValue = (name, defaultValue) => {
  const envVarName = name
    .split('.')
    .map((string) => string.toUpperCase())
    .join('_');

  return process.env[envVarName] || lodashGet(config, name, defaultValue);
};

const get = memoize(fetchConfigValue);
module.exports.get = get;

const getCreateTeamHmacKey = memoize(() => {
  const configuredKey = process.env['REACT_APP_CREATE_TEAM_HMAC_KEY'];
  if (configuredKey) {
    return configuredKey;
  }

  const generatedKey = crypto.randomBytes(32).toString('hex');
  logger.warn(
    'REACT_APP_CREATE_TEAM_HMAC_KEY is not set; using an ephemeral per-process HMAC key.'
  );
  return generatedKey;
});
module.exports.getCreateTeamHmacKey = getCreateTeamHmacKey;

const extractTeamName = (req) => {
  return process.env['NODE_ENV'] === 'test'
    ? req.cookies[get('cookieParser.cookieName')]
    : req.signedCookies[get('cookieParser.cookieName')];
};
module.exports.extractTeamName = extractTeamName;
