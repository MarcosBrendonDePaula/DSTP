import { makeFixedActionUi } from '../../game/_fixedAction'
import { meta } from './meta'

export const ui = makeFixedActionUi('rule_uninstall', meta.icon, meta.label, meta.params)
