describe('Team Creation and Joining Workflow', () => {
  it('should create a team, then allow a user to join it with the passcode', () => {
    // Generates a short, unique team name that is under the 16-character limit.
    const teamName = `ctf-${Date.now().toString().slice(-9)}`;

    // Set up a "spy" to intercept the network request that creates the team.
    cy.intercept('POST', `/balancer/teams/${teamName}/join`).as('createTeamRequest');

    // === PART 1: CREATE THE TEAM ===
    cy.visit('/');
    cy.get('[data-test-id="teamname-input"]').type(teamName);
    cy.get('[data-test-id="create-join-team-button"]').click();

    // === PART 2: CAPTURE PASSCODE & JOIN ===
    // Wait for the create request to finish, then read the displayed passcode from the UI.
    cy.wait('@createTeamRequest').then((interception) => {
      expect(interception.response.statusCode).to.eq(200);

      // The passcode is hidden behind a hover in the UI (display: none by default).
      // We use { force: true } if we wanted to click it, but here we just need its text.
      // Cypress's .invoke('text') will work on hidden elements.
      // We should wait for the element to exist in the DOM first.
      cy.get('[data-test-id="passcode-display"]', { timeout: 10000 })
        .invoke('text')
        .then((displayedPasscode) => {
          const passcode = displayedPasscode.replace(/\s+/g, '');

          expect(passcode).to.match(/^[A-Z0-9]{8}$/);

          cy.clearCookies();
          cy.clearLocalStorage();

          // Now that we have the real passcode, go back to the homepage.
          cy.visit('/');

          // Enter the same unique team name again.
          cy.get('[data-test-id="teamname-input"]').type(teamName);
          cy.get('[data-test-id="create-join-team-button"]').click();

          // On the "Joining team" page, type the real passcode we captured.
          cy.get('[data-test-id="passcode-input"]', { timeout: 15000 }).should('be.visible').type(passcode);
          cy.get('[data-test-id="join-team-button"]').click();

          // === PART 3: FINAL VERIFICATION (with a long timeout) ===
          // Instead of waiting for a network call, we wait directly for the final button to appear.
          // We give it up to 2 minutes (120000ms) for the backend instance to get ready.
          cy.get('[data-test-id="start-hacking-button"]', { timeout: 120000 }).should('be.visible');
          cy.get('[data-test-id="start-desktop-button"]').should('be.visible');
        });
    });
  });

  it('should block invalid team names before creating a team', () => {
    cy.intercept('POST', '**/balancer/teams/*/join').as('joinRequest');

    cy.visit('/');
    cy.get('[data-test-id="teamname-input"]').type('TEAM');
    cy.get('[data-test-id="teamname-input"]').should(($input) => {
      expect($input[0].checkValidity()).to.eq(false);
      expect($input[0].validity.patternMismatch).to.eq(true);
    });
    cy.get('[data-test-id="create-join-team-button"]').click();

    cy.get('@joinRequest.all').should('have.length', 0);
    cy.location('pathname').should('eq', '/balancer/');
  });
});
