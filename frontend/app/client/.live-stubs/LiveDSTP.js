export class LiveDSTP {
  static componentName = 'LiveDSTP'
  static defaultState = {
    serverIds: [],
    events: [],
  }
  static publicActions = [
    'sendCommand',
    'sendPlayerCommand',
    'broadcastCommand',
    'refresh',
  ]
}