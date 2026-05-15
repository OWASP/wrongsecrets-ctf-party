import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import { ScoreBoard } from './ScoreBoard';

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
});
