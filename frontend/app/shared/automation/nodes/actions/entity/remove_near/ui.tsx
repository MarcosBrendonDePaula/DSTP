import { makeFixedActionUi } from '../../game/_fixedAction'
import { meta } from './meta'

export const ui = makeFixedActionUi('remove_near', meta.icon, meta.label, meta.params)
