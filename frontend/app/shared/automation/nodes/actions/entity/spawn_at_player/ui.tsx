import { makeFixedActionUi } from '../../game/_fixedAction'
import { meta } from './meta'

export const ui = makeFixedActionUi('spawn_at_player', meta.icon, meta.label, meta.params)
