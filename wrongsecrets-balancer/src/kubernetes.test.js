jest.mock('@kubernetes/client-node', () => {
  const mockPatch = jest.fn().mockResolvedValue({});
  return {
    KubeConfig: jest.fn().mockImplementation(() => ({
      loadFromCluster: jest.fn(),
      loadFromDefault: jest.fn(),
      makeApiClient: jest.fn().mockReturnValue({
        patchNamespacedDeployment: mockPatch,
      }),
    })),
    AppsV1Api: jest.fn(),
    CoreV1Api: jest.fn(),
    CustomObjectsApi: jest.fn(),
    RbacAuthorizationV1Api: jest.fn(),
    NetworkingV1Api: jest.fn(),
    PatchUtils: {
      PATCH_FORMAT_JSON_MERGE_PATCH: 'application/merge-patch+json',
    },
  };
});

const { changePasscodeHashForTeam } = require('./kubernetes');

describe('changePasscodeHashForTeam E2E Header Regression', () => {
  test('correctly configures middleware to enforce application/merge-patch+json content-type', async () => {
    const k8s = require('@kubernetes/client-node');
    const mockApi = new k8s.KubeConfig().makeApiClient();
    const mockPatch = mockApi.patchNamespacedDeployment;

    await changePasscodeHashForTeam('test-team', 'hash123');

    expect(mockPatch).toHaveBeenCalled();
    const [param, options] = mockPatch.mock.calls[0];

    expect(param.name).toBe('t-test-team-wrongsecrets');
    expect(param.namespace).toBe('t-test-team');
    expect(options.middleware).toBeDefined();
    expect(options.middleware.length).toBe(1);

    const mockContext = { setHeaderParam: jest.fn() };
    await options.middleware[0].pre(mockContext).toPromise();
    expect(mockContext.setHeaderParam).toHaveBeenCalledWith(
      'Content-Type',
      'application/merge-patch+json'
    );
  });
});
