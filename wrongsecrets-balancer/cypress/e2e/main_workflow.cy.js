describe('Core Workflows', () => {
  it('should create a team, then allow a user to join with the passcode', () => {
    const teamName = `ctf-${Date.now().toString().slice(-9)}`;
    cy.intercept('POST', `/balancer/teams/${teamName}/join`).as('createTeamRequest');
    cy.visit('http://localhost:3000');
    cy.get('[data-test-id="teamname-input"]').type(teamName);
    cy.get('[data-test-id="create-join-team-button"]').click();
    cy.wait('@createTeamRequest').then((interception) => {
      const passcode = interception.response.body.passcode;
      cy.intercept('GET', `/balancer/teams/${teamName}/wait-till-ready*`).as('waitReady');
      cy.visit('http://localhost:3000');
      cy.get('[data-test-id="teamname-input"]').type(teamName);
      cy.get('[data-test-id="create-join-team-button"]').click();
      cy.get('[data-test-id="passcode-input"]').type(passcode);
      cy.contains('button', 'Join Team').click();
      cy.wait('@waitReady', { timeout: 120000 });
      cy.contains('Start Hacking').should('be.visible');
      cy.contains('Start your Webtop').should('be.visible');
    });
  });

  it('should allow the admin to log in through the main page', () => {
    const adminPassword = '5YME54O5'; // This password will be different when you deploy
    cy.visit('http://localhost:3000');
    cy.get('[data-test-id="teamname-input"]').type('admin');
    cy.get('[data-test-id="create-join-team-button"]').click();
    cy.get('[data-test-id="passcode-input"]').type(adminPassword);
    cy.contains('button', 'Join Team').click();
    cy.contains('Active Teams').should('be.visible');
  });
});