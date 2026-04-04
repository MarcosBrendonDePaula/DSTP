export class LiveCounter {
  static componentName = 'LiveCounter'
  static defaultState = {
    count: 0,
    lastUpdatedBy: null,
    connectedUsers: 0
  }
  static publicActions = ['increment', 'decrement', 'reset']
}