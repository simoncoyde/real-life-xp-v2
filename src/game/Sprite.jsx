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

/* Rows in a sheet are facing directions. Row 0 faces the viewer, which is
   the only one a portrait ever needs. */
export const FACING = { down: 0, up: 1, right: 2, left: 3 };

export const SPRITES = {
  /* ---- playable characters ---- */
  human: {
    id: "human",
    name: "Human",
    kind: "character",
    unlock: "start", // available from the beginning
    anims: {
      idle: { src: "sprites/human-idle.png", frames: 16, ms: 200 },
      walk: { src: "sprites/human-walk.png", frames: 4, ms: 200 },
    },
  },

  /* ---- monsters ---- */
  orc: {
    id: "orc",
    name: "Orc",
    kind: "monster",
    anims: {
      idle: { src: "sprites/orc-idle.png", frames: 16, ms: 200 },
      attack: { src: "sprites/orc-attack.png", frames: 4, ms: 100 },
    },
  },
};

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
  const row = FACING[facing] != null ? FACING[facing] : 0;
  const size = FRAME * s;

  return (
    <div
      className={`rlxp-sprite ${className}`}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${a.src})`,
        backgroundPosition: `-${frame * size}px -${row * size}px`,
        backgroundSize: `${a.frames * size}px ${4 * size}px`,
        imageRendering: "pixelated",
        ...style,
      }}
      aria-hidden="true"
    />
  );
}
