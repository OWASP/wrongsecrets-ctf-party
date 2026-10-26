const { KubeConfig, AppsV1Api, CoreV1Api } = require('@kubernetes/client-node');
const kc = new KubeConfig();
kc.loadFromCluster();

const k8sAppsApi = kc.makeApiClient(AppsV1Api);
const k8sCoreApi = kc.makeApiClient(CoreV1Api);

const { logger } = require('./logger');

const getTeamInstances = (namespaceName) =>
  k8sAppsApi
    .listNamespacedDeployment({
      namespace: namespaceName,
    })
    .catch((error) => {
      logger.info(error);
      throw new Error(error.response?.body?.message || error.body?.message || error.message);
    });
module.exports.getTeamInstances = getTeamInstances;

const getTeamJuiceShopInstances = (namespaceName) =>
  k8sAppsApi
    .listNamespacedDeployment({
      namespace: namespaceName,
      pretty: true,
      allowWatchBookmarks: true,
      labelSelector: 'app in (wrongsecrets, virtualdesktop, secret-challenge-53)',
    })
    .catch((error) => {
      logger.info(error);
      throw new Error(error.response?.body?.message || error.body?.message || error.message);
    });
module.exports.getTeamJuiceShopInstances = getTeamJuiceShopInstances;

const getNamespaces = () =>
  k8sCoreApi
    .listNamespace({
      allowWatchBookmarks: true,
      limit: 200,
    })
    .catch((error) => {
      logger.info(error);
      throw new Error(error.response?.body?.message || error.body?.message || error.message);
    });
module.exports.getNamespaces = getNamespaces;

const deleteNamespaceForTeam = async (namespaceName) => {
  await k8sCoreApi.deleteNamespace({ name: namespaceName }).catch((error) => {
    logger.info(error);
    throw new Error(error.response?.body?.message || error.body?.message || error.message);
  });
};
module.exports.deleteNamespaceForTeam = deleteNamespaceForTeam;
