export class LiveAutomation {
  static componentName = 'LiveAutomation'
  static defaultState = {
    flows: [],
    logs: [],
  }
  static publicActions = [
    'saveFlow',
    'deleteFlow',
    'toggleFlow',
    'moveFlow',
    'loadFlows',
    'clearLogs',
    'getEventSchemas',
    'exportFlow',
    'importFlow',
    'startCapture',
    'stopCapture',
  ]
}