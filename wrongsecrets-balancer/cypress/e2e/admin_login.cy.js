describe('Admin Login', () => {
  it('should allow the admin to log in through the main page', () => {
    // NOTE: The admin password changes every time you deploy.
    // You must get the new password from the terminal before running this test.
    const adminPassword = 'PASTE_YOUR_ADMIN_PASSWORD_HERE';

    // Visit the homepage to log in.
    cy.visit('http://localhost:3000');

    // Type "admin" as the team name and click the button.
    cy.get('[data-test-id="teamname-input"]').type('admin');
    cy.get('[data-test-id="create-join-team-button"]').click();

    // On the next page, type the admin password.
    cy.get('[data-test-id="passcode-input"]').type(adminPassword);
    cy.contains('button', 'Join Team').click();

    // Verify that the admin page has loaded by finding the "Active Teams" heading.
    cy.contains('Active Teams').should('be.visible');
  });
});