import { makeFixedActionUi } from '../../game/_fixedAction'
import { meta } from './meta'

export const ui = makeFixedActionUi('clear_inventory', meta.icon, meta.label, meta.params)
