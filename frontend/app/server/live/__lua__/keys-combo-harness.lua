-- Harness for keys.lua (client-side key/combo capture). Loads the REAL keys.lua under
-- fengari with a fake _G (KEY_* constants + a controllable TheInput) and drives
-- OnRawKey to assert the 3 combo modes + the bare key_pressed path. Returns "OK"/"FAIL".

local C = KIT.new_checker()

-- Fake DST _G: KEY_* constants keys.lua probes via rawget, plus TheInput.
local held = {}                  -- [code]=true → IsKeyDown returns true (any key)
local capturedHandler = nil      -- the fn keys.lua passes to AddKeyHandler

local G = KIT.make_G({
  KEY_A = 65, KEY_S = 83, KEY_D = 68, KEY_H = 72, KEY_J = 74, KEY_K = 75,
  KEY_F1 = 101, KEY_F2 = 102, KEY_F3 = 103,
  KEY_CTRL = 401, KEY_SHIFT = 402, KEY_ALT = 400,
  GetTime = function() return KIT.now end,
  TheInput = {
    AddKeyHandler = function(self, fn) capturedHandler = fn end,
    IsKeyDown = function(self, code) return held[code] == true end,
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

-- ── Setup watch: a bare H, plus all 3 combo modes (simultaneous now = key list) ──
Keys.SetWatch({
  keys = { "H" },  -- key_pressed on H
  combos = {
    { id = "simul1", mode = "simultaneous", keys = { "CTRL", "A" } },  -- Ctrl+A
    { id = "asd",    mode = "simultaneous", keys = { "A", "S", "D" } }, -- A+S+D (arbitrary keys!)
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

-- ── 2a) simultaneous Ctrl+A: A alone → nothing; A with Ctrl held → fires simul1 ──
pressed, combos = {}, {}
tap(65) -- A, no Ctrl
local s1 = false
for _, c in ipairs(combos) do if c.id == "simul1" then s1 = true end end
C.check("A without Ctrl → no simul1", not s1)
held[401] = true  -- hold CTRL
tap(65) -- A with Ctrl
held[401] = nil
s1 = false
for _, c in ipairs(combos) do if c.id == "simul1" then s1 = true end end
C.check("Ctrl+A fired simul1", s1)

-- ── 2b) simultaneous A+S+D (arbitrary keys, the user's case): only when all held ──
pressed, combos = {}, {}
tap(68) -- D alone (A,S not held)
local asd = false
for _, c in ipairs(combos) do if c.id == "asd" then asd = true end end
C.check("D alone → no asd combo", not asd)
held[65] = true; held[83] = true  -- hold A and S
capturedHandler(68, false)        -- press D (down) while A+S held
held[65] = nil; held[83] = nil
capturedHandler(68, true)         -- release D
asd = false
for _, c in ipairs(combos) do if c.id == "asd" then asd = true end end
C.check("A+S+D fired asd combo", asd)

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

-- ── 6) InstallServerRPC (server half): handlers validate + PushEvent correctly ──
local rpcHandlers = {}
local pushed = {}
Keys.InstallServerRPC({
  AddModRPCHandler = function(_mod, name, fn) rpcHandlers[name] = fn end,
  modname = "dstp",
  PushEvent = function(t, d) pushed[#pushed + 1] = { t = t, d = d } end,
})
C.check("KeyPressed handler registered", rpcHandlers.KeyPressed ~= nil)
C.check("KeyCombo handler registered", rpcHandlers.KeyCombo ~= nil)

-- KeyPressed: valid → key_pressed event with mouse pos
pushed = {}
rpcHandlers.KeyPressed({ userid = "KU_1", name = "Bob" }, "H", true, 3, 4)
C.check("KeyPressed → key_pressed event", #pushed == 1 and pushed[1].t == "key_pressed"
  and pushed[1].d.key == "H" and pushed[1].d.world_x == 3 and pushed[1].d.world_z == 4)

-- KeyPressed: NaN pos dropped (no world_x/z)
pushed = {}
rpcHandlers.KeyPressed({ userid = "KU_1" }, "H", true, 0/0, 0/0)
C.check("NaN pos dropped", #pushed == 1 and pushed[1].d.world_x == nil)

-- KeyCombo: valid → key_combo event carrying combo_id
pushed = {}
rpcHandlers.KeyCombo({ userid = "KU_1", name = "Bob" }, "simul1", "A", 5, 6)
C.check("KeyCombo → key_combo event", #pushed == 1 and pushed[1].t == "key_combo"
  and pushed[1].d.combo_id == "simul1" and pushed[1].d.key == "A")

-- KeyCombo: empty combo_id ignored
pushed = {}
rpcHandlers.KeyCombo({ userid = "KU_1" }, "", "A", 1, 2)
C.check("empty combo_id ignored", #pushed == 0)

return C.report()
