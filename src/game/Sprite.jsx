import { useEffect, useRef, useState } from "react";

/* =======================================================================
   SPRITES

   Everything visual in the game is described here as DATA, not code. Adding
   a new character, monster or cosmetic later means adding an entry and a
   PNG — no rewriting. That's what makes seventy asset packs feasible.

   A save only ever stores an id like "human". If the art behind that id is
   ever swapped or improved, nobody loses their character.
   ======================================================================= */

export const FRAME = 32; // every Minifantasy frame is 32x32

export function assetUrl(path) {
  if (typeof window !== "undefined" && window.__ASSETS__ && window.__ASSETS__[path]) {
    return window.__ASSETS__[path];
  }
  return path;
}

/* Rows in a sheet are facing directions. Row 0 faces the viewer, which is
   the only one a portrait ever needs. */
/* Rows are facings. 2 and 3 are exact mirror images of each other — row 3
   are exact mirrors of each other. Verified on device: row 2 faces right,
   row 3 faces left. */
export const FACING = { down: 0, up: 1, right: 2, left: 3 };

export const SPRITES = {
  /* ---- playable characters ----
     `unlock` describes how one is earned. Adding another later is an entry
     here plus a PNG — nothing else changes. */
  human: {
    id: "human",
    name: "Wanderer",
    kind: "character",
    blurb: "Where everyone begins.",
    unlock: { type: "start" },
    anims: {
      idle: { src: "sprites/human-idle.png", frames: 16, ms: 200, rows: 4 },
      walk: { src: "sprites/human-walk.png", frames: 4, ms: 200, rows: 4 },
      attack: { src: "sprites/human-attack.png", frames: 4, ms: 100, rows: 4 },
      chargedattack: { src: "sprites/human-chargedattack.png", frames: 6, ms: 100, rows: 3 },
      jump: { src: "sprites/human-jump.png", frames: 4, ms: 100, rows: 4 },
      spindie: { src: "sprites/human-spindie.png", frames: 12, ms: 100, rows: 1 },
      souldie: { src: "sprites/human-souldie.png", frames: 12, ms: 100, rows: 1 },
    },
  },
  orc: {
    id: "orc",
    name: "Orc Marauder",
    kind: "character",
    blurb: "Built for heavy days.",
    unlock: { type: "gold", cost: 1200 },
    anims: {
      idle: { src: "sprites/orc-idle.png", frames: 16, ms: 200, rows: 4 },
      attack: { src: "sprites/orc-attack.png", frames: 4, ms: 100, rows: 4 },
      chargedattack: { src: "sprites/orc-chargedattack.png", frames: 6, ms: 100, rows: 3 },
      jump: { src: "sprites/orc-jump.png", frames: 4, ms: 100, rows: 4 },
      die: { src: "sprites/orc-die.png", frames: 12, ms: 100, rows: 1 },
    },
  },
};

/* =======================================================================
   FLOURISHES

   An animation you buy, equip, and show off. It plays every time you log a
   workout and whenever you tap your character.

   Priced by spectacle: a jump is a jump, but a soul leaving the body is
   twelve frames of theatre and should cost accordingly.

   `characters` lists who can perform it — not every hero has every move.
   ======================================================================= */
export const FLOURISHES = {
  jump: {
    id: "jump",
    name: "Leap",
    blurb: "A quick hop. Modest, but it's yours.",
    anim: "jump",
    cost: 300,
    characters: ["human", "orc"],
  },
  attack: {
    id: "attack",
    name: "Strike",
    blurb: "A clean swing to finish the session.",
    anim: "attack",
    cost: 500,
    characters: ["human", "orc"],
  },
  chargedattack: {
    id: "chargedattack",
    name: "Charged Strike",
    blurb: "Wind up and let go. Six frames of intent.",
    anim: "chargedattack",
    cost: 900,
    characters: ["human", "orc"],
  },
  spindie: {
    id: "spindie",
    name: "Spin Out",
    blurb: "Collapse with style. Twelve frames of drama.",
    anim: "spindie",
    cost: 1600,
    characters: ["human"],
  },
  die: {
    id: "die",
    name: "Last Stand",
    blurb: "Go down swinging.",
    anim: "die",
    cost: 1600,
    characters: ["orc"],
  },
  shockwave: {
    id: "shockwave",
    name: "Shockwave",
    blurb: "The ground gives way where you land.",
    effect: "shockwave",
    cost: 2400,
    characters: ["human", "orc"],
  },
  souldie: {
    id: "souldie",
    name: "Ascension",
    blurb: "The soul leaves the body. The rarest exit there is.",
    anim: "souldie",
    cost: 3200,
    characters: ["human"],
  },
};

/* =======================================================================
   WEAPONS

   A weapon is drawn as THREE layers stacked in order: the part behind the
   body, the body itself, then the part in front. That's how one sword works
   on every character without redrawing it per hero — and how every future
   weapon pack drops straight in.

   Equipping one changes what your hero swings when you log a workout.
   ======================================================================= */
/* =======================================================================
   BACKDROPS

   Scenes built from the dungeon tileset. Equipping one puts your hero
   somewhere instead of on a gradient — and the boss fight happens in a
   place rather than in the dark.

   Each is a wall with a floor along the bottom, so a character standing on
   it reads as being IN the room. Adding another later is an entry plus a PNG.
   ======================================================================= */
export const BACKDROPS = {
  none:     { id: "none",     name: "The Void",       blurb: "Nowhere in particular.",        src: null,                      cost: 0,    unlock: "start" },
  dungeon:  { id: "dungeon",  name: "Dungeon Depths", blurb: "Damp stone and older bones.",   src: "backdrops/dungeon.png",   cost: 600 },
  cellar:   { id: "cellar",   name: "The Cellar",     blurb: "Someone stored things here.",   src: "backdrops/cellar.png",    cost: 800 },
  crypt:    { id: "crypt",    name: "The Crypt",      blurb: "Quieter. Not safer.",           src: "backdrops/crypt.png",     cost: 1100 },
  corridor: { id: "corridor", name: "Long Corridor",  blurb: "It goes on further than it should.", src: "backdrops/corridor.png", cost: 1300 },
  hall:     { id: "hall",     name: "Ruined Hall",    blurb: "Something grand, a long time ago.", src: "backdrops/hall.png",  cost: 1600 },
  catacomb: { id: "catacomb", name: "The Catacombs",  blurb: "Pillars, and the dark between them.", src: "backdrops/catacomb.png", cost: 2000 },
  vault:    { id: "vault",    name: "The Vault",      blurb: "Sealed for a reason.",          src: "backdrops/vault.png",     cost: 2600 },
};

export const BACKDROP_IDS = Object.keys(BACKDROPS);

export function backdropOwned(id, state) {
  if (id === "none") return true;
  return ((state && state.ownedBackdrops) || []).includes(id);
}

/* The scene is drawn at a whole-number scale and pinned to the bottom, so the
   floor always meets the bottom edge wherever the panel is tall or short. */
export function Backdrop({ id, className = "", children }) {
  const def = BACKDROPS[id] || BACKDROPS.none;
  const style = def.src
    ? {
        backgroundImage: `url(${assetUrl(def.src)})`,
        backgroundSize: "auto 100%",
        backgroundPosition: "bottom center",
        backgroundRepeat: "repeat-x",
        imageRendering: "pixelated",
      }
    : {};
  return (
    <div className={`rlxp-backdrop ${className}`} style={style}>
      {children}
    </div>
  );
}

/* A one-off effect sheet at 64px, twice the character frame size, so it can
   spill outward past the body the way an impact should. */
export const EFFECTS = {
  shockwave: { src: "sprites/shockwave.png", frame: 64, frames: 5, rows: 4, ms: 90 },
};

export function EffectSprite({ id, scale = 3, playing = true, reducedMotion = false }) {
  const def = EFFECTS[id];
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    setFrame(0);
    if (!def || !playing || reducedMotion) return undefined;
    const t = setInterval(() => setFrame((f) => (f + 1) % def.frames), def.ms);
    return () => clearInterval(t);
  }, [id, playing, reducedMotion]);
  if (!def) return null;
  const sc = Math.max(1, Math.round(scale));
  const size = def.frame * sc;
  return (
    <div
      className="rlxp-sprite rlxp-effect"
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${assetUrl(def.src)})`,
        backgroundPosition: `-${frame * size}px 0px`,
        backgroundSize: `${def.frames * size}px ${def.rows * size}px`,
        imageRendering: "pixelated",
      }}
      aria-hidden="true"
    />
  );
}

export const WEAPON_STYLES = {
  slash:     { frames: 4, ms: 100 },
  thrust:    { frames: 3, ms: 100 },
  twohanded: { frames: 6, ms: 100 },
  swing:     { frames: 3, ms: 100 },
  ranged:    { frames: 8, ms: 100 },
  guard:     { frames: 8, ms: 100 },
};

export const WEAPONS = {
  dagger:       { id: "dagger",       name: "Dagger",        style: "slash",     cost: 400,  blurb: "Quick and mean." },
  sword:        { id: "sword",        name: "Sword",         style: "slash",     cost: 700,  blurb: "The honest choice." },
  axe:          { id: "axe",          name: "Axe",           style: "slash",     cost: 900,  blurb: "Heavy, and it shows." },
  spear:        { id: "spear",        name: "Spear",         style: "thrust",    cost: 1000, blurb: "Reach beats strength." },
  pitchfork:    { id: "pitchfork",    name: "Pitchfork",     style: "thrust",    cost: 600,  blurb: "Started as a farm tool." },
  flail:        { id: "flail",        name: "Flail",         style: "swing",     cost: 1300, blurb: "Chaotic. Effective." , frontOnly: true },
  whip:         { id: "whip",         name: "Whip",          style: "swing",     cost: 1300, blurb: "All wrist." , frontOnly: true },
  slingshot:    { id: "slingshot",    name: "Slingshot",     style: "ranged",    cost: 500,  blurb: "Don't laugh. It works." },
  bow:          { id: "bow",          name: "Bow",           style: "ranged",    cost: 1500, blurb: "Patience, then release." },
  woodenshield: { id: "woodenshield", name: "Wooden Shield", style: "guard",     cost: 600,  blurb: "Better than nothing." },
  ironshield:   { id: "ironshield",   name: "Iron Shield",   style: "guard",     cost: 1400, blurb: "Nothing gets through." },
  buckler:      { id: "buckler",      name: "Buckler",       style: "guard",     cost: 900,  blurb: "Small, fast, clever." },
  longsword:    { id: "longsword",    name: "Longsword",     style: "twohanded", cost: 2200, blurb: "Both hands. Full commitment." },
  waraxe:       { id: "waraxe",       name: "War Axe",       style: "twohanded", cost: 2600, blurb: "Swung once. That's enough." },
};

export const WEAPON_IDS = Object.keys(WEAPONS);

export function weaponOwned(id, state) {
  return ((state && state.ownedWeapons) || []).includes(id);
}

/* The three layers to stack for a hero wielding a weapon, in draw order. */
export function weaponLayers(weaponId, spriteId) {
  const w = WEAPONS[weaponId];
  if (!w) return null;
  const st = WEAPON_STYLES[w.style];
  const base = `sprites/weapons/${w.style}`;
  const layers = [];
  // some weapons are drawn as a single sheet with no behind-layer
  if (!w.frontOnly) layers.push(assetUrl(`${base}-${w.id}-b.png`));
  layers.push(assetUrl(`${base}-body-${spriteId}.png`));
  layers.push(assetUrl(`${base}-${w.id}-f.png`));
  return { frames: st.frames, ms: st.ms, rows: 4, layers };
}

export const FLOURISH_IDS = Object.keys(FLOURISHES);

export function flourishOwned(id, state) {
  return ((state && state.ownedFlourishes) || []).includes(id);
}

/* Whether the hero currently worn can actually perform it. */
export function flourishUsable(id, spriteId) {
  const f = FLOURISHES[id];
  if (!f) return false;
  return f.characters.includes(spriteId);
}

/* Everything a player could own, in display order. */
export const CHARACTER_IDS = Object.keys(SPRITES).filter(
  (k) => SPRITES[k].kind === "character"
);

/* A character is available if it's the starter, already bought, or its
   condition is met. Kept in one place so the shop, the picker and the save
   all agree. */
export function characterUnlocked(id, state) {
  const def = SPRITES[id];
  if (!def || !def.unlock) return false;
  if (def.unlock.type === "start") return true;
  const owned = (state && state.ownedCharacters) || [];
  if (owned.includes(id)) return true;
  if (def.unlock.type === "level") {
    return (state && state.highestLevelEver) >= def.unlock.level;
  }
  return false;
}

export function getSprite(id) {
  return SPRITES[id] || null;
}

/* =======================================================================
   Sprite

   Draws one frame of a sheet, stepping through them on a timer.

   Two rules keep pixel art looking like pixel art:
   - image-rendering: pixelated, or the browser smooths it into mush
   - whole-number scaling only; 3.5x puts pixels between pixels and the
     whole thing shimmers
   ======================================================================= */
/* Renders a hero holding a weapon: three sheets stacked in draw order,
   all stepping through the same frame at the same time. */
export function WeaponSprite({ weaponId, spriteId, facing = "down", scale = 4, playing = true, reducedMotion = false, onDone }) {
  const spec = weaponLayers(weaponId, spriteId);
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    setFrame(0);
    if (!spec || !playing || reducedMotion) return undefined;
    const t = setInterval(() => setFrame((f) => (f + 1) % spec.frames), spec.ms);
    return () => clearInterval(t);
  }, [weaponId, spriteId, playing, reducedMotion]);
  if (!spec) return null;
  const s = Math.max(1, Math.round(scale));
  const size = FRAME * s;
  const row = Math.min(FACING[facing] != null ? FACING[facing] : 0, spec.rows - 1);
  return (
    <div className="rlxp-sprite-stack" style={{ width: size, height: size }}>
      {spec.layers.map((src, i) => (
        <div
          key={i}
          className="rlxp-sprite"
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${src})`,
            backgroundPosition: `-${frame * size}px -${row * size}px`,
            backgroundSize: `${spec.frames * size}px ${spec.rows * size}px`,
            imageRendering: "pixelated",
          }}
        />
      ))}
    </div>
  );
}

export default function Sprite({
  id,
  anim = "idle",
  facing = "down",
  scale = 4,
  playing = true,
  reducedMotion = false,
  className = "",
  style = {},
}) {
  const def = getSprite(id);
  const a = def && def.anims ? def.anims[anim] || def.anims.idle : null;
  const [frame, setFrame] = useState(0);
  const timer = useRef(null);

  useEffect(() => {
    setFrame(0);
    if (!a || !playing || reducedMotion || a.frames <= 1) return undefined;
    timer.current = setInterval(() => {
      setFrame((f) => (f + 1) % a.frames);
    }, a.ms);
    return () => clearInterval(timer.current);
  }, [a, playing, reducedMotion]);

  if (!a) return null;

  const s = Math.max(1, Math.round(scale)); // whole numbers only
  // some sheets (deaths) have a single row, so clamp rather than run off the end
  const wantRow = FACING[facing] != null ? FACING[facing] : 0;
  const row = Math.min(wantRow, (a.rows || 4) - 1);
  const size = FRAME * s;

  return (
    <div
      className={`rlxp-sprite ${className}`}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${assetUrl(a.src)})`,
        backgroundPosition: `-${frame * size}px -${row * size}px`,
        backgroundSize: `${a.frames * size}px ${(a.rows || 4) * size}px`,
        imageRendering: "pixelated",
        ...style,
      }}
      aria-hidden="true"
    />
  );
}
