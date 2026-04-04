export class LiveSharedCounter {
  static componentName = 'LiveSharedCounter'
  static defaultState = {
    username: '',
    count: 0,
    lastUpdatedBy: null,
    onlineCount: 0
  }
  static publicActions = ['increment', 'decrement', 'reset']
}