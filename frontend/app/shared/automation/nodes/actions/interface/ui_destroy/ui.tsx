import { makeFixedActionUi } from '../../game/_fixedAction'
import { meta } from './meta'

export const ui = makeFixedActionUi('ui_destroy', meta.icon, meta.label, meta.params)
