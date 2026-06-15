import { makeFixedActionUi } from '../../game/_fixedAction'
import { meta } from './meta'

export const ui = makeFixedActionUi('stop_rain', meta.icon, meta.label, meta.params)
