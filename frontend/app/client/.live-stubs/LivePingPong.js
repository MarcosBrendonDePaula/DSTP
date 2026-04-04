export class LivePingPong {
  static componentName = 'LivePingPong'
  static defaultState = {
    username: '',
    onlineCount: 0,
    totalPings: 0,
    lastPingBy: null,
  }
  static publicActions = ['ping']
}