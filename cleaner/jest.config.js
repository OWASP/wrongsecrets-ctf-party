module.exports = {
  setupFiles: ['./.jest/setEnvVars.js'],
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@kubernetes/client-node$': '<rootDir>/.jest/__mocks__/@kubernetes/client-node.js'
  }
};
