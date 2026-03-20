const { get } = require('./config');
const { logger } = require('./logger');
const { attachUpgradeHandler } = require('./proxy/proxy');

const app = require('./app.js');

const server = app.listen(get('port'), () =>
  logger.info(`wrongsecrets-balancer listening on port ${get('port')}!`)
);

attachUpgradeHandler(server);

process.on('SIGTERM', () => {
  logger.warn('Recieved "SIGTERM" Signal shutting down.');
  server.close();
  process.exit(0);
});
