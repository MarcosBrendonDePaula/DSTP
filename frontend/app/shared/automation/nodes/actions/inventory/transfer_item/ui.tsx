import { makeFixedActionUi } from '../../game/_fixedAction'
import { meta } from './meta'

export const ui = makeFixedActionUi('transfer_item', meta.icon, meta.label, meta.params)
