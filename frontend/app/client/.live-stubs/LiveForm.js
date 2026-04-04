export class LiveForm {
  static componentName = 'LiveForm'
  static defaultState = {
    name: '',
    email: '',
    message: '',
    submitted: false,
    submittedAt: null
  }
  static publicActions = ['submit', 'reset', 'validate', 'setValue']
}