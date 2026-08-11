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

  function setInputValue(input, value) {
    const valueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    ).set;

    valueSetter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
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

    expect(container.querySelector('input[name="password"]')).not.toBeNull();
  });

  test('keeps the teamname field constrained to valid team names', async () => {
    await renderJoinPage();

    const teamnameInput = container.querySelector('input[name="teamname"]');

    expect(teamnameInput.getAttribute('pattern')).toBe('^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$');
    expect(teamnameInput.getAttribute('maxlength')).toBe('16');
    expect(teamnameInput.getAttribute('title')).toBe(
      "Teamnames must consist of lowercase letter, number or '-'"
    );
  });

  test('shows a failure message when the join request fails without a response', async () => {
    axios.post.mockRejectedValue(new Error('Network error'));

    await renderJoinPage();

    const teamnameInput = container.querySelector('input[name="teamname"]');
    const form = container.querySelector('form');

    await act(async () => {
      setInputValue(teamnameInput, 'admin');
    });

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(container.textContent).toContain('Failed to create / join the team');
  });
});
