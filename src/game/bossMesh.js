/* =======================================================================
   Boss geometry — shared by the renderers.

   The shapes here are proven and unchanged; what's being upgraded is how
   they're lit and shaded. Each boss is built feet-at-zero then normalised
   to a common height, so a single camera frames a squat troll and a tall
   knight equally well.
   ======================================================================= */

const shade = (c, k) => [
  Math.min(1, Math.max(0, c[0] * k)),
  Math.min(1, Math.max(0, c[1] * k)),
  Math.min(1, Math.max(0, c[2] * k)),
];

function pushQuad(out, a, b, c, d, col) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  let nx = u[1] * v[2] - u[2] * v[1];
  let ny = u[2] * v[0] - u[0] * v[2];
  let nz = u[0] * v[1] - u[1] * v[0];
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  nx /= len; ny /= len; nz /= len;
  const uw = Math.sqrt(u[0] * u[0] + u[1] * u[1] + u[2] * u[2]) / TEX_SCALE;
  const vh = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) / TEX_SCALE;
  const quad = [a, b, c, d];
  const uv = [[0, 0], [uw, 0], [uw, vh], [0, vh]];
  for (const tri of [[0, 1, 2], [0, 2, 3]]) {
    for (const i of tri) {
      const p = quad[i], t = uv[i];
      out.push(p[0], p[1], p[2], nx, ny, nz, col[0], col[1], col[2], t[0], t[1]);
    }
  }
}

function addBox(out, cx, cy, cz, w, h, d, col) {
  const x0 = cx - w / 2, x1 = cx + w / 2;
  const y0 = cy - h / 2, y1 = cy + h / 2;
  const z0 = cz - d / 2, z1 = cz + d / 2;
  pushQuad(out, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], col); // front
  pushQuad(out, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], col); // back
  pushQuad(out, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], col); // right
  pushQuad(out, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], col); // left
  pushQuad(out, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], col); // top
  pushQuad(out, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], col); // bottom
}

function addTaperBox(out, cx, yBottom, cz, wBot, dBot, wTop, dTop, h, col) {
  const y0 = yBottom, y1 = yBottom + h;
  const xb0 = cx - wBot / 2, xb1 = cx + wBot / 2;
  const zb0 = cz - dBot / 2, zb1 = cz + dBot / 2;
  const xt0 = cx - wTop / 2, xt1 = cx + wTop / 2;
  const zt0 = cz - dTop / 2, zt1 = cz + dTop / 2;
  pushQuad(out, [xb0, y0, zb1], [xb1, y0, zb1], [xt1, y1, zt1], [xt0, y1, zt1], col); // front
  pushQuad(out, [xb1, y0, zb0], [xb0, y0, zb0], [xt0, y1, zt0], [xt1, y1, zt0], col); // back
  pushQuad(out, [xb1, y0, zb1], [xb1, y0, zb0], [xt1, y1, zt0], [xt1, y1, zt1], col); // right
  pushQuad(out, [xb0, y0, zb0], [xb0, y0, zb1], [xt0, y1, zt1], [xt0, y1, zt0], col); // left
  pushQuad(out, [xt0, y1, zt1], [xt1, y1, zt1], [xt1, y1, zt0], [xt0, y1, zt0], col); // top
  pushQuad(out, [xb0, y0, zb0], [xb1, y0, zb0], [xb1, y0, zb1], [xb0, y0, zb1], col); // bottom
}

const BOSS_KINDS = {
  golem: {
    name: "the Iron Golem",
    stone: [0.36, 0.36, 0.39], iron: [0.30, 0.31, 0.35], glow: [1.0, 0.62, 0.18],
  },
  orc: {
    name: "Grimtusk the Orc Chieftain",
    skin: [0.34, 0.48, 0.24], hide: [0.32, 0.22, 0.13], metal: [0.55, 0.42, 0.20], glow: [0.95, 0.78, 0.25],
  },
  wraith: {
    name: "the Bog Wraith",
    robe: [0.16, 0.24, 0.22], dark: [0.07, 0.11, 0.10], glow: [0.35, 0.95, 0.80],
  },
  wyrm: {
    name: "Skarn, Ashen Wyrm",
    scale: [0.42, 0.16, 0.11], belly: [0.62, 0.44, 0.26], horn: [0.80, 0.74, 0.60], glow: [1.0, 0.72, 0.20],
  },
  knight: {
    name: "the Barrow Knight",
    plate: [0.22, 0.22, 0.27], trim: [0.52, 0.46, 0.30], cloak: [0.34, 0.10, 0.12], glow: [0.55, 0.90, 1.0],
  },
  troll: {
    name: "Voss the Cave Troll",
    hide: [0.44, 0.38, 0.31], rock: [0.30, 0.28, 0.26], glow: [0.95, 0.85, 0.35],
  },
};

const BOSS_KIND_KEYS = Object.keys(BOSS_KINDS);

function buildBossMesh(kind) {
  const K = BOSS_KINDS[kind] || BOSS_KINDS.golem;
  const v = [];

  if (kind === "golem") {
    const st = K.stone, ir = K.iron;
    // planted stone legs
    addTaperBox(v, -0.26, 0.00, 0, 0.34, 0.34, 0.26, 0.26, 0.62, shade(st, 0.86));
    addTaperBox(v, 0.26, 0.00, 0, 0.34, 0.34, 0.26, 0.26, 0.62, shade(st, 0.86));
    // hips and huge upward-flaring torso
    addBox(v, 0, 0.72, 0, 0.72, 0.22, 0.36, ir);
    addTaperBox(v, 0, 0.83, 0, 0.70, 0.38, 1.02, 0.50, 0.74, st);
    // shoulder slabs
    addBox(v, -0.60, 1.56, 0, 0.34, 0.30, 0.52, shade(st, 1.12));
    addBox(v, 0.60, 1.56, 0, 0.34, 0.30, 0.52, shade(st, 1.12));
    // massive arms hanging past the knees
    addTaperBox(v, -0.66, 0.52, 0, 0.28, 0.30, 0.34, 0.36, 0.90, shade(st, 0.94));
    addTaperBox(v, 0.66, 0.52, 0, 0.28, 0.30, 0.34, 0.36, 0.90, shade(st, 0.94));
    addBox(v, -0.68, 0.40, 0, 0.34, 0.26, 0.34, ir);   // fists
    addBox(v, 0.68, 0.40, 0, 0.34, 0.26, 0.34, ir);
    // head sunk between the shoulders
    addTaperBox(v, 0, 1.60, 0, 0.42, 0.40, 0.36, 0.34, 0.36, shade(st, 1.05));
    addBox(v, 0, 1.74, 0.19, 0.30, 0.10, 0.04, ir);    // brow ridge
    addBox(v, -0.09, 1.70, 0.20, 0.08, 0.06, 0.03, K.glow);
    addBox(v, 0.09, 1.70, 0.20, 0.08, 0.06, 0.03, K.glow);
    // core seam glowing through the chest
    addBox(v, 0, 1.18, 0.25, 0.14, 0.30, 0.03, K.glow);
  }

  if (kind === "orc") {
    const sk = K.skin, hd = K.hide, mt = K.metal;
    addTaperBox(v, -0.22, 0.00, 0, 0.30, 0.30, 0.24, 0.24, 0.56, sk);
    addTaperBox(v, 0.22, 0.00, 0, 0.30, 0.30, 0.24, 0.24, 0.56, sk);
    addBox(v, -0.22, 0.06, 0.03, 0.34, 0.14, 0.32, hd);   // boots
    addBox(v, 0.22, 0.06, 0.03, 0.34, 0.14, 0.32, hd);
    addBox(v, 0, 0.64, 0, 0.58, 0.20, 0.34, hd);          // belt
    // barrel chest, widest at the shoulders
    addTaperBox(v, 0, 0.74, 0, 0.60, 0.38, 0.86, 0.44, 0.66, sk);
    addBox(v, 0, 0.92, 0.20, 0.44, 0.34, 0.06, shade(sk, 0.88)); // pecs shading
    // spiked pauldrons
    addTaperBox(v, -0.50, 1.32, 0, 0.36, 0.40, 0.22, 0.26, 0.22, mt);
    addTaperBox(v, 0.50, 1.32, 0, 0.36, 0.40, 0.22, 0.26, 0.22, mt);
    // arms
    addTaperBox(v, -0.54, 0.60, 0, 0.26, 0.28, 0.30, 0.30, 0.74, sk);
    addTaperBox(v, 0.54, 0.60, 0, 0.26, 0.28, 0.30, 0.30, 0.74, sk);
    addBox(v, -0.55, 0.50, 0, 0.30, 0.22, 0.28, shade(sk, 1.1));
    addBox(v, 0.55, 0.50, 0, 0.30, 0.22, 0.28, shade(sk, 1.1));
    // thick neck and heavy jaw
    addBox(v, 0, 1.44, 0, 0.26, 0.12, 0.24, shade(sk, 0.9));
    addTaperBox(v, 0, 1.50, 0, 0.40, 0.38, 0.34, 0.32, 0.34, sk);
    addTaperBox(v, 0, 1.44, 0.10, 0.34, 0.22, 0.28, 0.18, 0.14, shade(sk, 1.08)); // jaw
    addBox(v, -0.09, 1.70, 0.18, 0.09, 0.05, 0.04, K.glow);
    addBox(v, 0.09, 1.70, 0.18, 0.09, 0.05, 0.04, K.glow);
    // tusks jutting up from the lower jaw
    addTaperBox(v, -0.10, 1.44, 0.14, 0.06, 0.06, 0.02, 0.02, 0.16, [0.88, 0.86, 0.74]);
    addTaperBox(v, 0.10, 1.44, 0.14, 0.06, 0.06, 0.02, 0.02, 0.16, [0.88, 0.86, 0.74]);
    // topknot
    addTaperBox(v, 0, 1.84, -0.04, 0.14, 0.14, 0.05, 0.05, 0.22, [0.14, 0.11, 0.08]);
  }

  if (kind === "wraith") {
    const rb = K.robe, dk = K.dark;
    // no legs — the robe tapers to a point and floats
    addTaperBox(v, 0, 0.00, 0, 0.10, 0.10, 0.52, 0.42, 0.52, shade(rb, 0.55));
    addTaperBox(v, 0, 0.52, 0, 0.52, 0.42, 0.74, 0.46, 0.50, shade(rb, 0.78));
    // ragged hem strips
    addTaperBox(v, -0.20, 0.02, 0.10, 0.10, 0.06, 0.04, 0.03, 0.30, shade(rb, 0.5));
    addTaperBox(v, 0.16, -0.06, -0.06, 0.09, 0.06, 0.04, 0.03, 0.34, shade(rb, 0.5));
    // shoulders and sleeves
    addTaperBox(v, 0, 1.02, 0, 0.74, 0.46, 0.54, 0.38, 0.28, rb);
    addTaperBox(v, -0.44, 0.58, 0, 0.16, 0.18, 0.30, 0.30, 0.62, shade(rb, 0.86));
    addTaperBox(v, 0.44, 0.58, 0, 0.16, 0.18, 0.30, 0.30, 0.62, shade(rb, 0.86));
    // bony hands
    addBox(v, -0.44, 0.52, 0.02, 0.14, 0.12, 0.12, [0.72, 0.70, 0.62]);
    addBox(v, 0.44, 0.52, 0.02, 0.14, 0.12, 0.12, [0.72, 0.70, 0.62]);
    // deep hood with nothing but two lights inside
    addTaperBox(v, 0, 1.28, -0.02, 0.46, 0.44, 0.30, 0.30, 0.42, rb);
    addBox(v, 0, 1.44, 0.14, 0.30, 0.30, 0.10, dk);       // void of the hood
    addBox(v, -0.075, 1.47, 0.20, 0.07, 0.06, 0.03, K.glow);
    addBox(v, 0.075, 1.47, 0.20, 0.07, 0.06, 0.03, K.glow);
    // hood peak
    addTaperBox(v, 0, 1.68, -0.04, 0.30, 0.30, 0.05, 0.05, 0.22, shade(rb, 0.9));
  }

  if (kind === "wyrm") {
    const sc = K.scale, be = K.belly, hn = K.horn;
    // four squat legs
    [[-0.34, 0.20], [0.34, 0.20], [-0.30, -0.34], [0.30, -0.34]].forEach(([x, z]) => {
      addTaperBox(v, x, 0.00, z, 0.20, 0.20, 0.15, 0.15, 0.40, shade(sc, 0.85));
      addBox(v, x, 0.05, z + 0.05, 0.24, 0.10, 0.22, shade(sc, 0.7));
    });
    // long horizontal body
    addTaperBox(v, 0, 0.40, 0.10, 0.52, 0.74, 0.56, 0.80, 0.34, sc);
    addBox(v, 0, 0.44, 0.22, 0.40, 0.22, 0.30, be);       // belly plates
    addTaperBox(v, 0, 0.40, -0.44, 0.50, 0.50, 0.34, 0.34, 0.30, shade(sc, 0.9));
    // tail sweeping back
    addTaperBox(v, 0, 0.34, -0.72, 0.30, 0.32, 0.12, 0.14, 0.22, shade(sc, 0.85));
    addTaperBox(v, 0, 0.28, -0.96, 0.14, 0.30, 0.05, 0.16, 0.16, shade(sc, 0.8));
    // rising neck and head
    addTaperBox(v, 0, 0.72, 0.26, 0.34, 0.34, 0.26, 0.26, 0.44, sc);
    addTaperBox(v, 0, 1.14, 0.30, 0.30, 0.30, 0.26, 0.34, 0.24, shade(sc, 1.08));
    addTaperBox(v, 0, 1.20, 0.46, 0.24, 0.26, 0.16, 0.20, 0.14, shade(sc, 1.0)); // snout
    addBox(v, 0, 1.22, 0.56, 0.18, 0.07, 0.10, shade(be, 0.9));
    addBox(v, -0.09, 1.32, 0.44, 0.07, 0.05, 0.05, K.glow);
    addBox(v, 0.09, 1.32, 0.44, 0.07, 0.05, 0.05, K.glow);
    // horns swept back
    addTaperBox(v, -0.11, 1.36, 0.24, 0.07, 0.07, 0.02, 0.02, 0.26, hn);
    addTaperBox(v, 0.11, 1.36, 0.24, 0.07, 0.07, 0.02, 0.02, 0.26, hn);
    // folded wings
    addTaperBox(v, -0.42, 0.52, -0.06, 0.10, 0.34, 0.06, 0.52, 0.62, shade(sc, 1.15));
    addTaperBox(v, 0.42, 0.52, -0.06, 0.10, 0.34, 0.06, 0.52, 0.62, shade(sc, 1.15));
    // spine ridge
    [0.30, 0.10, -0.12, -0.34].forEach((z, i) => {
      addTaperBox(v, 0, 0.72 - i * 0.02, z, 0.06, 0.10, 0.02, 0.04, 0.14, hn);
    });
  }

  if (kind === "knight") {
    const pl = K.plate, tr = K.trim, cl = K.cloak;
    addTaperBox(v, -0.20, 0.00, 0, 0.28, 0.28, 0.22, 0.22, 0.58, pl);
    addTaperBox(v, 0.20, 0.00, 0, 0.28, 0.28, 0.22, 0.22, 0.58, pl);
    addBox(v, -0.20, 0.05, 0.04, 0.30, 0.12, 0.32, shade(pl, 0.8));
    addBox(v, 0.20, 0.05, 0.04, 0.30, 0.12, 0.32, shade(pl, 0.8));
    // tapered cuirass
    addBox(v, 0, 0.66, 0, 0.50, 0.16, 0.30, tr);
    addTaperBox(v, 0, 0.74, 0, 0.50, 0.32, 0.68, 0.38, 0.62, pl);
    addBox(v, 0, 1.02, 0.19, 0.20, 0.34, 0.04, tr);      // centre ridge
    // cloak hanging behind
    addTaperBox(v, 0, 0.20, -0.20, 0.46, 0.05, 0.62, 0.05, 1.16, cl);
    // pauldrons and arms
    addTaperBox(v, -0.42, 1.24, 0, 0.32, 0.36, 0.20, 0.24, 0.20, tr);
    addTaperBox(v, 0.42, 1.24, 0, 0.32, 0.36, 0.20, 0.24, 0.20, tr);
    addTaperBox(v, -0.44, 0.58, 0, 0.22, 0.24, 0.26, 0.28, 0.68, pl);
    addTaperBox(v, 0.44, 0.58, 0, 0.22, 0.24, 0.26, 0.28, 0.68, pl);
    addBox(v, -0.45, 0.50, 0, 0.24, 0.18, 0.24, tr);
    addBox(v, 0.45, 0.50, 0, 0.24, 0.18, 0.24, tr);
    // great helm with a glowing visor slit
    addBox(v, 0, 1.40, 0, 0.20, 0.10, 0.20, shade(pl, 0.7));
    addTaperBox(v, 0, 1.45, 0, 0.34, 0.34, 0.38, 0.36, 0.36, pl);
    addBox(v, 0, 1.62, 0.19, 0.30, 0.05, 0.03, K.glow);   // visor slit
    addBox(v, 0, 1.52, 0.20, 0.05, 0.24, 0.03, tr);       // nasal bar
    addTaperBox(v, 0, 1.81, 0, 0.30, 0.30, 0.10, 0.10, 0.16, tr); // crest
  }

  if (kind === "troll") {
    const hd = K.hide, rk = K.rock;
    // short bowed legs
    addTaperBox(v, -0.28, 0.00, 0, 0.34, 0.34, 0.30, 0.30, 0.44, hd);
    addTaperBox(v, 0.28, 0.00, 0, 0.34, 0.34, 0.30, 0.30, 0.44, hd);
    addBox(v, -0.30, 0.05, 0.08, 0.38, 0.12, 0.38, shade(hd, 0.82));
    addBox(v, 0.30, 0.05, 0.08, 0.38, 0.12, 0.38, shade(hd, 0.82));
    // hunched torso — leans forward, huge across the back
    addTaperBox(v, 0, 0.44, -0.02, 0.62, 0.42, 0.92, 0.52, 0.68, hd);
    addBox(v, 0, 0.72, 0.22, 0.46, 0.36, 0.08, shade(hd, 1.12)); // gut
    addBox(v, 0, 1.06, -0.24, 0.70, 0.30, 0.12, rk);             // rocky back plate
    // long arms reaching the floor
    addTaperBox(v, -0.56, 0.20, 0.02, 0.28, 0.30, 0.34, 0.34, 0.94, hd);
    addTaperBox(v, 0.56, 0.20, 0.02, 0.28, 0.30, 0.34, 0.34, 0.94, hd);
    addBox(v, -0.58, 0.10, 0.06, 0.34, 0.24, 0.32, shade(hd, 1.1));
    addBox(v, 0.58, 0.10, 0.06, 0.34, 0.24, 0.32, shade(hd, 1.1));
    // small head pushed forward, no neck
    addTaperBox(v, 0, 1.08, 0.14, 0.36, 0.34, 0.30, 0.30, 0.30, shade(hd, 1.06));
    addTaperBox(v, 0, 1.06, 0.26, 0.28, 0.16, 0.22, 0.12, 0.14, shade(hd, 1.14)); // snout
    addBox(v, -0.08, 1.28, 0.28, 0.08, 0.05, 0.04, K.glow);
    addBox(v, 0.08, 1.28, 0.28, 0.08, 0.05, 0.04, K.glow);
    addTaperBox(v, -0.07, 1.04, 0.30, 0.05, 0.05, 0.02, 0.02, 0.10, [0.86, 0.84, 0.72]); // tusks
    addTaperBox(v, 0.07, 1.04, 0.30, 0.05, 0.05, 0.02, 0.02, 0.10, [0.86, 0.84, 0.72]);
  }

  // Normalise: every boss ends up the same height and centred, so a single
  // camera frames a squat troll and a tall knight equally well.
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < v.length; i += 11) {
    const y = v[i + 1], x = v[i];
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  const spanY = Math.max(maxY - minY, 0.001);
  const spanX = Math.max(maxX - minX, 0.001);
  const scale = Math.min(1.86 / spanY, 1.70 / spanX);
  const midY = (minY + maxY) / 2;
  const midX = (minX + maxX) / 2;
  for (let i = 0; i < v.length; i += 11) {
    v[i] = (v[i] - midX) * scale;
    v[i + 1] = (v[i + 1] - midY) * scale;
    v[i + 2] = v[i + 2] * scale;
  }
  return new Float32Array(v);
}

/* Exposed for automated integrity checks — a corrupted vertex buffer renders
   as torn geometry rather than throwing, so it must be validated numerically. */
if (typeof window !== "undefined") {
  window.__RLXP_MESH__ = {
    buildCharacterMesh,
    buildChestMesh,
    buildBossMesh,
    BOSS_KIND_KEYS,
    STRIDE_FLOATS: 11,
  };
}


export { BOSS_KINDS, BOSS_KIND_KEYS, buildBossMesh, shade, addBox, addTaperBox, pushQuad };
