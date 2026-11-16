import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import { ScoreBoard } from './ScoreBoard';

jest.mock(
  'react-router-dom',
  () => ({
    Link: ({ to, children, ...props }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  }),
  { virtual: true }
);

jest.mock('react-intl', () => ({
  FormattedMessage: ({ defaultMessage }) => defaultMessage || null,
}));

describe('ScoreBoard', () => {
  let container;
  let root;
  let fetchSpy;

  beforeEach(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      json: async () => ({
        teams: [
          {
            name: 'team-alpha',
            score: 42,
            challenges: ['challenge-1', 'challenge-2'],
          },
        ],
      }),
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    fetchSpy.mockRestore();
  });

  test('renders fetched team scores', async () => {
    await act(async () => {
      root.render(<ScoreBoard />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchSpy).toHaveBeenCalledWith('/balancer/score-board/top');
    expect(container.textContent).toContain('team-alpha');
    expect(container.textContent).toContain('42 points');
    expect(container.textContent).toContain('2 solved challenges');
  });

  test('renders correct table semantics with thead and tbody elements', async () => {
    await act(async () => {
      root.render(<ScoreBoard />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const theadElements = container.querySelectorAll('thead');
    const tbodyElements = container.querySelectorAll('tbody');

    expect(theadElements.length).toBe(1);
    expect(tbodyElements.length).toBe(1);
  });

  test('renders navigation link back to challenges', async () => {
    await act(async () => {
      root.render(<ScoreBoard />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const backButton = container.querySelector('[data-test-id="back-to-challenges-button"]');
    expect(backButton).not.toBeNull();
    expect(backButton.getAttribute('href')).toBe('/');
  });
});
