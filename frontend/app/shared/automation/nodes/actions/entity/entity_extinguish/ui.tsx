import { makeFixedActionUi } from '../../game/_fixedAction'
import { meta } from './meta'

export const ui = makeFixedActionUi('entity_extinguish', meta.icon, meta.label, meta.params)
