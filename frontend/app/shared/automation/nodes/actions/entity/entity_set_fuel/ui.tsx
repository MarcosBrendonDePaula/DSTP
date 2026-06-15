import { makeFixedActionUi } from '../../game/_fixedAction'
import { meta } from './meta'

export const ui = makeFixedActionUi('entity_set_fuel', meta.icon, meta.label, meta.params)
