const webProxy = jest.fn((req, res) => res.send('proxied'));
const wsProxy = jest.fn();

module.exports = {
  __mockProxy: {
    web: webProxy,
    ws: wsProxy,
  },
  createProxyServer() {
    return {
      web: webProxy,
      ws: wsProxy,
    };
  },
};
