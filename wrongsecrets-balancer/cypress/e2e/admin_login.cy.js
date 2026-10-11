describe('Admin Login', () => {
  it('should allow the admin to log in through the main page', () => {
    // In CI this comes from CYPRESS_ADMIN_PASSWORD; set ADMIN_PASSWORD locally via Cypress envs.
    const adminPassword = Cypress.env('ADMIN_PASSWORD');

    expect(adminPassword, 'CYPRESS_ADMIN_PASSWORD must be set')
      .to.be.a('string')
      .and.not.be.empty;

    // Set up intercept for join request and dynamics configuration
    cy.intercept('GET', '/balancer/dynamics').as('dynamicsRequest');
    cy.intercept('POST', '/balancer/teams/admin/join').as('adminJoinRequest');

    // Visit the homepage to log in.
    cy.visit('/balancer/');
    cy.wait('@dynamicsRequest');

    // Type "admin" as the team name and click the button.
    cy.get('[data-test-id="teamname-input"]').type('admin');
    cy.get('[data-test-id="create-join-team-button"]').click();

    // Wait for the join attempt to finish and redirect
    cy.wait('@adminJoinRequest').then((interception) => {
      expect(interception.response.statusCode).to.eq(401);
    });

    // On the next page, type the admin password.
    cy.get('[data-test-id="passcode-input"]', { timeout: 15000 })
      .should('be.visible')
      .type(adminPassword);
    cy.get('[data-test-id="join-team-button"]').click();

    // Verify that the admin page has loaded. We give it a longer timeout (10 seconds)
    // because the list of teams might take a moment to load from the server.
    cy.contains('Active Teams', { timeout: 10000 }).should('be.visible');
  });
});
