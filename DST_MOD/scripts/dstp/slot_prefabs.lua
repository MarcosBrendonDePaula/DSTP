-- DSTP slot_prefabs — which prefabs get the generic netvar SLOT POOL (see data_feed.lua).
--
-- DATA, not code: a preset name (mod config SLOT_PRESET) → set of prefabs. modmain
-- declares SLOT_COUNT `net_float`s on every entity whose prefab is in the chosen
-- preset, on BOTH sides at PostInit — that is what keeps the netvar stream aligned
-- (positional rule, see specs/dst-client-constraints.md). The MEANING of each slot is
-- assigned at runtime by data_feed (slot i = field), so this list is the only thing
-- that stays fixed per world. Gate by PREFAB only — tags/components desync.
--
-- Extend a preset here (both sides ship the same file through the Workshop). Keep the
-- lists to entities a HUD could plausibly track: each slot costs ~200 bytes of memory
-- per live entity and 4 bytes in its first snapshot to a client.

local M = {}

local function set(list) local s = {}; for _, p in ipairs(list) do s[p] = true end; return s end

local MOBS = {
    -- hostile / neutral creatures
    "spider","spider_warrior","spider_hider","spider_spitter","spider_dropper","spider_moon","spider_healer",
    "hound","firehound","icehound","clayhound","mutatedhound","killerbee","bee","mosquito",
    "frog","tentacle","tentacle_pillar","merm","mermguard","pigman","pigguard","bunnyman",
    "perd","rabbit","crow","robin","robin_winter","canary","butterfly","beefalo","babybeefalo",
    "koalefant_summer","koalefant_winter","walrus","little_walrus","rocky","slurtle","snurtle",
    "buzzard","catcoon","lightninggoat","monkey","tallbird","teenbird","smallbird",
    "knight","bishop","rook","mole","batilisk","bat","worm","lureplant","eyeplant","krampus",
    "spat","penguin","mandrake_active","deer","deer_red","deer_blue","grassgekko","carrat",
    "crawlinghorror","terrorbeak","nightmarebeak","crawlingnightmare","shadowtentacle",
    "bishop_nightmare","rook_nightmare","knight_nightmare","hutch","chester","glommer",
    -- bosses
    "deerclops","bearger","moose","dragonfly","antlion","minotaur","leif","leif_sparse",
    "spiderqueen","warg","claywarg","klaus","toadstool","toadstool_dark","stalker",
    "stalker_forest","stalker_atrium","beequeen","crabking","malbatross","eyeofterror",
    "twinofterror1","twinofterror2","daywalker","sharkboi","alterguardian_phase1",
    "alterguardian_phase2","alterguardian_phase3","fruitfly","lordfruitfly",
}

local STRUCTURES = {
    "firepit","campfire","coldfirepit","coldfire","nightlight","icebox","saltbox",
    "cookpot","portablecookpot","portablespicer","portableblender","treasurechest",
    "dragonflychest","researchlab","researchlab2","researchlab3","researchlab4",
    "birdcage","meatrack","winterometer","rainometer","lightning_rod","tent","siestahut",
    "resurrectionstatue","wall_hay","wall_wood","wall_stone","wall_moonrock","wall_ruins",
    "beebox","mushroom_farm","farm_plant_potato","farm_plant_carrot","farm_plant_corn",
    "berrybush","berrybush2","berrybush_juicy","sapling","grass","evergreen","deciduoustree",
    "mushtree_tall","mushtree_medium","mushtree_small","rock1","rock2","rock_flintless",
    "boat","mast","anchor","steeringwheel","winona_catapult","winona_spotlight",
    "winona_battery_low","winona_battery_high","scarecrow","homesign","arrowsign_post",
}

M.presets = {
    off = {},
    mobs = set(MOBS),
    mobs_structures = set(MOBS),
}
for _, p in ipairs(STRUCTURES) do M.presets.mobs_structures[p] = true end

return M
