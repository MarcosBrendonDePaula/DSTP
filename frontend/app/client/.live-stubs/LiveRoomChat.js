export class LiveRoomChat {
  static componentName = 'LiveRoomChat'
  static defaultState = {
    username: '',
    activeRoom: null,
    rooms: [],
    messages: {},
    customRooms: []
  }
  static publicActions = ['createRoom', 'joinRoom', 'leaveRoom', 'switchRoom', 'sendMessage', 'setUsername']
}