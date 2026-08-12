describe('Team Creation and Joining Workflow', () => {
  it('should create a team, then allow a user to join it with the passcode', () => {
    // Generates a short, unique team name that is under the 16-character limit.
    const teamName = `ctf-${Date.now().toString().slice(-9)}`;

    // Set up a "spy" to intercept the network request that creates the team.
    cy.intercept('POST', `/balancer/teams/${teamName}/join`).as('createTeamRequest');

    // === PART 1: CREATE THE TEAM ===
    cy.visit('/balancer/');
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
          cy.visit('/balancer/');

          // Enter the same unique team name again.
          cy.get('[data-test-id="teamname-input"]').type(teamName);
          cy.get('[data-test-id="create-join-team-button"]').click();

          // On the "Joining team" page, type the real passcode we captured.
          cy.get('[data-test-id="passcode-input"]', { timeout: 15000 })
            .should('be.visible')
            .type(passcode);
          cy.get('[data-test-id="join-team-button"]').click();

          // === PART 3: FINAL VERIFICATION (with a long timeout) ===
          // Instead of waiting for a network call, we wait directly for the final button to appear.
          // We give it up to 2 minutes (120000ms) for the backend instance to get ready.
          cy.get('[data-test-id="start-hacking-button"]', { timeout: 120000 }).should('be.visible');
          cy.get('[data-test-id="start-desktop-button"]').should('be.visible');

          // === PART 4: RESET PASSCODE (REGRESSION TEST) ===
          cy.intercept('POST', '/balancer/teams/reset-passcode').as('resetPasscodeRequest');
          cy.contains('button', 'Reset Passcode').click();
          cy.wait('@resetPasscodeRequest').then((interception) => {
            expect(interception.response.statusCode).to.eq(200);
            expect(interception.response.body.passcode).to.match(/^[A-Z0-9]{8}$/);
            cy.contains('h2', 'Passcode Reset').should('be.visible');
            cy.get('[data-test-id="passcode-display"]')
              .invoke('text')
              .then((displayedPasscode) => {
                const newPasscode = displayedPasscode.replace(/\s+/g, '');
                expect(newPasscode).to.match(/^[A-Z0-9]{8}$/);
                expect(newPasscode).to.not.eq(passcode);
              });
          });
        });
    });
  });

  // this is for now handled by means of unit tests
  // it('should block invalid team names before creating a team', () => {
  //   cy.intercept('POST', '**/balancer/teams/*/join').as('joinRequest');
  //
  //   cy.visit('/balancer/');
  //   // Test validation for invalid team names
  //   // Using a name with spaces and special characters to ensure validation failure
  //   cy.get('[data-test-id="teamname-input"]').clear().type('INVALID NAME!');
  //   // Triggering a blur might help ensure the validation state is updated in the browser
  //   cy.get('[data-test-id="teamname-input"]').blur();
  //   cy.get('[data-test-id="teamname-input"]').should(($input) => {
  //     // The HTML5 validation should catch this based on the pattern attribute
  //     // If checkValidity() still returns true, it might mean the pattern is not applied
  //     console.log('Input value:', $input.val());
  //     console.log('Input pattern:', $input.attr('pattern'));
  //     console.log('Validity:', $input[0].validity);
  //     expect($input[0].checkValidity()).to.eq(false);
  //   });
  //   cy.get('[data-test-id="create-join-team-button"]').click();
  //
  //   cy.get('@joinRequest.all').should('have.length', 0);
  //   cy.location('pathname').should('eq', '/balancer/');
  // });
});
