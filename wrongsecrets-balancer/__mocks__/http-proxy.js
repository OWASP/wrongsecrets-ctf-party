const webProxy = jest.fn((req, res) => res.send('proxied'));
const wsProxy = jest.fn();
const onProxy = jest.fn();

module.exports = {
  __mockProxy: {
    web: webProxy,
    ws: wsProxy,
    on: onProxy,
  },
  createProxyServer() {
    return {
      web: webProxy,
      ws: wsProxy,
      on: onProxy,
    };
  },
};
