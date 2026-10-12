import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import App from './App';

jest.mock('axios');
jest.mock(
  'react-router-dom',
  () => ({
    BrowserRouter: ({ children }) => <div>{children}</div>,
    Routes: ({ children }) => <div>{children}</div>,
    Route: ({ path, element }) => (path === '/' ? <div>{element}</div> : null),
    useNavigate: () => jest.fn(),
    useLocation: () => ({ search: '' }),
    useParams: () => ({ team: 'test' }),
  }),
  { virtual: true }
);

jest.mock('react-intl', () => ({
  IntlProvider: ({ children }) => <div>{children}</div>,
  FormattedMessage: ({ defaultMessage }) => defaultMessage || null,
  defineMessages: (messages) => messages,
  useIntl: () => ({
    formatMessage: ({ defaultMessage }) => defaultMessage,
  }),
}));

beforeAll(() => {
  window.matchMedia =
    window.matchMedia ||
    function () {
      return {
        matches: false,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      };
    };
});

it('renders without crashing', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  axios.get.mockResolvedValue({
    data: {
      react_gif_logo: 'https://example.com/logo.gif',
      k8s_env: 'k8s',
      heroku_wrongsecret_ctf_url: '',
      ctfd_url: '',
      s3_bucket_url: '',
      azure_blob_url: '',
      gcp_bucket_url: '',
      hmac_key: 'test',
      enable_password: false,
    },
  });

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<App />);
  });

  await act(async () => {
    await Promise.resolve();
  });

  expect(container).toBeDefined();

  await act(async () => {
    root.unmount();
  });
  container.remove();
});
