import { makeFixedActionUi } from '../../game/_fixedAction'
import { meta } from './meta'

export const ui = makeFixedActionUi('set_season_length', meta.icon, meta.label, meta.params)
