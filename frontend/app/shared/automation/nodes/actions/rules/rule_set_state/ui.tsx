import { makeFixedActionUi } from '../../game/_fixedAction'
import { meta } from './meta'

export const ui = makeFixedActionUi('rule_set_state', meta.icon, meta.label, meta.params)
