describe('Team Creation and Joining Workflow', () => {
  it('should create a team, then allow a user to join it with the passcode', () => {
    // Generates a short, unique team name that is under the 16-character limit.
    const teamName = `ctf-${Date.now().toString().slice(-9)}`;

    // Set up a "spy" to intercept the network request that creates the team.
    cy.intercept('POST', `/balancer/teams/${teamName}/join`).as('createTeamRequest');

    // === PART 1: CREATE THE TEAM ===
    cy.visit('http://localhost:3000');
    cy.get('[data-test-id="teamname-input"]').type(teamName);
    cy.get('[data-test-id="create-join-team-button"]').click();

    // === PART 2: CAPTURE PASSCODE & JOIN ===
    // Wait for the network request to finish and get the passcode from its response data.
    cy.wait('@createTeamRequest').then((interception) => {
      const passcode = interception.response.body.passcode;

      // Now that we have the real passcode, go back to the homepage.
      cy.visit('http://localhost:3000');

      // Enter the same unique team name again.
      cy.get('[data-test-id="teamname-input"]').type(teamName);
      cy.get('[data-test-id="create-join-team-button"]').click();

      // On the "Joining team" page, type the real passcode we captured.
      cy.get('[data-test-id="passcode-input"]').type(passcode);
      cy.contains('button', 'Join Team').click();

      // === PART 3: FINAL VERIFICATION (with a long timeout) ===
      // Instead of waiting for a network call, we wait directly for the final button to appear.
      // We give it up to 2 minutes (120000ms) for the backend instance to get ready.
      cy.contains('Start Hacking', { timeout: 120000 }).should('be.visible');
      cy.contains('Start your Webtop').should('be.visible');
    });
  });
});
