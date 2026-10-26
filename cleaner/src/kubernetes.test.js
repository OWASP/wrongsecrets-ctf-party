const mockListNamespacedDeployment = jest.fn();
const mockListNamespace = jest.fn();
const mockDeleteNamespace = jest.fn();
const mockLoadFromCluster = jest.fn();

jest.mock('@kubernetes/client-node', () => {
  return {
    KubeConfig: jest.fn().mockImplementation(() => ({
      loadFromCluster: mockLoadFromCluster,
      makeApiClient: (apiClass) => {
        if (apiClass.name === 'AppsV1Api') {
          return {
            listNamespacedDeployment: mockListNamespacedDeployment,
          };
        }
        if (apiClass.name === 'CoreV1Api') {
          return {
            listNamespace: mockListNamespace,
            deleteNamespace: mockDeleteNamespace,
          };
        }
        return {};
      },
    })),
    AppsV1Api: class AppsV1Api {},
    CoreV1Api: class CoreV1Api {},
  };
});

const {
  getTeamInstances,
  getTeamJuiceShopInstances,
  getNamespaces,
  deleteNamespaceForTeam,
} = require('./kubernetes');

describe('cleaner/src/kubernetes.js tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getTeamInstances', () => {
    it('calls listNamespacedDeployment with the namespace object', async () => {
      const mockResult = { items: [{ metadata: { name: 'dep-1' } }] };
      mockListNamespacedDeployment.mockResolvedValueOnce(mockResult);

      const result = await getTeamInstances('t-team1');
      expect(mockListNamespacedDeployment).toHaveBeenCalledWith({
        namespace: 't-team1',
      });
      expect(result).toBe(mockResult);
    });

    it('throws formatted error if listNamespacedDeployment fails', async () => {
      mockListNamespacedDeployment.mockRejectedValueOnce({
        response: { body: { message: 'Forbidden' } },
      });

      await expect(getTeamInstances('t-team1')).rejects.toThrow('Forbidden');
    });
  });

  describe('getTeamJuiceShopInstances', () => {
    it('calls listNamespacedDeployment with namespace and labelSelector', async () => {
      const mockResult = { items: [{ metadata: { name: 'wrongsecrets-1' } }] };
      mockListNamespacedDeployment.mockResolvedValueOnce(mockResult);

      const result = await getTeamJuiceShopInstances('t-team2');
      expect(mockListNamespacedDeployment).toHaveBeenCalledWith({
        namespace: 't-team2',
        pretty: true,
        allowWatchBookmarks: true,
        labelSelector: 'app in (wrongsecrets, virtualdesktop, secret-challenge-53)',
      });
      expect(result).toBe(mockResult);
    });

    it('throws error when listing juice shop instances fails', async () => {
      mockListNamespacedDeployment.mockRejectedValueOnce(new Error('Cluster timeout'));

      await expect(getTeamJuiceShopInstances('t-team2')).rejects.toThrow('Cluster timeout');
    });
  });

  describe('getNamespaces', () => {
    it('calls listNamespace with limit and watch options', async () => {
      const mockResult = { items: [{ metadata: { name: 't-team1' } }] };
      mockListNamespace.mockResolvedValueOnce(mockResult);

      const result = await getNamespaces();
      expect(mockListNamespace).toHaveBeenCalledWith({
        allowWatchBookmarks: true,
        limit: 200,
      });
      expect(result).toBe(mockResult);
    });

    it('throws error when listNamespace fails', async () => {
      mockListNamespace.mockRejectedValueOnce({
        body: { message: 'Unauthorized' },
      });

      await expect(getNamespaces()).rejects.toThrow('Unauthorized');
    });
  });

  describe('deleteNamespaceForTeam', () => {
    it('calls deleteNamespace with { name: namespaceName }', async () => {
      mockDeleteNamespace.mockResolvedValueOnce({});

      await deleteNamespaceForTeam('t-team3');
      expect(mockDeleteNamespace).toHaveBeenCalledWith({
        name: 't-team3',
      });
    });

    it('throws error when deleteNamespace fails', async () => {
      mockDeleteNamespace.mockRejectedValueOnce(new Error('Namespace not found'));

      await expect(deleteNamespaceForTeam('t-team3')).rejects.toThrow('Namespace not found');
    });
  });
});
