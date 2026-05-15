import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { IntlProvider } from 'react-intl';
import axios from 'axios';

import { JoinPage } from './JoinPage';

jest.mock('axios');
jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
  useLocation: () => ({
    search: '',
  }),
}), { virtual: true });
jest.mock('react-intl', () => ({
  IntlProvider: ({ children }) => children,
  FormattedMessage: ({ defaultMessage }) => defaultMessage || null,
  defineMessages: (messages) => messages,
  useIntl: () => ({
    formatMessage: ({ defaultMessage }) => defaultMessage,
  }),
}));

const baseDynamics = {
  react_gif_logo: 'https://example.com/logo.gif',
  k8s_env: 'k8s',
  heroku_wrongsecret_ctf_url: 'https://ctfd.example',
  ctfd_url: 'https://ctfd.example',
  s3_bucket_url: '',
  azure_blob_url: '',
  gcp_bucket_url: '',
  hmac_key: 'test-hmac-key',
  enable_password: false,
};

describe('JoinPage', () => {
  let container;
  let root;

  beforeEach(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    axios.get.mockResolvedValue({ data: baseDynamics });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    jest.resetAllMocks();
  });

  async function renderJoinPage() {
    await act(async () => {
      root.render(
        <IntlProvider locale="en" messages={{}}>
          <JoinPage />
        </IntlProvider>
      );
    });

    await act(async () => {
      await Promise.resolve();
    });
  }

  test('renders the join form with translated labels', async () => {
    await renderJoinPage();

    expect(container.textContent).toContain('Welcome!');
    expect(container.textContent).toContain('Teamname');
    expect(container.textContent).toContain('Create / Join Team');
  });

  test('renders the password input when password-based access is enabled', async () => {
    axios.get.mockResolvedValue({
      data: {
        ...baseDynamics,
        enable_password: true,
      },
    });

    await renderJoinPage();

    expect(container.querySelector('[data-test-id="password-input"]')).not.toBeNull();
  });
});
