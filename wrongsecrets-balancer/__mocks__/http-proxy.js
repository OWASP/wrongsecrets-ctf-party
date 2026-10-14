const webProxy = jest.fn((req, res) => res.send('proxied'));
const wsProxy = jest.fn();
const proxyListeners = new Map();
const onProxy = jest.fn((event, listener) => proxyListeners.set(event, listener));

module.exports = {
  __mockProxy: {
    web: webProxy,
    ws: wsProxy,
    on: onProxy,
    emit(event, ...args) {
      return proxyListeners.get(event)?.(...args);
    },
  },
  createProxyServer() {
    return {
      web: webProxy,
      ws: wsProxy,
      on: onProxy,
    };
  },
};
