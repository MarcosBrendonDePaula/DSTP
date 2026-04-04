export class LiveLocalCounter {
  static componentName = 'LiveLocalCounter'
  static defaultState = {
    count: 0,
    clicks: 0
  }
  static publicActions = ['increment', 'decrement', 'reset']
}