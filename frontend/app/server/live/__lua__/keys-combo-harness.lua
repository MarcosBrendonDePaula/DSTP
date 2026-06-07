-- Harness for keys.lua (client-side key/combo capture). Loads the REAL keys.lua under
-- fengari with a fake _G (KEY_* constants + a controllable TheInput) and drives
-- OnRawKey to assert the 3 combo modes + the bare key_pressed path. Returns "OK"/"FAIL".

local C = KIT.new_checker()

-- Fake DST _G: KEY_* constants keys.lua probes via rawget, plus TheInput.
local heldMods = {}              -- [code]=true → IsKeyDown returns true
local capturedHandler = nil      -- the fn keys.lua passes to AddKeyHandler

local G = KIT.make_G({
  KEY_A = 65, KEY_H = 72, KEY_J = 74, KEY_K = 75,
  KEY_F1 = 101, KEY_F2 = 102, KEY_F3 = 103,
  KEY_CTRL = 401, KEY_SHIFT = 402, KEY_ALT = 400,
  GetTime = function() return KIT.now end,
  TheInput = {
    AddKeyHandler = function(self, fn) capturedHandler = fn end,
    IsKeyDown = function(self, code) return heldMods[code] == true end,
    GetWorldPosition = function(self) return { x = 10, z = 20 } end,
  },
})
-- keys.lua reads rawget(_G,"IsConsoleScreenOpen") / "TheFrontEnd" — leave them nil
-- (not typing). pcall is needed for the GetWorldPosition guard.
G.pcall = pcall

local Keys = KIT.load(MOD_KEYS, "keys")

-- Spy senders.
local pressed = {}    -- key_pressed RPCs: {key, wx, wz}
local combos = {}     -- key_combo RPCs: {id, key, wx, wz}
Keys.Init({
  GLOBAL = G,
  SendRPC = function(key, down, wx, wz) pressed[#pressed + 1] = { key = key, wx = wx, wz = wz } end,
  SendComboRPC = function(id, key, wx, wz) combos[#combos + 1] = { id = id, key = key, wx = wx, wz = wz } end,
})

C.check("handler installed", capturedHandler ~= nil)

-- Helper: simulate a fresh down+up of a key code (down: is_up=false, up: is_up=true).
local function tap(code)
  capturedHandler(code, false)  -- down
  capturedHandler(code, true)   -- up (clears _held so it can fire again)
end

-- ── Setup watch: a bare H, plus all 3 combo modes ──
Keys.SetWatch({
  keys = { "H" },  -- key_pressed on H
  combos = {
    { id = "simul1", mode = "simultaneous", key = "A", modifiers = { "CTRL" } },
    { id = "seq1",   mode = "sequence",     keys = { "H", "J", "K" }, timeoutMs = 1000 },
    { id = "any1",   mode = "any",          keys = { "F1", "F2", "F3" } },
  },
})

-- ── 1) bare key_pressed: H with no modifier fires SendRPC, carries mouse pos ──
pressed, combos = {}, {}
tap(72) -- H
C.check("key_pressed fired on H", #pressed == 1 and pressed[1].key == "H")
C.check("key_pressed carries mouse world pos", pressed[1] and pressed[1].wx == 10 and pressed[1].wz == 20)
-- H is also seq1 step 1, so seq advanced but didn't complete → no combo yet
C.check("no combo from a single H", #combos == 0)

-- ── 2) simultaneous: A alone does nothing; Ctrl+A fires simul1 ──
pressed, combos = {}, {}
tap(65) -- A, no Ctrl
C.check("A without Ctrl → no combo", #combos == 0)
heldMods[401] = true  -- hold CTRL
tap(65) -- A with Ctrl
heldMods[401] = nil
C.check("Ctrl+A fired simul1", #combos == 1 and combos[1].id == "simul1")

-- ── 3) sequence: H,J,K within the window completes seq1 ──
pressed, combos = {}, {}
tap(72); tap(74); tap(75)  -- H J K
local seqFired = false
for _, c in ipairs(combos) do if c.id == "seq1" then seqFired = true end end
C.check("H,J,K completed seq1", seqFired)

-- ── 3b) sequence times out: H ... (advance past timeout) ... J,K does NOT fire ──
pressed, combos = {}, {}
tap(72)              -- H (starts seq)
KIT.advance(2)      -- +2s > 1s timeout
tap(74); tap(75)    -- J,K too late
local lateFired = false
for _, c in ipairs(combos) do if c.id == "seq1" then lateFired = true end end
C.check("expired sequence does NOT fire", not lateFired)

-- ── 4) any: F2 (in the set) fires any1 with the pressed key ──
pressed, combos = {}, {}
tap(102) -- F2
C.check("any1 fired on F2", #combos == 1 and combos[1].id == "any1" and combos[1].key == "F2")

-- ── 5) dedupe: holding H (down without up) fires once ──
pressed, combos = {}, {}
capturedHandler(72, false) -- down
capturedHandler(72, false) -- auto-repeat (still down)
C.check("auto-repeat deduped (1 fire)", #pressed == 1)
capturedHandler(72, true)  -- up

return C.report()
