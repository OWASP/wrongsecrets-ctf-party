const express = require('express');
const httpProxy = require('http-proxy');
const proxy = httpProxy.createProxyServer();
const cookieParser = require('cookie-parser');

const { get, extractTeamName } = require('../config');
const { logger } = require('../logger');
const { isValidTeamname } = require('../validation');
const {
  getJuiceShopInstanceForTeamname,
  updateLastRequestTimestampForTeam,
  recordSolvedChallengeForTeam,
} = require('../kubernetes');
const { keyDifficultyMapping } = require('../score-board/score-board');

const CORRECT_ANSWER_MARKER = 'answer is correct';

function extractDifficultyFromBody(body, challengeKey) {
  if (typeof body === 'string') {
    // 1. Look for difficulty stars in WrongSecrets challenge heading:
    // e.g. <span data-cy="challenge-title">Challenge 7</span> <span>☆☆☆☆</span>
    const starsMatch =
      body.match(
        /<span[^>]*data-cy=["']challenge-title["'][^>]*>[\s\S]*?<\/span>\s*<span[^>]*>\s*([☆★]+)\s*<\/span>/i
      ) ||
      body.match(
        /<p[^>]*class=["'][^"']*h1[^"']*["'][^>]*>[\s\S]*?<span[^>]*>\s*([☆★]+)\s*<\/span>/i
      );

    if (starsMatch && starsMatch[1]) {
      const starCount = starsMatch[1].length;
      if (starCount >= 1 && starCount <= 5) {
        return starCount;
      }
    }

    // 2. Look for JSON difficulty if response is JSON (e.g. { "difficulty": 4 }):
    const jsonMatch = body.match(/"difficulty"\s*:\s*(\d+)/i);
    if (jsonMatch && jsonMatch[1]) {
      const diff = Number.parseInt(jsonMatch[1], 10);
      if (diff >= 1 && diff <= 5) {
        return diff;
      }
    }
  }

  // 3. Fallback to keyDifficultyMapping or default 1
  return keyDifficultyMapping[challengeKey] || 1;
}

function getSubmittedChallengeKey(req) {
  if ((req.method || '').toUpperCase() !== 'POST') {
    return undefined;
  }

  const requestUrl = new URL(req.url || '/', 'http://localhost');
  // The action=submit field is in the form body, so rely on the response marker instead.
  if (requestUrl.searchParams.get('action') === 'reset') {
    return undefined;
  }

  const challengeMatch = requestUrl.pathname.match(/^\/challenge\/challenge-(\d+)\/?$/);
  return challengeMatch ? `challenge${challengeMatch[1]}` : undefined;
}

proxy.on('proxyReq', (proxyReq, req) => {
  if (getSubmittedChallengeKey(req)) {
    proxyReq.setHeader('accept-encoding', 'identity');
  }

  if (!req.body || Object.keys(req.body).length === 0) {
    return;
  }

  const method = (req.method || '').toUpperCase();
  if (!['POST', 'PUT', 'PATCH'].includes(method)) {
    return;
  }

  const contentType = proxyReq.getHeader('Content-Type') || req.get('content-type') || '';
  if (!String(contentType).includes('application/json')) {
    return;
  }

  const bodyData = JSON.stringify(req.body);
  proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
  proxyReq.write(bodyData);
});

proxy.on('proxyRes', (proxyRes, req) => {
  const challengeKey = getSubmittedChallengeKey(req);
  if (!challengeKey || proxyRes.statusCode < 200 || proxyRes.statusCode >= 300) {
    return;
  }

  const contentEncoding = proxyRes.headers['content-encoding'];
  if (contentEncoding && contentEncoding !== 'identity') {
    logger.warn(`Cannot inspect compressed response for ${challengeKey} submission`);
    return;
  }

  const teamname = req.cleanedTeamname;
  if (!isValidTeamname(teamname)) {
    logger.warn(`Cannot record ${challengeKey} solve with invalid team name: ${teamname}`);
    return;
  }

  let responseTail = '';
  let recorded = false;
  let bufferedBody = '';
  const MAX_BUFFERED_BODY_BYTES = 64 * 1024;

  proxyRes.on('data', (chunk) => {
    if (recorded) {
      return;
    }

    const chunkStr = chunk.toString('utf8');
    if (bufferedBody.length < MAX_BUFFERED_BODY_BYTES) {
      bufferedBody += chunkStr;
    }
    const responseText = responseTail + chunkStr;
    if (
      responseText.includes(CORRECT_ANSWER_MARKER) &&
      !responseText.includes('Your answer is incorrect')
    ) {
      recorded = true;
      const difficulty = extractDifficultyFromBody(bufferedBody, challengeKey);
      recordSolvedChallengeForTeam(teamname, challengeKey, difficulty).catch((error) => {
        logger.error(`Failed to record ${challengeKey} solve for team ${teamname}:`, error);
      });
      return;
    }

    responseTail = responseText.slice(-(CORRECT_ANSWER_MARKER.length - 1));
  });
});

const router = express.Router();

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
function redirectJuiceShopTrafficWithoutBalancerCookies(req, res, next) {
  if (!req.teamname) {
    logger.debug('Got request without team cookie in proxy. Redirecting to /balancer/');
    return res.redirect('/balancer/');
  }
  return next();
}

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
function redirectAdminTrafficToBalancerPage(req, res, next) {
  if (req.teamname === `t-${get('admin.username')}`) {
    logger.debug('Got admin request in proxy. Redirecting to /balancer/');
    return res.redirect('/balancer/?msg=logged-as-admin');
  }
  return next();
}

const connectionCache = new Map();
const MAX_CONNECTION_CACHE_SIZE = 10000;
const CONNECTION_CACHE_TTL_MS = 60 * 1000;

function pruneConnectionCache(currentTime = Date.now()) {
  for (const [key, timestamp] of connectionCache.entries()) {
    if (currentTime - timestamp > CONNECTION_CACHE_TTL_MS) {
      connectionCache.delete(key);
    }
  }
  while (connectionCache.size > MAX_CONNECTION_CACHE_SIZE) {
    const oldestKey = connectionCache.keys().next().value;
    connectionCache.delete(oldestKey);
  }
}

function setConnectionCache(teamname, currentTime) {
  if (connectionCache.size >= MAX_CONNECTION_CACHE_SIZE) {
    pruneConnectionCache(currentTime);
  }
  connectionCache.delete(teamname);
  connectionCache.set(teamname, currentTime);
}

function evictConnectionCache(teamname) {
  if (teamname) {
    connectionCache.delete(teamname);
  }
}

function clearConnectionCache() {
  connectionCache.clear();
}

function shouldProxyUpgradeToVirtualDesktop(requestUrl) {
  const { pathname } = new URL(requestUrl, 'http://localhost');
  return (
    pathname === '/guaclite' ||
    pathname.startsWith('/guaclite/') ||
    pathname === '/websockets' ||
    pathname.startsWith('/websockets/') ||
    pathname === '/api/websockets' ||
    pathname.startsWith('/api/websockets/') ||
    pathname === '/ws/api/websockets' ||
    pathname.startsWith('/ws/api/websockets/') ||
    pathname === '/socket.io' ||
    pathname === '/socket.io/' ||
    pathname.startsWith('/socket.io/') ||
    pathname === '/files/socket.io' ||
    pathname === '/files/socket.io/'
  );
}

function requestLooksLikeDesktopUpgrade(req) {
  if (shouldProxyUpgradeToVirtualDesktop(req.url || '/')) {
    return true;
  }

  const referer = req.headers?.referer || req.headers?.Referer || '';
  return String(referer).includes('/?desktop');
}

function redirectToBalancerWithMessage(res, message, teamname) {
  const encodedTeamname = encodeURIComponent(teamname);
  return res.redirect(`/balancer/?msg=${message}&teamname=${encodedTeamname}`);
}

function handleUpgradeRequest(req, socket, head) {
  if (!requestLooksLikeDesktopUpgrade(req)) {
    socket.destroy();
    return;
  }

  cookieParser(get('cookieParser.secret'))(req, {}, () => {});
  const upgradeTeamname = extractTeamName(req);

  if (!isValidTeamname(upgradeTeamname)) {
    logger.info(`Got malformed teamname during websocket upgrade: ${upgradeTeamname}`);
    socket.destroy();
    return;
  }

  logger.info(`Proxying websocket upgrade request for ${req.url} with team ${upgradeTeamname}`);
  proxy.ws(req, socket, head, {
    target: `ws://${upgradeTeamname}-virtualdesktop.${upgradeTeamname}.svc:8080`,
    ws: true,
  });
}

function attachUpgradeHandler(server) {
  if (server.__wrongsecretsUpgradeHandlerAttached) {
    return;
  }
  server.__wrongsecretsUpgradeHandlerAttached = true;
  server.on('upgrade', handleUpgradeRequest);
}

/**
 * Checks at most every 10sec if the deployment the traffic should go to is ready.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
async function checkIfInstanceIsUp(req, res, next) {
  const teamname = req.cleanedTeamname;

  const currentTime = new Date().getTime();
  if (connectionCache.has(teamname) && currentTime - connectionCache.get(teamname) < 10000) {
    return next();
  }

  try {
    const { readyReplicas } = await getJuiceShopInstanceForTeamname(teamname);

    if (readyReplicas === 1) {
      return next();
    }

    evictConnectionCache(teamname);
    logger.warn(`Tried to proxy for team ${teamname}, but no ready instance found.`);
    return redirectToBalancerWithMessage(res, 'instance-restarting', teamname);
  } catch (error) {
    evictConnectionCache(teamname);
    logger.warn(`Could not find instance for team: '${teamname}'`);
    logger.warn(JSON.stringify(error));
    return redirectToBalancerWithMessage(res, 'instance-not-found', teamname);
  }
}

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
async function updateLastConnectTimestamp(req, res, next) {
  const currentTime = new Date().getTime();
  const teamname = req.cleanedTeamname;

  try {
    if (connectionCache.has(teamname)) {
      const timeDifference = currentTime - connectionCache.get(teamname);
      if (timeDifference > 10000) {
        setConnectionCache(teamname, currentTime);
        await updateLastRequestTimestampForTeam(teamname);
      }
    } else {
      await updateLastRequestTimestampForTeam(teamname);
      setConnectionCache(teamname, currentTime);
    }
  } catch (error) {
    logger.warn(`Failed to update lastRequest timestamp for team '${teamname}'"`);
    logger.warn(error.message);
    logger.warn(JSON.stringify(error));
  }
  next();
}

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
function proxyTrafficToJuiceShop(req, res) {
  const teamname = req.teamname;
  if (!isValidTeamname(teamname)) {
    logger.info(`Got malformed teamname: ${teamname}`);
    return res.redirect('/balancer/');
  }
  const currentReferrerForDesktop = '/?desktop';
  const isMcpPath =
    req.path === '/mcp' ||
    req.path.startsWith('/mcp/') ||
    req.path === '/balancer/mcp' ||
    req.path.startsWith('/balancer/mcp/');
  logger.debug(
    `Proxying request ${req.method.toLocaleUpperCase()} ${
      req.path
    } with matcher for referer: ${currentReferrerForDesktop}`
  );
  let target;
  if (
    (req.query != null && req.query.desktop != null) ||
    (req.headers['referer'] !== undefined &&
      req.headers['referer'].includes(currentReferrerForDesktop)) ||
    (req.headers['Referer'] !== undefined &&
      req.headers['Referer'].includes(currentReferrerForDesktop)) ||
    req.path === '/js/filebrowser.js' ||
    req.path === '/css/filebrowser.css' ||
    req.path === '/files/socket.io/socket.io.js' ||
    req.path === '/js/vendor/jquery.min.js' ||
    req.path === '/files/socket.io/' ||
    req.path === '/files/socket.io/socket.io.js.map' ||
    req.path === '/files/socket.io/socket.io.min.js' ||
    req.path.startsWith('/assets/selkies-core') ||
    req.path.startsWith('/assets/selkies-admin') ||
    req.path === '/api/websockets' ||
    req.path === '/ws/api/websockets'
  ) {
    target = {
      target: `http://${teamname}-virtualdesktop.${teamname}.svc:8080`,
      ws: true,
    };
  } else {
    target = {
      target: `http://${teamname}-wrongsecrets.${teamname}.svc:${isMcpPath ? 8090 : 8080}`,
      ws: true,
    };
  }
  logger.info(`we got ${teamname} requesting ${target.target}`);

  // Support same-origin MCP calls from the balancer UI by rewriting
  // /balancer/mcp[/...] to /mcp[/...] before forwarding to wrongsecrets.
  if (req.url === '/balancer/mcp' || req.url.startsWith('/balancer/mcp?')) {
    req.url = req.url.replace('/balancer/mcp', '/mcp');
  } else if (req.url.startsWith('/balancer/mcp/')) {
    req.url = req.url.replace('/balancer/mcp/', '/mcp/');
  }

  proxy.web(req, res, target, (error) => {
    logger.warn(`Proxy fail '${error.code}' for: ${req.method.toLocaleUpperCase()} ${req.path}`);

    if (error.code !== 'ENOTFOUND' && error.code !== 'EHOSTUNREACH') {
      logger.error(error.message);
    } else {
      logger.debug(error.message);
    }
  });
}

router.use(
  redirectJuiceShopTrafficWithoutBalancerCookies,
  redirectAdminTrafficToBalancerPage,
  checkIfInstanceIsUp,
  updateLastConnectTimestamp,
  proxyTrafficToJuiceShop
);

module.exports = router;
module.exports.attachUpgradeHandler = attachUpgradeHandler;
module.exports.evictConnectionCache = evictConnectionCache;
module.exports.clearConnectionCache = clearConnectionCache;
module.exports.pruneConnectionCache = pruneConnectionCache;
module.exports.connectionCache = connectionCache;
module.exports.MAX_CONNECTION_CACHE_SIZE = MAX_CONNECTION_CACHE_SIZE;
module.exports.extractDifficultyFromBody = extractDifficultyFromBody;
