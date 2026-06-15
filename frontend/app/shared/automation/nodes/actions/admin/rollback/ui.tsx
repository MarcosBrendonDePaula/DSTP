import { makeFixedActionUi } from '../../game/_fixedAction'
import { meta } from './meta'

export const ui = makeFixedActionUi('rollback', meta.icon, meta.label, meta.params)
