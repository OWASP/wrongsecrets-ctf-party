// Mock for @kubernetes/client-node
class MockKubeConfig {
  loadFromCluster() {
    // Mock implementation
  }

  makeApiClient(ApiClass) {
    return new ApiClass();
  }
}

class MockAppsV1Api {
  listNamespacedDeployment() {
    return Promise.resolve({
      body: {
        items: []
      }
    });
  }
}

class MockCoreV1Api {
  listNamespace() {
    return Promise.resolve({
      body: {
        items: []
      }
    });
  }

  deleteNamespace() {
    return Promise.resolve({});
  }
}

module.exports = {
  KubeConfig: MockKubeConfig,
  AppsV1Api: MockAppsV1Api,
  CoreV1Api: MockCoreV1Api
};
