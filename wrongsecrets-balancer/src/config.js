const config = require('../config/config.json');
const crypto = require('crypto');
const lodashGet = require('lodash/get');
const memoize = require('lodash/memoize');
const { logger } = require('./logger');

const generatedSensitiveConfigValues = new Map();

const getGeneratedSensitiveValue = (name, bytes, message) => {
  if (!generatedSensitiveConfigValues.has(name)) {
    generatedSensitiveConfigValues.set(name, crypto.randomBytes(bytes).toString('hex'));
    logger.warn(message);
  }

  return generatedSensitiveConfigValues.get(name);
};

const fetchConfigValue = (name, defaultValue) => {
  const envVarName = name
    .split('.')
    .map((string) => string.toUpperCase())
    .join('_');

  const envValue = process.env[envVarName];
  if (envValue) {
    return envValue;
  }

  const configValue = lodashGet(config, name, defaultValue);
  if (name === 'admin.password' && configValue === '12345678') {
    return getGeneratedSensitiveValue(
      name,
      16,
      'ADMIN_PASSWORD is not set; using an ephemeral per-process admin password.'
    );
  }

  if (name === 'cookieParser.secret' && configValue === 'askdbakhdajhvdsjavjdsgv') {
    return getGeneratedSensitiveValue(
      name,
      24,
      'COOKIEPARSER_SECRET is not set; using an ephemeral per-process cookie signing secret.'
    );
  }

  return configValue;
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
