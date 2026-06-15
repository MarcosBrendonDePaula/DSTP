import { makeFixedActionUi } from '../../game/_fixedAction'
import { meta } from './meta'

export const ui = makeFixedActionUi('teleport_to_player', meta.icon, meta.label, meta.params)
