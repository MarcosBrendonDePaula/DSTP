export class LiveAdminPanel {
  static componentName = 'LiveAdminPanel'
  static defaultState = {
    users: [
      { id: '1', name: 'Alice', role: 'admin', createdAt: Date.now() },
      { id: '2', name: 'Bob', role: 'user', createdAt: Date.now() },
      { id: '3', name: 'Carol', role: 'moderator', createdAt: Date.now() },
    ],
    audit: [],
    currentUser: null,
    currentRoles: [],
    isAdmin: false,
  }
  static publicActions = ['getAuthInfo', 'init', 'listUsers', 'addUser', 'deleteUser', 'clearAudit']
}