import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { BOSS_KINDS, BOSS_KIND_KEYS } from "./bossMesh.js";
import Sprite, {
  assetUrl,
  SPRITES, CHARACTER_IDS, characterUnlocked,
  FLOURISHES, FLOURISH_IDS, flourishOwned, flourishUsable,
  WEAPONS, WEAPON_IDS, weaponOwned, WeaponSprite,
  BACKDROPS, BACKDROP_IDS, backdropOwned, Backdrop,
  EffectSprite,
} from "./Sprite.jsx";

/* =======================================================================
   REAL-LIFE XP — pure calculation utilities
   ======================================================================= */

const MAX_LEVEL = 99;
const XP_K = 350;

const xpForLevel = (level) => XP_K * Math.pow(Math.max(level, 1) - 1, 2);

function levelForXp(xp) {
  if (xp <= 0) return 1;
  let lvl = Math.floor(Math.sqrt(xp / XP_K)) + 1;
  while (lvl < MAX_LEVEL && xpForLevel(lvl + 1) <= xp) lvl++;
  while (lvl > 1 && xpForLevel(lvl) > xp) lvl--;
  return Math.min(lvl, MAX_LEVEL);
}

const dailyTargetForLevel = (level) => 100 + 10 * level;

const weightedExerciseXP = (reps, weightKg) =>
  Math.round(reps * (1 + weightKg / 5));

const BODYWEIGHT_XP = {
  "Wall push-up": 1,
  "Knee push-up": 2,
  "Incline push-up": 2,
  "Standard push-up": 3,
  "Diamond push-up": 4,
  "Decline push-up": 4,
  "Archer push-up": 6,
  "Handstand push-up": 10,
  "Bodyweight squat": 2,
  "Jump squat": 3,
  "Reverse lunge": 2,
  "Walking lunge (per step)": 2,
  "Bulgarian split squat": 3,
  "Calf raise": 1,
  Crunch: 1,
  "Sit-up": 2,
  "Lying leg raise": 3,
  "Hanging knee raise": 4,
  "Hanging leg raise": 6,
  Burpee: 5,
  "Mountain climber (per cycle)": 1,
  "Inverted row": 4,
  Dip: 6,
  "Chin-up": 7,
  "Pull-up": 8,
};

const WEIGHTABLE_BODYWEIGHT = [
  "Standard push-up",
  "Diamond push-up",
  "Decline push-up",
  "Archer push-up",
  "Dip",
  "Chin-up",
  "Pull-up",
  "Inverted row",
];

const bodyweightXP = (name, reps) => (BODYWEIGHT_XP[name] || 0) * reps;

const weightedBodyweightXP = (name, reps, addedKg) =>
  bodyweightXP(name, reps) + Math.round((reps * addedKg) / 5);

const runXP = (km, isHill) => Math.round(km * 200 * (isHill ? 1.25 : 1));

const sprintXP = (minutes) => (minutes < 10 ? 0 : Math.round(minutes * 60));

/* Treadmill or outdoor walking, logged by time. 10 XP/min sits deliberately
   below running (~33 XP/min at a typical pace) and sprints (60/min). */
const walkXP = (minutes, isIncline) => Math.round(minutes * 10 * (isIncline ? 1.25 : 1));

const STEP_THRESHOLDS = [
  [40000, 2750],
  [35000, 2200],
  [30000, 1700],
  [25000, 1250],
  [22500, 950],
  [20000, 700],
  [17500, 475],
  [15000, 300],
  [12500, 175],
  [10000, 100],
  [7500, 50],
];
function stepsXPTotal(steps) {
  for (const [threshold, xp] of STEP_THRESHOLDS) {
    if (steps >= threshold) return xp;
  }
  return 0;
}

const stretchXP = (totalSeconds) => Math.floor(totalSeconds / 30) * 10;

function multiplierForFailCount(n) {
  if (n <= 1) return 1;
  if (n === 2) return 1.5;
  if (n === 3) return 2;
  if (n === 4) return 2.5;
  return 3;
}

function computeDecay(target, earned, totalXp, priorConsecutiveFails) {
  if (earned >= target || target <= 0) return 0;
  const missingPct = (target - earned) / target;
  const baseDecay = Math.max(target, totalXp * 0.0005);
  const multiplier = multiplierForFailCount(priorConsecutiveFails + 1);
  return Math.round(baseDecay * missingPct * multiplier);
}

/* date helpers — local calendar date, no timezone math */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
function addDaysStr(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
    dt.getDate()
  ).padStart(2, "0")}`;
}
function formatDateNice(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

const fmt = (n) => Math.round(n).toLocaleString("en-US");

/* =======================================================================
   Skills
   ======================================================================= */

const DEFAULT_SKILLS = ["Strength", "Agility", "Mobility"];

const ACTIVITY_SKILL = {
  weighted: "Strength",
  bodyweight: "Strength",
  weightedBw: "Strength",
  run: "Agility",
  walk: "Agility",
  sprint: "Agility",
  steps: "Agility",
  stretch: "Mobility",
};

/* Body part per bodyweight move, so Legs/Arms focus buffs can be applied */
const BODY_PART = {
  "Wall push-up": "Arms", "Knee push-up": "Arms", "Incline push-up": "Arms",
  "Standard push-up": "Arms", "Diamond push-up": "Arms", "Decline push-up": "Arms",
  "Archer push-up": "Arms", "Handstand push-up": "Arms",
  "Inverted row": "Arms", Dip: "Arms", "Chin-up": "Arms", "Pull-up": "Arms",
  "Bodyweight squat": "Legs", "Jump squat": "Legs", "Reverse lunge": "Legs",
  "Walking lunge (per step)": "Legs", "Bulgarian split squat": "Legs", "Calf raise": "Legs",
  Crunch: "Core", "Sit-up": "Core", "Lying leg raise": "Core",
  "Hanging knee raise": "Core", "Hanging leg raise": "Core",
  "Mountain climber (per cycle)": "Core", Burpee: "Full body",
};

const BODY_PARTS = ["Arms", "Legs", "Chest", "Back", "Core", "Full body"];

/* What a player can pick to work on. The buff is deliberately generous —
   it exists to pull someone toward the thing they avoid. */
const FOCUS_OPTIONS = [
  { key: "Strength", label: "Strength", blurb: "Lifting and bodyweight work" },
  { key: "Cardio", label: "Cardio", blurb: "Running, sprints and steps" },
  { key: "Mobility", label: "Mobility", blurb: "Stretching and flexibility" },
  { key: "Legs", label: "Legs", blurb: "Squats, lunges, leg work" },
  { key: "Arms", label: "Arms", blurb: "Push-ups, pull-ups, curls" },
];

const FOCUS_BONUS = 0.5; // +50% XP on your chosen focus

function matchesFocus(focus, skill, bodyPart) {
  if (!focus) return false;
  if (focus === "Strength") return skill === "Strength";
  if (focus === "Cardio") return skill === "Agility";
  if (focus === "Mobility") return skill === "Mobility";
  return bodyPart === focus; // Legs / Arms
}

/* Medieval nudges, shown sparingly — at most once a day, and only for the
   thing the player said they wanted to improve. */
const ENCOURAGEMENTS = {
  Arms: [
    "Have you been brawling in the tavern again? Your arms grow mighty.",
    "The blacksmith would envy those forearms. Keep at it.",
    "Word spreads through the village: your grip is not to be trifled with.",
  ],
  Legs: [
    "Rumour has it you outran the miller's horse. The legs are coming along.",
    "Those pillars could hold up a castle gate. Well done.",
    "The mountain path grows shorter each week. Your legs remember.",
  ],
  Strength: [
    "The quartermaster asks if you'd help move the anvil. Again.",
    "You lifted what three squires could not. Word travels.",
    "Iron bends to you a little easier than it did last moon.",
  ],
  Cardio: [
    "You carried word between two villages before dusk. Impressive lungs.",
    "The town crier cannot keep pace with you now.",
    "Long roads no longer frighten you. That is no small thing.",
  ],
  Mobility: [
    "You bent like river reed and did not break. The monks would approve.",
    "Stiffness retreats. Your joints thank you in their quiet way.",
    "Supple as a bowstring. Keep tending to it.",
  ],
};

function pickEncouragement(focus) {
  const list = ENCOURAGEMENTS[focus];
  if (!list || !list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

/* =======================================================================
   Cosmetics — rarity tiers, unlock conditions
   ======================================================================= */

const TIERS = ["common", "rare", "epic", "legendary", "mythic"];
const TIER_LABEL = {
  common: "Common",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
  mythic: "Mythic",
};

const TIER_INDEX = (t) => TIERS.indexOf(t);

const ITEM_CATEGORIES = [
  { key: "barFrame", label: "XP Bar Casing" },
  { key: "border", label: "Panel Trim" },
  { key: "levelStyle", label: "Level Numerals" },
  { key: "nameEffect", label: "Nameplate" },
];

/* One material per rarity, shared across every category, so a Bronze nameplate
   visually matches a Bronze casing. Progress colours never change — the bar is
   always green for earned XP and red for XP at risk. */
const MATERIAL = {
  common: "Iron",
  rare: "Bronze",
  epic: "Silver",
  legendary: "Gold",
  mythic: "Dragonfire",
};

const CATEGORY_NOUN = {
  barFrame: "Casing",
  border: "Trim",
  levelStyle: "Numerals",
  nameEffect: "Nameplate",
};

const ITEMS = [];
ITEM_CATEGORIES.forEach(({ key }) => {
  TIERS.forEach((tier) => {
    ITEMS.push({
      id: `${key}-${tier}`,
      category: key,
      tier,
      name: `${MATERIAL[tier]} ${CATEGORY_NOUN[key]}`,
    });
  });
});

function defaultEquipped() {
  const eq = {};
  ITEM_CATEGORIES.forEach(({ key }) => (eq[key] = `${key}-common`));
  return eq;
}

function tierOfItemId(id) {
  const item = ITEMS.find((i) => i.id === id);
  return item ? item.tier : "common";
}

/* =======================================================================
   Chests, loot and quests
   ======================================================================= */

const CHEST_LABEL = {
  common: "Weathered Chest",
  rare: "Bronze-Bound Chest",
  epic: "Silverlock Chest",
  legendary: "Gilded Chest",
  mythic: "Dragonhoard Chest",
};

/* Chest materials mirror the cosmetic MATERIAL naming (Iron/Bronze/Silver/
   Gold/Dragonfire) so a Silverlock Chest actually looks silver, etc. */
const CHEST_MATERIAL = {
  common: { wood: [0.30, 0.26, 0.21], metal: [0.42, 0.42, 0.45] },
  rare: { wood: [0.34, 0.22, 0.13], metal: [0.74, 0.50, 0.24] },
  epic: { wood: [0.19, 0.18, 0.23], metal: [0.83, 0.86, 0.91] },
  legendary: { wood: [0.27, 0.18, 0.08], metal: [0.85, 0.67, 0.24] },
  mythic: { wood: [0.15, 0.07, 0.05], metal: [0.95, 0.30, 0.10] },
};

/* Small flat chest glyph — used anywhere a full 3D model would be overkill
   (inventory list, onboarding art). Colour comes from CSS per tier. */
function ChestGlyph({ tier, size = 26 }) {
  return (
    <svg
      viewBox="0 0 24 20"
      width={size}
      height={(size * 20) / 24}
      className={`rlxp-chest-glyph rlxp-chest-glyph-${tier || "common"}`}
      aria-hidden="true"
    >
      <path d="M2 9 Q2 2.3 12 2.3 Q22 2.3 22 9 Z" fill="currentColor" />
      <rect x="1.4" y="9" width="21.2" height="8.7" rx="1.6" fill="currentColor" />
      <rect x="1.4" y="9" width="21.2" height="1.7" fill="rgba(0,0,0,0.33)" />
      <rect x="9.6" y="8.1" width="4.8" height="3.3" rx="0.7" fill="rgba(0,0,0,0.38)" />
    </svg>
  );
}

/* Streak chests every 5 on-target days; tier climbs as the streak grows */
function chestTierForStreak(streak) {
  if (streak >= 100) return "mythic";
  if (streak >= 60) return "legendary";
  if (streak >= 30) return "epic";
  if (streak >= 15) return "rare";
  return "common";
}

/* Milestone chests every 10 character levels */
function chestTierForLevel(level) {
  if (level >= 90) return "mythic";
  if (level >= 60) return "legendary";
  if (level >= 40) return "epic";
  if (level >= 20) return "rare";
  return "common";
}

const XP_CACHE_MULT = { common: 2, rare: 4, epic: 8, legendary: 15, mythic: 30 };

/* XP caches pay a random amount scaled to the chest's tier, so two chests of
   the same rarity never feel identical. Rounded to a tidy number. */
function rollXpCache(tier, dailyTarget) {
  const base = dailyTarget * XP_CACHE_MULT[tier];
  const varied = base * (0.6 + Math.random() * 0.8);
  return Math.max(10, Math.round(varied / 10) * 10);
}
const QUEST_REWARD_MULT = { common: 1, rare: 2, epic: 3.5, legendary: 6, mythic: 10 };
const CHEST_ROLLS = { common: 2, rare: 2, epic: 3, legendary: 3, mythic: 4 };
const UPGRADE_CHANCE = 0.15;

function unownedAtTier(tier, owned) {
  return ITEMS.filter((i) => i.tier === tier && !owned.includes(i.id));
}

/* Custom activities can be about anything, so their wording has to follow the
   user's own unit rather than assuming gym vocabulary. */
function capitalise(t) {
  const s_ = String(t || "");
  return s_.charAt(0).toUpperCase() + s_.slice(1);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* Rolls the contents of one chest. Cosmetics can come in one tier above the
   chest's own tier; higher chests guarantee at least one cosmetic if any are
   still unowned, so a rare chest never feels wasted. */
function rollChestLoot(tier, ownedCosmetics, dailyTarget, forceCosmetic) {
  const owned = [...ownedCosmetics];
  const loot = [];
  const rolls = CHEST_ROLLS[tier];
  const tierIdx = TIER_INDEX(tier);
  const upTier = TIERS[Math.min(tierIdx + 1, TIERS.length - 1)];

  const tryCosmetic = () => {
    const wantUpgrade = Math.random() < UPGRADE_CHANCE && upTier !== tier;
    const order = wantUpgrade ? [upTier, tier] : [tier, upTier];
    for (const t of order) {
      const pool = unownedAtTier(t, owned);
      if (pool.length > 0) {
        const item = pick(pool);
        owned.push(item.id);
        return { kind: "cosmetic", itemId: item.id, tier: item.tier, name: item.name };
      }
    }
    return null;
  };

  const guaranteeCosmetic = forceCosmetic || tierIdx >= 2;
  if (guaranteeCosmetic) {
    const c = tryCosmetic();
    if (c) loot.push(c);
  }


  while (loot.length < rolls) {
    const roll = Math.random();
    let entry = null;
    if (roll < 0.28) {
      entry = tryGear();
    } else if (roll < 0.53) {
      entry = tryCosmetic();
    } else if (roll < 0.72) {
      entry = { kind: "restToken", amount: tierIdx >= 3 ? 2 : 1 };
    } else if (roll < 0.9) {
      entry = { kind: "questScroll", tier };
    } else {
      entry = { kind: "xpCache", amount: rollXpCache(tier, dailyTarget) };
    }
    if (!entry) entry = { kind: "restToken", amount: 1 };
    loot.push(entry);
  }

  return loot;
}

/* Quests pay loot as well as XP. Rarity signals both difficulty and payout. */
const QUEST_LOOT_ROLLS = { common: 1, rare: 1, epic: 2, legendary: 2, mythic: 3 };

function rollQuestLoot(tier, ownedCosmetics, dailyTarget) {
  const owned = [...ownedCosmetics];
  const loot = [];
  const rolls = QUEST_LOOT_ROLLS[tier];
  const tierIdx = TIER_INDEX(tier);

  while (loot.length < rolls) {
    const roll = Math.random();
    let entry = null;
    if (roll < 0.3) {
      const pool = unownedAtTier(tier, owned);
      if (pool.length > 0) {
        const item = pick(pool);
        owned.push(item.id);
        entry = { kind: "cosmetic", itemId: item.id, tier: item.tier, name: item.name };
      }
    } else if (roll < 0.65) {
      entry = { kind: "restToken", amount: tierIdx >= 3 ? 2 : 1 };
    } else {
      entry = { kind: "xpCache", amount: rollXpCache(tier, dailyTarget) };
    }
    if (!entry) entry = { kind: "xpCache", amount: rollXpCache(tier, dailyTarget) };
    loot.push(entry);
  }
  return loot;
}

/* The very first quest — deliberately trivial, so the reward loop is
   demonstrated within a minute of opening the app. */
function starterQuest() {
  return {
    id: genId(),
    tier: "common",
    type: "activityCount",
    skill: null,
    target: 1,
    reward: 10,
    title: "Log your first activity",
  };
}

/* Quest templates — all measurable against today's logged entries */
const QUEST_TEMPLATES = [
  { type: "skillXp", skill: "Strength", verb: "Earn {n} Strength XP today" },
  { type: "skillXp", skill: "Agility", verb: "Earn {n} Agility XP today" },
  { type: "skillXp", skill: "Mobility", verb: "Earn {n} Mobility XP today" },
  { type: "totalXp", verb: "Earn {n} XP today" },
  { type: "activityCount", verb: "Log {n} separate activities today" },
];

function generateQuest(tier, dailyTarget) {
  const template = pick(QUEST_TEMPLATES);
  const mult = QUEST_REWARD_MULT[tier];
  let target;
  if (template.type === "activityCount") {
    target = Math.min(2 + TIER_INDEX(tier), 6);
  } else if (template.type === "totalXp") {
    target = Math.round(dailyTarget * (1 + mult * 0.6));
  } else {
    target = Math.round(dailyTarget * (0.5 + mult * 0.4));
  }
  return {
    id: genId(),
    tier,
    type: template.type,
    skill: template.skill || null,
    target,
    reward: Math.round(dailyTarget * mult),
    title: template.verb.replace("{n}", fmt(target)),
  };
}

function questProgress(quest, state) {
  if (!quest) return 0;
  const entries = state.history.filter(
    (h) => h.date === state.lastProcessedDate && h.xp > 0 && h.type !== "Quest"
  );
  if (quest.type === "skillXp")
    return entries.filter((e) => e.skill === quest.skill).reduce((a, e) => a + e.xp, 0);
  if (quest.type === "totalXp") return entries.reduce((a, e) => a + e.xp, 0);
  if (quest.type === "activityCount") return entries.length;
  return 0;
}

/* =======================================================================
   Daily Task Board — three small, free tasks that refresh every day.
   Separate from the quest-scroll system: no scroll needed, always active,
   and completing all three grants an immediate bonus chest + XP.
   ======================================================================= */
/* Everything here has to be possible with no equipment at all — a task you
   physically can't do isn't a task, it's just a locked door. Bodyweight,
   walking, steps and stretching only. Strength XP stays because push-ups
   earn it. */
const TASK_TEMPLATES = [
  { type: "activityType", key: "bodyweight", label: "Log any Bodyweight exercise" },
  { type: "activityType", key: "run", label: "Go for a Run" },
  { type: "activityType", key: "walk", label: "Log a Walk" },
  { type: "activityType", key: "sprint", label: "Log a Sprint session" },
  { type: "activityType", key: "stretch", label: "Log some Stretching" },
  { type: "activityType", key: "steps", label: "Log your Steps" },
  { type: "skillXp", skill: "Strength", verb: "Earn {n} Strength XP" },
  { type: "skillXp", skill: "Agility", verb: "Earn {n} Agility XP" },
  { type: "skillXp", skill: "Mobility", verb: "Earn {n} Mobility XP" },
  { type: "bodyPart", part: "Legs", verb: "Earn {n} Leg-focused XP" },
  { type: "bodyPart", part: "Arms", verb: "Earn {n} Arm-focused XP" },
  { type: "bodyPart", part: "Core", verb: "Earn {n} Core-focused XP" },
  { type: "activityCount", verb: "Log {n} separate activities" },
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateDailyTasks(dailyTarget) {
  const chosen = shuffle(TASK_TEMPLATES).slice(0, 3);
  return chosen.map((tpl) => {
    let target = 1;
    let title;
    if (tpl.type === "activityType") {
      title = tpl.label;
    } else if (tpl.type === "skillXp") {
      target = Math.max(20, Math.round((dailyTarget * 0.35) / 10) * 10);
      title = tpl.verb.replace("{n}", fmt(target));
    } else if (tpl.type === "bodyPart") {
      target = Math.max(15, Math.round((dailyTarget * 0.25) / 10) * 10);
      title = tpl.verb.replace("{n}", fmt(target));
    } else if (tpl.type === "activityCount") {
      target = 2;
      title = tpl.verb.replace("{n}", target);
    }
    return {
      id: genId(),
      type: tpl.type,
      activityType: tpl.key || null,
      skill: tpl.skill || null,
      part: tpl.part || null,
      target,
      title,
    };
  });
}

/* =======================================================================
   Weekly Boss Fight — a monster spawns with HP equal to the week's total
   target. Every bit of XP earned this week deals damage. Defeat it before
   the 7 days are up for a guaranteed chest; let it survive and it just
   wanders off (no penalty, no guilt — a fresh one shows up Monday-equivalent).
   ======================================================================= */
/* Resolved lazily: BOSS_KINDS lives with the 3D meshes further down the file,
   so touching it at module-evaluation time here would hit the temporal dead
   zone and take the whole app down before it mounts. */
function bossPool() {
  return BOSS_KIND_KEYS.map((k) => ({ kind: k, name: BOSS_KINDS[k].name }));
}

/* =======================================================================
   GOLD — earned from the moments that already matter, so it rewards showing
   up rather than grinding. Deliberately NOT paid per XP: the daily loop has
   to stay the thing that drives progress, with gold as a bonus on top.
   ======================================================================= */
const COIN_PER_TIER = { common: 25, rare: 55, epic: 120, legendary: 260, mythic: 550 };

/* Levelling pays more as it gets harder, so late levels still feel worth it. */
const coinsForLevelUp = (level) => 100 + level * 15;

/* A boss is a week's work — the biggest single payout, growing with a streak. */
const coinsForBoss = (streak) => Math.round(180 * (1 + Math.min(streak, 10) * 0.1));

const coinsForQuest = (tier) => Math.round((COIN_PER_TIER[tier] || 25) * 1.4);

/* Small and daily, but it compounds — the streak is the point. */
const coinsForDailyTasks = (streak) => 40 + Math.min(streak, 30) * 5;

/* Shop prices. A mythic chest is a genuine multi-week goal rather than
   something a good week can buy outright. */
const CHEST_PRICES = { common: 150, rare: 400, epic: 900, legendary: 2000, mythic: 4500 };

function chestTierForBossStreak(weeks) {
  if (weeks >= 20) return "mythic";
  if (weeks >= 10) return "legendary";
  if (weeks >= 5) return "epic";
  if (weeks >= 2) return "rare";
  return "common";
}

function spawnWeeklyBoss(dailyTarget) {
  const pool = bossPool();
  const pick_ = pool[Math.floor(Math.random() * pool.length)];
  const maxHp = Math.max(100, Math.round((dailyTarget * 7) / 10) * 10);
  return {
    id: genId(),
    name: pick_.name,
    kind: pick_.kind,
    maxHp,
    hp: maxHp,
    daysRemaining: 7,
    defeated: false,
  };
}

/* =======================================================================
   Random Events — a small chance on any log that something happens: a
   genie with an XP lamp, a merchant, a lucky find. Never punishing, always
   a small gift, so every single log carries a flicker of "maybe this one".
   Capped at one per day so it stays a treat rather than a slot machine.
   ======================================================================= */
const EVENT_CHANCE = 0.12;

const EVENT_POOL = [
  { id: "genie", icon: "\u{1F9DE}", title: "A genie appears!",
    line: "It offers you a lamp of glowing XP.", kind: "xp", mult: 1.2 },
  { id: "merchant", icon: "\u{1F9D1}", title: "A wandering merchant",
    line: "He presses a strange coin into your palm.", kind: "xp", mult: 0.8 },
  { id: "shrine", icon: "\u26E9\uFE0F", title: "A forgotten shrine",
    line: "You kneel, and feel your strength renewed.", kind: "xp", mult: 1.5 },
  { id: "hoard", icon: "\u{1FA99}", title: "A glint in the dirt",
    line: "A small purse of coins, long forgotten.", kind: "xp", mult: 0.6 },
  { id: "sprite", icon: "\u{1F9DA}", title: "A woodland sprite",
    line: "She grants you a moment's rest for the road.", kind: "restToken" },
  { id: "courier", icon: "\u{1F4DC}", title: "A breathless courier",
    line: "A sealed quest scroll, addressed to you.", kind: "scroll" },
  { id: "stranger", icon: "\u{1F3A9}", title: "A hooded stranger",
    line: "He leaves a small locked chest and vanishes.", kind: "chest" },
];

function rollRandomEvent(state) {
  if (Math.random() > EVENT_CHANCE) return null;
  const ev = EVENT_POOL[Math.floor(Math.random() * EVENT_POOL.length)];
  const out = { id: ev.id, icon: ev.icon, title: ev.title, line: ev.line, kind: ev.kind };
  if (ev.kind === "xp") {
    out.amount = Math.max(10, Math.round((state.todayTarget * ev.mult) / 10) * 10);
  }
  return out;
}

function dailyTaskProgress(task, state) {
  const entries = state.history.filter(
    (h) => h.date === state.lastProcessedDate && h.xp > 0 && h.type !== "Quest"
  );
  let current = 0;
  if (task.type === "activityType") {
    const label = ACTIVITY_TABS.find((t) => t.key === task.activityType)?.label;
    current = entries.some((e) => e.type === label) ? task.target : 0;
  } else if (task.type === "skillXp") {
    current = entries.filter((e) => e.skill === task.skill).reduce((a, e) => a + e.xp, 0);
  } else if (task.type === "bodyPart") {
    current = entries.filter((e) => e.bodyPart === task.part).reduce((a, e) => a + e.xp, 0);
  } else if (task.type === "activityCount") {
    current = entries.length;
  }
  return { current: Math.min(current, task.target), target: task.target, done: current >= task.target };
}

/* =======================================================================
   Default state / persistence
   ======================================================================= */

const STORAGE_KEY = "rlxp-state-v1";

/* Set at build time by the HTML shell; lets you confirm which build is running */
const APP_VERSION =
  (typeof window !== "undefined" && window.RLXP_VERSION) || "dev";

function defaultState() {
  const t = todayStr();
  const skills = {};
  DEFAULT_SKILLS.forEach((s) => (skills[s] = 0));
  return {
    totalXp: 0,
    dayStartTotalXp: 0,
    todayEarned: 0,
    todayStepXp: 0,
    todayTarget: dailyTargetForLevel(1),
    lastProcessedDate: t,
    consecutiveFailures: 0,
    history: [],
    savedExercises: [],
    customActivities: [],
    coins: 0,
    skills,
    skillsAtLastLevelUp: { ...skills },
    consecutiveSuccesses: 0,
    restTokens: 0,
    restTokenActiveToday: false,
    highestLevelEver: 1,
    longestStreak: 0,
    chests: [],
    questScrolls: [],
    activeQuest: null,
    ownedCosmetics: ITEMS.filter((i) => i.tier === "common").map((i) => i.id),
    levelChestsClaimedThrough: 0,
    onboarded: false,
    character: null,
    bodyPartXp: {},
    giftChestGranted: false,
    focus: null,
    lastEncouragementDate: null,
    exerciseBodyParts: {},
    equipped: defaultEquipped(),
    settings: {
      soundOn: true,
      reducedMotion: false,
      easyMode: false,
      displayName: "Adventurer",
    },
  };
}

let idSeed = 1;
const genId = () => `${Date.now()}-${idSeed++}`;

/* Roll the state forward through any calendar days that elapsed
   since it was last touched, applying decay day by day. Skill XP is
   never touched by decay — only the overall total. */
function processRollover(prevState) {
  let s = { ...prevState, history: [...prevState.history] };
  if (!s.skills) {
    const skills = {};
    DEFAULT_SKILLS.forEach((k) => (skills[k] = 0));
    s.skills = skills;
  }
  if (!s.skillsAtLastLevelUp) s.skillsAtLastLevelUp = { ...s.skills };
  // Legacy migration: tokens used to be an array of expiring objects
  if (Array.isArray(s.restTokens)) {
    s.restTokens = s.restTokens.filter((t) => !t.usedDate).length;
  }
  if (typeof s.restTokens !== "number") s.restTokens = 0;
  if (typeof s.restTokenActiveToday !== "boolean") s.restTokenActiveToday = false;
  if (typeof s.consecutiveSuccesses !== "number") s.consecutiveSuccesses = 0;
  if (!s.highestLevelEver) s.highestLevelEver = levelForXp(s.totalXp);
  if (!s.longestStreak) s.longestStreak = 0;
  if (!s.chests) s.chests = [];
  if (!s.questScrolls) s.questScrolls = [];
  if (s.activeQuest === undefined) s.activeQuest = null;
  if (!s.ownedCosmetics) s.ownedCosmetics = ITEMS.filter((i) => i.tier === "common").map((i) => i.id);
  if (typeof s.levelChestsClaimedThrough !== "number") s.levelChestsClaimedThrough = 0;
  // Saves created before onboarding existed have already "played" — don't replay it
  if (typeof s.onboarded !== "boolean") s.onboarded = true;
  if (s.focus === undefined) s.focus = null;
  if (s.character === undefined) s.character = null;
  // One-time gift for every player, old and new. The flag is set the moment
  // it's granted (not when opened), so it can never be handed out twice.
  if (!s.giftChestGranted) {
    s.giftChestGranted = true;
    s.chests = [
      ...(s.chests || []),
      { id: genId(), tier: "epic", source: "A gift for you", gift: true },
    ];
  }
  if (!Array.isArray(s.dailyTasks) || s.dailyTasks.length === 0) {
    s.dailyTasks = generateDailyTasks(s.todayTarget);
  }
  if (typeof s.dailyTasksBonusClaimed !== "boolean") s.dailyTasksBonusClaimed = false;
  if (typeof s.dailyTaskStreak !== "number") s.dailyTaskStreak = 0;
  if (typeof s.coins !== "number") s.coins = 0;
  if (!Array.isArray(s.ownedCharacters)) s.ownedCharacters = ["human"];
  if (!Array.isArray(s.ownedFlourishes)) s.ownedFlourishes = [];
  if (!Array.isArray(s.ownedWeapons)) s.ownedWeapons = [];
  if (!Array.isArray(s.ownedBackdrops)) s.ownedBackdrops = [];
  if (!s.equippedBackdrop) s.equippedBackdrop = "none";
  if (s.equippedWeapon === undefined) s.equippedWeapon = null;
  if (s.equippedFlourish === undefined) s.equippedFlourish = null;
  if (s.character && !s.character.spriteId) s.character.spriteId = "human";
  /* Anyone already playing when gold arrived is paid for the progress they
     already made, so the shop isn't empty for people who've earned the most. */
  if (!s.coinsBackdated) {
    s.coinsBackdated = true;
    s.coins = s.coins + Math.min(100 + (s.highestLevelEver || 1) * 20, 2500);
  }
  if (!s.exercisePresets) s.exercisePresets = {};
  if (s.lastEventDate === undefined) s.lastEventDate = null;
  if (!s.weeklyBoss) s.weeklyBoss = spawnWeeklyBoss(s.todayTarget);
  // Bosses saved before the 3D rework carry an emoji instead of a model kind
  if (!s.weeklyBoss.kind || !BOSS_KINDS[s.weeklyBoss.kind]) {
    const match = BOSS_KIND_KEYS.find((k) => BOSS_KINDS[k].name === s.weeklyBoss.name);
    const kind = match || BOSS_KIND_KEYS[Math.floor(Math.random() * BOSS_KIND_KEYS.length)];
    s.weeklyBoss = { ...s.weeklyBoss, kind, name: BOSS_KINDS[kind].name };
    delete s.weeklyBoss.icon;
  }
  if (typeof s.bossDefeatStreak !== "number") s.bossDefeatStreak = 0;
  if (s.lastEncouragementDate === undefined) s.lastEncouragementDate = null;
  if (!s.exerciseBodyParts) s.exerciseBodyParts = {};
  // Cosmetics rework: the old colour-changing "barTheme" became "barFrame"
  if (s.ownedCosmetics) {
    s.ownedCosmetics = s.ownedCosmetics.map((id) =>
      typeof id === "string" ? id.replace(/^barTheme-/, "barFrame-") : id
    );
  }
  if (s.equipped) {
    s.equipped = { ...s.equipped };
    if (s.equipped.barTheme && !s.equipped.barFrame) {
      s.equipped.barFrame = String(s.equipped.barTheme).replace(/^barTheme-/, "barFrame-");
    }
    delete s.equipped.barTheme;
    ITEM_CATEGORIES.forEach(function (c) {
      if (!s.equipped[c.key]) s.equipped[c.key] = c.key + "-common";
    });
  }
  if (!s.equipped) s.equipped = defaultEquipped();

  const today = todayStr();
  let guard = 0;
  while (s.lastProcessedDate < today && guard < 3650) {
    guard++;
    const dateClosed = s.lastProcessedDate;
    const target = s.todayTarget;
    const earned = s.todayEarned;
    const usedToken = s.restTokenActiveToday;
    const easyMode = !!(s.settings && s.settings.easyMode);

    let decay = 0;
    let daySucceeded;

    if (easyMode) {
      // Easy mode: no penalty ever, but streaks/rewards still require the target
      daySucceeded = earned >= target;
    } else if (usedToken && s.restTokens > 0) {
      daySucceeded = true;
      s.restTokens = s.restTokens - 1;
      s.history.push({
        id: genId(),
        date: dateClosed,
        type: "Rest Token",
        details: "Rest token used — today's requirement waived",
        xp: 0,
        totalAfter: s.totalXp,
      });
    } else if (earned >= target) {
      daySucceeded = true;
    } else {
      daySucceeded = false;
      decay = computeDecay(target, earned, s.totalXp, s.consecutiveFailures);
    }

    const newTotal = Math.max(0, s.totalXp - decay);
    if (decay > 0) {
      // The boss lands the blow you didn't stop. The maths is unchanged —
      // this is the same decay as always, just given a face.
      const attacker = s.weeklyBoss && !s.weeklyBoss.defeated ? s.weeklyBoss.name : null;
      s.history.push({
        id: genId(),
        date: dateClosed,
        type: attacker ? "Boss Attack" : "Decay",
        details: attacker
          ? `${attacker} struck you — target missed (${fmt(earned)} / ${fmt(target)} XP)`
          : `Missed daily target (${fmt(earned)} / ${fmt(target)} XP)`,
        xp: -decay,
        totalAfter: newTotal,
      });
    }
    s.totalXp = newTotal;
    s.consecutiveFailures = daySucceeded ? 0 : s.consecutiveFailures + 1;
    s.consecutiveSuccesses = daySucceeded ? s.consecutiveSuccesses + 1 : 0;
    s.longestStreak = Math.max(s.longestStreak, s.consecutiveSuccesses);

    if (daySucceeded && s.consecutiveSuccesses > 0 && s.consecutiveSuccesses % 5 === 0) {
      const tier = chestTierForStreak(s.consecutiveSuccesses);
      s.chests = [
        ...s.chests,
        { id: genId(), tier, source: `${s.consecutiveSuccesses}-day streak` },
      ];
      s.history.push({
        id: genId(),
        date: dateClosed,
        type: "Chest",
        details: `${CHEST_LABEL[tier]} earned — ${s.consecutiveSuccesses} days on target in a row`,
        xp: 0,
        totalAfter: s.totalXp,
      });
    }

    const newLevel = levelForXp(s.totalXp);
    s.highestLevelEver = Math.max(s.highestLevelEver, newLevel);
    s.lastProcessedDate = addDaysStr(s.lastProcessedDate, 1);
    s.todayEarned = 0;
    s.todayStepXp = 0;
    s.dayStartTotalXp = s.totalXp;
    s.todayTarget = dailyTargetForLevel(newLevel);
    s.restTokenActiveToday = false;
    s.dailyTaskStreak = s.dailyTasksBonusClaimed ? s.dailyTaskStreak + 1 : 0;
    s.dailyTasks = generateDailyTasks(s.todayTarget);
    s.dailyTasksBonusClaimed = false;

    s.weeklyBoss = { ...s.weeklyBoss, daysRemaining: s.weeklyBoss.daysRemaining - 1 };
    if (s.weeklyBoss.daysRemaining <= 0) {
      if (!s.weeklyBoss.defeated) {
        s.bossDefeatStreak = 0;
        s.history.push({
          id: genId(),
          date: dateClosed,
          type: "Boss",
          details: `${s.weeklyBoss.name} slipped away undefeated`,
          xp: 0,
          totalAfter: s.totalXp,
        });
      }
      s.weeklyBoss = spawnWeeklyBoss(s.todayTarget);
    }
  }
  return s;
}

/* =======================================================================
   Small presentational helpers
   ======================================================================= */

function Panel({ children, style, className = "" }) {
  return (
    <div className={`rlxp-panel ${className}`} style={style}>
      {children}
    </div>
  );
}

/* =======================================================================
   GLYPHS — hand-drawn SVG icons. Everything in the app draws from this set
   so nothing depends on the platform's emoji font, which renders at wildly
   different sizes and styles and never matches a medieval look.
   ======================================================================= */
const GLYPH_PATHS = {
  helm: "M12 2C7.6 2 5 5 5 9.4V14c0 3.4 3.1 6 7 6s7-2.6 7-6V9.4C19 5 16.4 2 12 2zm-4.6 8.6h3.1v2.2H7.4v-2.2zm6.1 0h3.1v2.2h-3.1v-2.2zM9 16h6v1.4H9V16z",
  bag: "M8 5V4a4 4 0 0 1 8 0v1h1.6c1 0 1.8.7 1.9 1.7l1.1 11c.1 1.2-.8 2.3-2 2.3H5.4c-1.2 0-2.1-1.1-2-2.3l1.1-11C4.6 5.7 5.4 5 6.4 5H8zm2 0h4V4a2 2 0 0 0-4 0v1zM7 9.5h10V11H7V9.5z",
  shield: "M12 2l8 3v6.2c0 5-3.4 9.4-8 10.8-4.6-1.4-8-5.8-8-10.8V5l8-3zm0 3.4L6 7.6v3.6c0 3.5 2.4 6.7 6 7.9 3.6-1.2 6-4.4 6-7.9V7.6l-6-2.2z",
  scroll: "M5 3h11a3 3 0 0 1 3 3v1h-2V6a1 1 0 0 0-2 0v12a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3v-1h2v1a1 1 0 0 0 2 0V6a3 3 0 0 1 3-3H5zm3 4h8v1.8H8V7zm0 3.6h8v1.8H8v-1.8zm0 3.6h5.5V16H8v-1.8z",
  shop: "M3.4 3h17.2l1.6 4.6c.3 1-.2 2-1.1 2.3v9.5c0 .9-.7 1.6-1.6 1.6H4.5c-.9 0-1.6-.7-1.6-1.6V9.9C2 9.6 1.5 8.6 1.8 7.6L3.4 3zm1.5 2.2L3.9 8h4.3l.5-2.8H4.9zm6 0L10.4 8h3.2l-.5-2.8h-1.2zm3.5 0L15.9 8h4.2l-1-2.8h-3.7zM5.1 10.6v9.2h4.3v-5.4h5.2v5.4h4.3v-9.2a3.4 3.4 0 0 1-2.6-1 3.4 3.4 0 0 1-2.6 1 3.4 3.4 0 0 1-2.6-1 3.4 3.4 0 0 1-2.6 1 3.4 3.4 0 0 1-2.6-1H5.1z",
  gear: "M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2zm0 5.4a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6zM20.4 12c0-.5 0-1-.1-1.5l2-1.5-2-3.4-2.4 1a8 8 0 0 0-2.6-1.5L15 2.4H9l-.3 2.7a8 8 0 0 0-2.6 1.5l-2.4-1-2 3.4 2 1.5a9 9 0 0 0 0 3l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 2.6 1.5l.3 2.7h6l.3-2.7a8 8 0 0 0 2.6-1.5l2.4 1 2-3.4-2-1.5c.1-.5.1-1 .1-1.5z",
  token: "M12 2l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 15.4 6.7 18.2l1.1-5.9L3.5 8.2l5.9-.8L12 2z",
  leaf: "M20 3c-9 0-14 4.2-14 10 0 2 .6 3.7 1.6 5L4 21.4 5.4 22.8 9 19.2c1.3.8 2.8 1.2 4.5 1.2C18 20.4 20 15 20 3zm-8.6 13.6c-.6 0-1.2-.1-1.7-.3 2.4-3.7 5.4-6.2 8.3-7.6-1.6 4.8-3.4 7.9-6.6 7.9z",
  dragon: "M2 12c2-4 5-6 9-6l3-3 1 3.4L21 8l-3.6 2.2.6 3.4-3.4-1.4L12 15l-1.4-3L7 13.4 8 10 2 12zm12-4.6a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zM6 15c3 3 7 4.6 12 4.8-4 1.6-9.4 1.2-12-4.8z",
  sword: "M20.6 2l1.4 1.4-8.6 8.6 2 2-1.4 1.4-2-2-1.6 1.6 2 2L11 20.4l-2-2-2.6 2.6-2.4-2.4L6.6 16l-2-2L6 12.6l2 2 1.6-1.6-2-2L9 9.6l2 2L19.6 3l1-1z",
  coins: "M8 4a6 3 0 1 0 0 6 6 3 0 0 0 0-6zM2 8.6v2.2c0 1.7 2.7 3 6 3s6-1.3 6-3V8.6c-1.3 1-3.5 1.6-6 1.6S3.3 9.6 2 8.6zM16 10a6 3 0 0 0-2.2.4c.7.6 1.2 1.4 1.2 2.4v1c2.9-.2 5-1.4 5-2.8 0-1.7-1.8-1-4-1zM10 15.4v2.2c0 1.7 2.7 3 6 3s6-1.3 6-3v-2.2c-1.3 1-3.5 1.6-6 1.6s-4.7-.6-6-1.6zM2 13.2v2.2c0 1.7 2.7 3 6 3 .3 0 .7 0 1-.1v-2.5c-2.8-.1-5.3-1-7-2.6z",
  gem: "M8 2h8l4 6-8 14L4 8l4-6zm.9 2L6.3 7.7h11.4L15.1 4H8.9zM6.6 9.7l5.4 9.4 5.4-9.4H6.6z",
  flame: "M12 2c1 4-3 5-3 9a3 3 0 0 0 6 0c0-1.4-.6-2.4-.6-3.4 2 1.6 3.6 4 3.6 6.4a6 6 0 1 1-12 0C6 8.6 10.4 6.4 12 2z",
  star: "M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8L12 2z",
  trash: "M9 2h6l1 2h4v2H4V4h4l1-2zM5.6 8h12.8l-1 12.4a2 2 0 0 1-2 1.6H8.6a2 2 0 0 1-2-1.6L5.6 8zm3.6 2.4v9h1.8v-9H9.2zm3.8 0v9h1.8v-9H13z",
  warning: "M12 2l10.4 18H1.6L12 2zm0 4.6L5.4 18h13.2L12 6.6zM11 9.6h2v5h-2v-5zm0 6.2h2v2h-2v-2z",
  wizard: "M12 1.6l3.4 7.6H8.6L12 1.6zM6.6 11.2h10.8l1 2.2H5.6l1-2.2zM6 15.6h12l1.6 6.8H4.4L6 15.6zm4 2.2a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm4 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z",
  chart: "M3 20.4V3.6h2.2v14.6H21v2.2H3zm4.4-4.4V10h2.6v6H7.4zm4.6 0V6.4h2.6V16H12zm4.6 0V12h2.6v4h-2.6z",
  target: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2.2a7.8 7.8 0 1 1 0 15.6 7.8 7.8 0 0 1 0-15.6zm0 2.6a5.2 5.2 0 1 0 0 10.4 5.2 5.2 0 0 0 0-10.4zm0 2.4a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6z",
  drop: "M12 2c4 5.4 6.4 9 6.4 12A6.4 6.4 0 0 1 5.6 14C5.6 11 8 7.4 12 2zm0 3.8C9.2 9.6 7.8 12 7.8 14a4.2 4.2 0 0 0 8.4 0c0-2-1.4-4.4-4.2-8.2z",
  boot: "M6 2h5.4v9.4c0 1.4.6 2.6 1.8 3.4l4.4 2.8c1.4.9 2.4 1.6 2.4 3v1.4H4V2h2zm2.2 2.2H6V19.8h11.8c-.3-.3-.7-.6-1.2-.9l-4.4-2.8c-1.8-1.2-2.8-3-2.8-5.1V4.2H8.2z",
  platebody: "M8 2l4 1.8L16 2l4 2.6-2 4.4 1 12.6H5L6 9 4 4.6 8 2zm.6 2.6L6.6 5.9l1.6 3.6-.9 10.3h9.4l-.9-10.3 1.6-3.6-2-1.3L12 6 8.6 4.6z",
  platelegs: "M6 2h12l-.6 6.4L16 22h-3.4l-.6-9.6L11.4 22H8L6.6 8.4 6 2zm2.2 2.2l.4 4.2 1 11.4h.4l.6-10.4h1.8l.6 10.4h.4l1-11.4.4-4.2H8.2z",
  check: "M9.4 16.2L4.8 11.6l1.6-1.6 3 3 7.2-7.2 1.6 1.6-8.8 8.8z",
  cross: "M18.3 5.7L12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7l-1.4-1.4L9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3 1.4 1.4z",
};

/* =======================================================================
   AUDIO — every sound is synthesised at runtime with the Web Audio API.
   The app ships as one offline file, so audio files are out (they'd bloat
   it enormously and can't be fetched with no network). Synthesis costs
   nothing and lets each rarity get its own chord.

   One shared AudioContext, created lazily and resumed on the first real
   gesture: iOS both refuses to start audio outside a user gesture AND caps
   how many contexts a page may open, so making a fresh one per sound —
   as this app used to — goes silent after a handful of taps.
   ======================================================================= */
const Audio_ = (function () {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let failed = false;
  const log = [];

  function ensure() {
    if (ctx || failed) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { failed = true; return null; }
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
    } catch (e) {
      failed = true;
      ctx = null;
    }
    return ctx;
  }

  function unlock() {
    const c = ensure();
    if (c && c.state === "suspended" && c.resume) {
      try { c.resume(); } catch (e) { /* ignore */ }
    }
  }

  function noiseBuffer(c) {
    if (noiseBuf) return noiseBuf;
    const len = Math.floor(c.sampleRate * 0.6);
    noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  /* One pitched voice. glide lets a note bend, which is what separates a
     "boing" from a flat beep. */
  function tone(c, t0, opts) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = opts.type || "sine";
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.glide) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.glide), t0 + opts.dur);
    }
    const peak = Math.max(0.0002, opts.peak == null ? 0.16 : opts.peak);
    const atk = opts.attack == null ? 0.012 : opts.attack;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    let node = osc.connect(g);
    if (opts.filter) {
      const f = c.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = opts.filter;
      node = g.connect(f);
      f.connect(master);
    } else {
      g.connect(master);
    }
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.05);
  }

  /* Filtered noise — wood creaks, stone impacts, coin clatter. */
  function noise(c, t0, opts) {
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    const f = c.createBiquadFilter();
    f.type = opts.filterType || "bandpass";
    f.frequency.setValueAtTime(opts.freq, t0);
    if (opts.glide) f.frequency.exponentialRampToValueAtTime(Math.max(40, opts.glide), t0 + opts.dur);
    f.Q.value = opts.q == null ? 1.2 : opts.q;
    const g = c.createGain();
    const peak = Math.max(0.0002, opts.peak == null ? 0.12 : opts.peak);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (opts.attack == null ? 0.008 : opts.attack));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    src.connect(f).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + opts.dur + 0.05);
  }

  function chord(c, t0, freqs, opts) {
    freqs.forEach(function (fq, i) {
      tone(c, t0 + i * (opts.spread == null ? 0.075 : opts.spread), {
        freq: fq,
        type: opts.type || "triangle",
        dur: opts.dur == null ? 0.5 : opts.dur,
        peak: opts.peak == null ? 0.13 : opts.peak,
      });
    });
  }

  /* Rarity chimes climb in pitch and richness — a mythic drop should be
     audibly a different event from a common one, not the same ping. */
  const RARITY_CHORD = {
    common: [523.25, 659.25],
    rare: [587.33, 739.99, 880.0],
    epic: [659.25, 830.61, 987.77, 1318.5],
    legendary: [783.99, 987.77, 1174.66, 1567.98],
    mythic: [880.0, 1108.73, 1318.51, 1760.0, 2093.0],
  };

  const SOUNDS = {
    tick: function (c, t) {
      tone(c, t, { freq: 1174.7, type: "triangle", dur: 0.18, peak: 0.035 });
      tone(c, t, { freq: 1760.0, type: "triangle", dur: 0.16, peak: 0.016 });
    },
    logged: function (c, t) {
      // a solid thunk, then a rising confirmation blip
      noise(c, t, { freq: 320, glide: 130, dur: 0.16, peak: 0.10, q: 0.9 });
      tone(c, t + 0.03, { freq: 392.0, glide: 587.33, type: "triangle", dur: 0.26, peak: 0.11 });
    },
    levelup: function (c, t) {
      chord(c, t, [523.25, 659.25, 783.99, 1046.5], { spread: 0.11, dur: 0.55, peak: 0.15 });
      chord(c, t + 0.46, [1046.5, 1318.51, 1567.98], { spread: 0.02, dur: 0.9, peak: 0.13 });
      noise(c, t + 0.44, { freq: 2600, glide: 900, dur: 0.7, peak: 0.05, q: 0.7 });
    },
    chestCreak: function (c, t) {
      // hinge dragging open, then the latch giving way
      noise(c, t, { freq: 260, glide: 620, dur: 0.42, peak: 0.075, q: 3.2 });
      noise(c, t + 0.4, { freq: 1500, dur: 0.1, peak: 0.09, q: 1.4 });
    },
    coins: function (c, t) {
      // a shower — many short bright clinks at irregular offsets
      for (let i = 0; i < 14; i++) {
        const off = t + i * 0.035 + Math.random() * 0.02;
        tone(c, off, {
          freq: 1600 + Math.random() * 1500,
          type: "triangle",
          dur: 0.14,
          peak: 0.045,
          attack: 0.004,
        });
      }
      noise(c, t, { freq: 3200, dur: 0.5, peak: 0.03, q: 0.6 });
    },
    bossHit: function (c, t) {
      // heavy impact: low body + a crack on top
      noise(c, t, { freq: 180, glide: 60, dur: 0.3, peak: 0.16, q: 0.8 });
      tone(c, t, { freq: 110, glide: 45, type: "square", dur: 0.24, peak: 0.10, filter: 700 });
      noise(c, t + 0.01, { freq: 2400, dur: 0.09, peak: 0.05, q: 1.6 });
    },
    bossDefeat: function (c, t) {
      // the thing collapses, then a triumphant rise
      noise(c, t, { freq: 700, glide: 70, dur: 0.75, peak: 0.15, q: 0.7 });
      tone(c, t, { freq: 196.0, glide: 65.41, type: "sawtooth", dur: 0.8, peak: 0.10, filter: 600 });
      chord(c, t + 0.62, [523.25, 659.25, 783.99, 1046.5], { spread: 0.09, dur: 0.7, peak: 0.14 });
    },
    bossAttack: function (c, t) {
      // ominous, downward — you took the hit
      tone(c, t, { freq: 174.61, glide: 87.31, type: "sawtooth", dur: 0.55, peak: 0.11, filter: 500 });
      tone(c, t + 0.05, { freq: 116.54, glide: 58.27, type: "triangle", dur: 0.6, peak: 0.09 });
    },
    taskComplete: function (c, t) {
      chord(c, t, [659.25, 830.61, 987.77], { spread: 0.07, dur: 0.45, peak: 0.13 });
    },
    questComplete: function (c, t) {
      chord(c, t, [587.33, 739.99, 880.0, 1174.66], { spread: 0.08, dur: 0.55, peak: 0.13 });
      noise(c, t + 0.3, { freq: 2800, glide: 1200, dur: 0.4, peak: 0.035, q: 0.7 });
    },
    event: function (c, t) {
      // magical shimmer — bright partials sliding upward
      [880, 1174.66, 1567.98, 2093].forEach(function (f, i) {
        tone(c, t + i * 0.06, { freq: f, glide: f * 1.5, type: "sine", dur: 0.55, peak: 0.075 });
      });
      noise(c, t, { freq: 3400, glide: 6000, dur: 0.6, peak: 0.03, q: 0.5 });
    },
    restToken: function (c, t) {
      tone(c, t, { freq: 440, glide: 659.25, type: "sine", dur: 0.4, peak: 0.1 });
    },
  };

  TIERS.forEach(function (tier) {
    SOUNDS["loot_" + tier] = function (c, t) {
      chord(c, t, RARITY_CHORD[tier], {
        spread: 0.06,
        dur: tier === "mythic" ? 1.1 : 0.6,
        peak: 0.12,
      });
      if (tier === "legendary" || tier === "mythic") {
        noise(c, t + 0.1, { freq: 4000, glide: 1500, dur: 0.8, peak: 0.035, q: 0.6 });
      }
    };
  });

  /* Real recordings, where we have them. Anything not listed here still
     plays its synthesised version, so the app never has a silent moment
     while the sound library is being filled in one file at a time. */
  const SAMPLE_FILES = {
    chestCreak: "audio/chest-open.mp3",
  };
  const buffers = {};
  let samplesRequested = false;

  function loadSamples() {
    if (samplesRequested) return;
    samplesRequested = true;
    const c = ensure();
    if (!c) return;
    Object.keys(SAMPLE_FILES).forEach(function (name) {
      // inlined data in the preview, a real file once published
      const path = SAMPLE_FILES[name];
      const inlined = typeof window !== "undefined" && window.__ASSETS__ && window.__ASSETS__[path];
      const url = inlined || new URL(path, document.baseURI).href;
      fetch(url)
        .then(function (r) { return r.ok ? r.arrayBuffer() : Promise.reject(r.status); })
        .then(function (data) {
          return new Promise(function (res, rej) {
            // callback form, because older Safari doesn't return a promise here
            const ret = c.decodeAudioData(data, res, rej);
            if (ret && ret.then) ret.then(res, rej);
          });
        })
        .then(function (buf) { buffers[name] = buf; })
        .catch(function () { /* falls back to the synthesised version */ });
    });
  }

  function playSample(c, name, t0) {
    const buf = buffers[name];
    if (!buf) return false;
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = 0.9;
    src.connect(g).connect(master);
    src.start(t0);
    return true;
  }

  let enabled = true;
  return {
    setEnabled: function (v) { enabled = !!v; },
    unlock: function () { unlock(); loadSamples(); },
    loadSamples: loadSamples,
    hasSample: function (n) { return !!buffers[n]; },
    play: function (name, delay) {
      if (!enabled) return false;
      const c = ensure();
      if (!c) return false;
      const fn = SOUNDS[name];
      if (!fn && !buffers[name]) return false;
      try {
        if (c.state === "suspended" && c.resume) c.resume();
        const at = c.currentTime + (delay || 0);
        // a real recording wins; otherwise fall through to the synth version
        if (!playSample(c, name, at)) fn(c, at);
        log.push(name);
        if (log.length > 60) log.shift();
        return true;
      } catch (e) {
        return false;
      }
    },
    /* test hook — lets the suite assert which cues actually fired */
    _log: log,
    _names: function () { return Object.keys(SOUNDS); },
  };
})();

if (typeof window !== "undefined") window.__RLXP_AUDIO__ = Audio_;

/* Real Minifantasy icons, addressed by their position in the packed sheet as
   [column, row]. Anything without a good match keeps its hand-drawn SVG, so
   nothing silently turns into the wrong picture. */
/* Empty for now — the pack's own 8x8 symbols didn't suit, so the hand-drawn
   set is used instead. Adding an entry here ([column, row] in ui/icons.png)
   overrides any single icon, so swapping in a better set later is trivial. */
const ICON_POS = {};

const ICON_SHEET_COLS = 10;
const ICON_SHEET_ROWS = 12;

function Glyph({ name, size = 20, className = "" }) {
  const pos = ICON_POS[name];
  if (pos) {
    // whole-number scaling only, or 8px art turns to mush
    const scale = Math.max(1, Math.round(size / 8));
    const px = 8 * scale;
    return (
      <span
        className={`rlxp-glyph rlxp-icon ${className}`}
        style={{
          width: px,
          height: px,
          backgroundImage: `url(${assetUrl("ui/icons.png")})`,
          backgroundPosition: `-${pos[0] * px}px -${pos[1] * px}px`,
          backgroundSize: `${ICON_SHEET_COLS * px}px ${ICON_SHEET_ROWS * px}px`,
        }}
        aria-hidden="true"
      />
    );
  }
  const d = GLYPH_PATHS[name];
  if (!d) return null;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}
      className={`rlxp-glyph ${className}`} aria-hidden="true" focusable="false">
      <path d={d} fill="currentColor" />
    </svg>
  );
}

function IconButton({ onClick, label, children }) {
  return (
    <button className="rlxp-icon-btn" onClick={onClick} aria-label={label}>
      <span className="rlxp-icon-btn-glyph">{children}</span>
      <span className="rlxp-icon-btn-label">{label}</span>
    </button>
  );
}

/* =======================================================================
   Sub-components
   ======================================================================= */

function LevelDisplay({ level, displayName, nameEffectTier, levelStyleTier }) {
  const isMax = level >= MAX_LEVEL;
  return (
    <div className="rlxp-level-block">
      <div className={`rlxp-eyebrow rlxp-nameeffect-${nameEffectTier}`}>{displayName}</div>
      <div className="rlxp-level-row">
        <span className="rlxp-level-label">LVL</span>
        <span className={`rlxp-level-number rlxp-levelstyle-${levelStyleTier}`}>{level}</span>
        {isMax && <span className="rlxp-max-badge">MAX</span>}
      </div>
    </div>
  );
}

function XPBar({ totalXp, level, riskXp, frameTier }) {
  const isMax = level >= MAX_LEVEL;
  const levelStart = xpForLevel(level);
  const levelEnd = isMax ? levelStart : xpForLevel(level + 1);
  const span = Math.max(levelEnd - levelStart, 1);
  const progress = Math.max(totalXp - levelStart, 0);
  const percent = isMax ? 100 : Math.min((progress / span) * 100, 100);

  /* The red segment is the whole point of the decay system, so it must never
     shrink to invisible. Early in a level there's barely any filled bar to
     take it from, which was hiding the warning exactly when it mattered. */
  const rawRisk = isMax
    ? Math.min((riskXp / Math.max(totalXp, 1)) * 100, 8)
    : Math.min((riskXp / span) * 100, percent);
  const riskPercent = riskXp > 0 ? Math.max(rawRisk, 7) : 0;
  const greenPercent = Math.max(percent - riskPercent, 0);

  return (
    <div className="rlxp-xpbar-wrap">
      <div className={`rlxp-xpbar-frame rlxp-barframe-${frameTier}`}>
        {frameTier === "mythic" && (
          <>
            <span className="rlxp-bar-flames" aria-hidden="true" />
            <span className="rlxp-bar-dragon" aria-hidden="true"><Glyph name="dragon" size={18} /></span>
          </>
        )}
        <div className="rlxp-xpbar-track">
          <div className="rlxp-xpbar-fill-green" style={{ width: `${greenPercent}%` }} />
          <div
            className="rlxp-xpbar-fill-red"
            style={{ width: `${riskPercent}%`, left: `${greenPercent}%` }}
          />
          <div className="rlxp-xpbar-sheen" />
        </div>
      </div>
      <div className="rlxp-xpbar-caption">
        {isMax ? (
          <span>{fmt(totalXp)} XP — Level 99 reached</span>
        ) : (
          <>
            <span>
              {fmt(totalXp)} / {fmt(levelEnd)} XP
            </span>
            <span className="rlxp-xpbar-next">
              Next level in {fmt(levelEnd - totalXp)} XP
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/* =======================================================================
   THE DAILY WARNING

   Solo Levelling's daily quest is a threat with a clock on it, and that's
   what makes it work. This merges the old progress bar and penalty notice
   into one panel that escalates as the day runs out:

     calm  -> under half the day gone
     urgent-> past mid-afternoon, still short
     critical -> under two hours, still short
     safe  -> requirement met, the whole thing goes green and quiet

   The escape hatches (rest tokens, easy mode) stay visible in every state.
   The point is to make missing a day feel real, not to make someone anxious.
   ======================================================================= */
function msUntilMidnight() {
  const now = new Date();
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  return end - now;
}

function formatCountdown(ms) {
  if (ms <= 0) return "0m";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 1) return `${h}h ${m}m`;
  const sec = Math.floor((ms % 60000) / 1000);
  return `${m}m ${String(sec).padStart(2, "0")}s`;
}

function DailyWarning({ earned, target, riskXp, targetMet, tokenActive, easyMode, restTokens, onUseToken }) {
  const [left, setLeft] = useState(msUntilMidnight);
  useEffect(() => {
    const t = setInterval(() => setLeft(msUntilMidnight()), 1000);
    return () => clearInterval(t);
  }, []);

  const pct = Math.min((earned / Math.max(target, 1)) * 100, 100);
  const hoursLeft = left / 3600000;
  const safe = targetMet || tokenActive || easyMode;
  const level = safe ? "safe" : hoursLeft <= 2 ? "critical" : hoursLeft <= 9 ? "urgent" : "calm";

  const headline = targetMet
    ? "Daily requirement complete"
    : tokenActive
    ? "Rest token active — no penalty today"
    : easyMode
    ? "Easy mode — no penalty for missing a day"
    : level === "critical"
    ? "Time is nearly up"
    : "Daily requirement not met";

  return (
    <div className={`rlxp-warning rlxp-warning-${level}`}>
      <div className="rlxp-warning-head">
        <span className="rlxp-warning-title">
          {safe ? <Glyph name="check" size={15} /> : <Glyph name="warning" size={15} />}
          {headline}
        </span>
        {!safe && <span className="rlxp-warning-clock">{formatCountdown(left)}</span>}
      </div>

      <div className="rlxp-warning-track">
        <div className="rlxp-warning-fill" style={{ width: `${pct}%` }} />
        <span className="rlxp-warning-amount">
          {fmt(earned)} / {fmt(target)} XP
        </span>
      </div>

      {!safe && (
        <div className="rlxp-warning-foot">
          <span className="rlxp-warning-penalty">
            Penalty if unmet: <strong>−{fmt(riskXp)} XP</strong>
          </span>
          {restTokens > 0 && (
            <button className="rlxp-warning-token" onClick={onUseToken}>
              <Glyph name="token" size={13} /> Use a rest token
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* =======================================================================
   3D CHARACTER — hand-rolled WebGL, no libraries.
   Low-poly boxy build in the spirit of old-school MMO models.
   ======================================================================= */


/* --- armour sets: the classic metal ladder, gated by character level --- */
const ONBOARDING_STEPS = [
  {
    art: "sword",
    title: "You are the character",
    body: "This is a game where the hero is you. When you exercise in real life, your character gets stronger. That's the whole idea.",
  },
  {
    art: "chart",
    title: "Exercise, then tell the app",
    body: "Did some push-ups? Went for a run? Tap Log Activity and type what you did. You get XP for it. Enough XP and you level up. Everyone starts at Level 1. The top is Level 99.",
  },
  {
    art: "target",
    title: "A little bit every day",
    body: "Each day you get a small target to hit. It's small on purpose — a short walk or a few sets will do it. Hit it and you're safe for the day.",
  },
  {
    art: "drop",
    title: "The Decay Bar",
    body: "That red chunk at the end of your XP bar is called the Decay Bar. Miss your daily target and you lose that much XP overnight. Earn XP today and it shrinks. Hit your target and it vanishes. (Too scary? Settings has an Easy Mode that switches it off — if you're a big baby.)",
  },
  {
    art: "shield",
    title: "Three skills",
    body: "Lifting and push-ups build Strength. Running and walking build Agility. Stretching builds Mobility. Each levels up on its own. And in Settings you can pick a Training Focus — the thing you avoid — to earn +50% XP whenever you train it.",
  },
  {
    art: "CHEST",
    title: "Rewards for showing up",
    body: "Chests hold XP, cosmetics and rest tokens — a token skips one day's penalty for when life gets in the way. You get chests every 5 days in a row, every 10 levels, and quests can drop tokens and loot too. Rarer quest, better payout.",
  },
];



const GEAR_SLOT_DEFS = [
  { key: "helmet", label: "Helmet", piece: "Full Helm", glyph: "helm" },
  { key: "torso", label: "Torso", piece: "Platebody", glyph: "platebody" },
  { key: "legs", label: "Legs", piece: "Platelegs", glyph: "platelegs" },
];

/* Accessories: fun items, no level requirement, equip any time */

/* Which armour sets each chest rarity can drop */
const CHEST_GEAR_POOL = {
  common: ["bronze", "iron"],
  rare: ["steel", "black"],
  epic: ["mithril", "adamantite"],
  legendary: ["runite", "dragon"],
  mythic: ["runite", "dragon"],
};


/* --- tiny column-major matrix helpers --- */
/* Push one axis-aligned box: 36 verts of [pos, normal, colour] */

/* Shared quad emitter: computes the face normal from the winding and emits
   two triangles of 11-float vertices [pos, normal, colour, uv]. */
/* Tapered box (frustum): different width/depth at bottom vs top. This is the
   primitive that makes forms read as classic low-poly MMO art — flared
   skirts, trapezoid torsos, limbs that thin toward the joint, narrow chins —
   instead of stacks of straight crates. */
/* =======================================================================
   3D BOSSES — six creatures, same hand-rolled primitives as the character.
   Each is built feet-at-zero then normalised to a common height so one
   camera frames them all, whatever their proportions.
   ======================================================================= */

/* ---------------- Character panel ---------------- */

function BodyPartRow({ label, xp }) {
  const level = levelForXp(xp);
  const isMax = level >= MAX_LEVEL;
  const start = xpForLevel(level);
  const end = isMax ? start : xpForLevel(level + 1);
  const pct = isMax ? 100 : Math.min(((xp - start) / Math.max(end - start, 1)) * 100, 100);
  return (
    <div className="rlxp-skill-row">
      <div className="rlxp-skill-header">
        <span className="rlxp-skill-name">{label}</span>
        <span className="rlxp-skill-level">Lvl {level}</span>
      </div>
      <div className="rlxp-skill-track">
        <div className="rlxp-skill-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="rlxp-skill-xp">{fmt(xp)} XP</div>
    </div>
  );
}

function CharacterPanel({ state, onChooseCharacter, onBuyCharacter, onEquipFlourish, onEquipWeapon, onClose }) {
  const char = state.character;
  const currentSpriteId = (char && char.spriteId) || "human";
  const reducedMotion = state.settings.reducedMotion;

  const sideStats = [
    { label: "Strength", xp: state.skills.Strength || 0 },
    { label: "Cardio", xp: state.skills.Agility || 0 },
    { label: "Mobility", xp: state.skills.Mobility || 0 },
  ];

  /* Only show body parts that have actually been trained — an empty list of
     zeros tells you nothing and makes the page look broken. */
  const bodyRows = Object.entries(state.bodyPartXp || {})
    .filter(([, xp]) => xp > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name, xp]) => ({ name, xp }));

  const ownedFlourishes = FLOURISH_IDS.filter((f) => flourishOwned(f, state));
  const ownedWeapons = WEAPON_IDS.filter((w) => weaponOwned(w, state));

  return (
    <div className="rlxp-modal-overlay" onClick={onClose}>
      <div className="rlxp-modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="rlxp-modal-header">
          <span>Character</span>
          <button className="rlxp-modal-close" onClick={onClose}><Glyph name="cross" size={16} /></button>
        </div>
        <div className="rlxp-modal-body">

          {/* who you are right now */}
          <div className="rlxp-char-stage">
            <div className="rlxp-char-sprite-wrap">
              <Sprite id={currentSpriteId} anim="idle" scale={6} reducedMotion={reducedMotion} />
            </div>
            <div className="rlxp-char-caption">
              {(SPRITES[currentSpriteId] || {}).name || "Wanderer"}
            </div>
          </div>

          <div className="rlxp-cosmetic-category-label">Your levels</div>
          {sideStats.map((st) => (
            <SkillRow key={st.label} name={st.label} xp={st.xp} />
          ))}

          {bodyRows.length > 0 && (
            <>
              <div className="rlxp-cosmetic-category-label">Body</div>
              {bodyRows.map((r) => (
                <SkillRow key={r.name} name={r.name} xp={r.xp} />
              ))}
            </>
          )}

          {/* ---- heroes you own ---- */}
          <div className="rlxp-cosmetic-category-label">Heroes</div>
          <div className="rlxp-shop-preview-grid">
            {CHARACTER_IDS.map((cid) => {
              const def = SPRITES[cid];
              const unlocked = characterUnlocked(cid, state);
              const worn = currentSpriteId === cid;
              return (
                <div key={cid} className={`rlxp-preview-card ${worn ? "rlxp-preview-card-on" : ""}`}>
                  <div className={`rlxp-preview-stage ${unlocked ? "" : "rlxp-preview-locked"}`}>
                    <Sprite id={cid} anim="idle" scale={4} playing={unlocked} reducedMotion={reducedMotion} />
                  </div>
                  <div className="rlxp-preview-name">{def.name}</div>
                  {unlocked ? (
                    <button className="rlxp-preview-btn" disabled={worn}
                      onClick={() => onChooseCharacter({ spriteId: cid })}>
                      {worn ? "Equipped" : "Wear this"}
                    </button>
                  ) : (
                    <div className="rlxp-preview-note">Locked — visit the merchant</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ---- weapons you own ---- */}
          <div className="rlxp-cosmetic-category-label">Armoury</div>
          {ownedWeapons.length === 0 ? (
            <div className="rlxp-hint">
              Nothing in hand. Weapons change what your hero swings when you log
              — buy one from the merchant.
            </div>
          ) : (
            <div className="rlxp-shop-preview-grid">
              {ownedWeapons.map((wid) => {
                const w = WEAPONS[wid];
                const held = state.equippedWeapon === wid;
                return (
                  <div key={wid} className={`rlxp-preview-card ${held ? "rlxp-preview-card-on" : ""}`}>
                    <div className="rlxp-preview-stage">
                      <WeaponSprite weaponId={wid} spriteId={currentSpriteId} scale={4} reducedMotion={reducedMotion} />
                    </div>
                    <div className="rlxp-preview-name">{w.name}</div>
                    <button className="rlxp-preview-btn"
                      onClick={() => onEquipWeapon(held ? null : wid)}>
                      {held ? "Unequip" : "Equip"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* ---- flourishes you own ---- */}
          <div className="rlxp-cosmetic-category-label">Flourishes</div>
          {ownedFlourishes.length === 0 ? (
            <div className="rlxp-hint">
              None yet. Flourishes are moves your hero performs when you log a
              workout — buy them from the merchant.
            </div>
          ) : (
            <div className="rlxp-shop-preview-grid">
              {ownedFlourishes.map((fid) => {
                const f = FLOURISHES[fid];
                const usable = flourishUsable(fid, currentSpriteId);
                const equipped = state.equippedFlourish === fid;
                const previewOn = usable ? currentSpriteId : f.characters[0];
                return (
                  <div key={fid} className={`rlxp-preview-card ${equipped ? "rlxp-preview-card-on" : ""}`}>
                    <div className="rlxp-preview-stage">
                      {f.effect ? (
                        <div className="rlxp-effect-stack">
                          <Sprite id={previewOn} anim="idle" scale={4} reducedMotion={reducedMotion} />
                          <EffectSprite id={f.effect} scale={2} reducedMotion={reducedMotion} />
                        </div>
                      ) : (
                        <Sprite id={previewOn} anim={f.anim} scale={4} reducedMotion={reducedMotion} />
                      )}
                    </div>
                    <div className="rlxp-preview-name">{f.name}</div>
                    {!usable && (
                      <div className="rlxp-preview-note">
                        Only the {SPRITES[f.characters[0]].name} can do this
                      </div>
                    )}
                    <button className="rlxp-preview-btn" disabled={equipped || !usable}
                      onClick={() => onEquipFlourish(fid)}>
                      {equipped ? "Equipped" : "Equip"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OnboardingFlow({ onComplete, reducedMotion }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [race, setRace] = useState("human");
  const [sex, setSex] = useState("male");
  const heroStep = ONBOARDING_STEPS.length;
  const nameStep = heroStep + 1;
  const current = ONBOARDING_STEPS[step];

  return (
    <div className="rlxp-onboard-overlay">
      <div className="rlxp-onboard-card">
        {step < heroStep && (
          <>
            <div className="rlxp-onboard-art">
              {current.art === "CHEST" ? <ChestGlyph tier="legendary" size={54} /> : <Glyph name={current.art} size={60} />}
            </div>
            <div className="rlxp-onboard-title">{current.title}</div>
            <div className="rlxp-onboard-body">{current.body}</div>
            <div className="rlxp-onboard-dots">
              {ONBOARDING_STEPS.map((_, i) => (
                <span key={i} className={`rlxp-onboard-dot ${i === step ? "rlxp-onboard-dot-on" : ""}`} />
              ))}
            </div>
            <button className="rlxp-btn-primary rlxp-full" onClick={() => setStep(step + 1)}>
              {step === heroStep - 1 ? "Make my character" : "Next"}
            </button>
            <button className="rlxp-link-btn rlxp-onboard-skip" onClick={() => setStep(heroStep)}>
              Skip
            </button>
          </>
        )}

        {step === heroStep && (
          <>
            <div className="rlxp-onboard-title">Choose your hero</div>
            <div className="rlxp-char-stage rlxp-onboard-char">
              <div className="rlxp-char-sprite-wrap">
                <Sprite id="human" anim="idle" scale={6} reducedMotion={reducedMotion} />
              </div>
              <div className="rlxp-char-caption">The Wanderer</div>
            </div>
            <button className="rlxp-btn-primary rlxp-full" onClick={() => setStep(nameStep)}>
              This is me
            </button>
          </>
        )}

        {step === nameStep && (
          <>
            <div className="rlxp-onboard-art"><Glyph name="wizard" size={64} /></div>
            <div className="rlxp-onboard-title">Name your character</div>
            <div className="rlxp-onboard-body">
              This is just what shows at the top of your screen. You can change it later in Settings.
            </div>
            <label className="rlxp-field rlxp-onboard-field">
              <span>Your name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Adventurer"
                maxLength={20}
                autoFocus
              />
            </label>
            <button
              className="rlxp-btn-primary rlxp-full"
              onClick={() => onComplete(name.trim() || "Adventurer", { race, sex })}
            >
              Start playing
            </button>
            <div className="rlxp-onboard-gift">A welcome chest is waiting in your bag</div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- Loading splash ---------------- */

function LoadingSplash() {
  return (
    <div className="rlxp-splash">
      <div className="rlxp-splash-clash">
        <span className="rlxp-splash-sword rlxp-splash-sword-left"><Glyph name="sword" size={44} /></span>
        <span className="rlxp-splash-flash" />
        <span className="rlxp-splash-shield"><Glyph name="shield" size={54} /></span>
      </div>
      <div className="rlxp-splash-title">REAL-LIFE XP</div>
      <div className="rlxp-splash-subtitle">Every rep counts</div>
    </div>
  );
}

/* ---------------- Level-up celebration ---------------- */

function LevelUpCelebration({ info, onDone, reducedMotion }) {
  const [filled, setFilled] = useState(false);

  useEffect(() => {
    if (!info) return;
    setFilled(false);
    const startTimer = setTimeout(() => setFilled(true), reducedMotion ? 0 : 120);
    const dismissTimer = setTimeout(onDone, reducedMotion ? 3200 : 5200);
    return () => {
      clearTimeout(startTimer);
      clearTimeout(dismissTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info]);

  if (!info) return null;

  const { oldLevel, newLevel, gained, topSkills, newTotalXp } = info;
  const isMax = newLevel >= MAX_LEVEL;
  const spanStart = xpForLevel(oldLevel);
  const spanEnd = isMax ? xpForLevel(newLevel) : xpForLevel(newLevel + 1);
  const span = Math.max(spanEnd - spanStart, 1);
  const targetPercent = isMax ? 100 : Math.min(((newTotalXp - spanStart) / span) * 100, 100);

  const ticks = [];
  for (let lvl = oldLevel + 1; lvl <= newLevel; lvl++) {
    const pos = ((xpForLevel(lvl) - spanStart) / span) * 100;
    if (pos > 0.5 && pos < 99.5) ticks.push(pos);
  }

  return (
    <div className="rlxp-levelup-overlay" onClick={onDone}>
      <div className={`rlxp-levelup-card ${reducedMotion ? "" : "rlxp-levelup-anim"}`} onClick={(e) => e.stopPropagation()}>
        <div className="rlxp-levelup-title">LEVEL UP</div>
        <div className="rlxp-levelup-level">Level {newLevel}</div>
        {gained > 1 && <div className="rlxp-levelup-gain">+{gained} levels</div>}

        <div className="rlxp-levelup-bar-track">
          <div
            className="rlxp-levelup-bar-fill"
            style={{ width: filled ? `${targetPercent}%` : "0%" }}
          />
          {ticks.map((pos, i) => (
            <div key={i} className="rlxp-levelup-tick" style={{ left: `${pos}%` }} />
          ))}
        </div>
        <div className="rlxp-levelup-bar-caption">
          Level {oldLevel} → Level {newLevel}
        </div>

        {topSkills && topSkills.length > 0 && (
          <div className="rlxp-levelup-stats">
            <div className="rlxp-levelup-stats-title">Top skills this level</div>
            {topSkills.map((s) => (
              <div key={s.name} className="rlxp-levelup-stat-row">
                <span className="rlxp-levelup-stat-name">{s.name}</span>
                <span className="rlxp-levelup-stat-level">Lvl {s.level}</span>
                <span className="rlxp-levelup-stat-xp">+{fmt(s.xpGained)} XP</span>
              </div>
            ))}
          </div>
        )}

        <button className="rlxp-btn-primary rlxp-levelup-continue" onClick={onDone}>
          Continue
        </button>
      </div>
    </div>
  );
}

/* ---------------- Skills panel ---------------- */

/* One level row, used by both the Character page and the Skills list, so the
   two can never drift apart the way they just did. */
function SkillRow({ name, xp }) {
  const level = levelForXp(xp);
  const isMax = level >= MAX_LEVEL;
  const levelStart = xpForLevel(level);
  const levelEnd = isMax ? levelStart : xpForLevel(level + 1);
  const span = Math.max(levelEnd - levelStart, 1);
  const pct = isMax ? 100 : Math.min(((xp - levelStart) / span) * 100, 100);
  return (
    <div className="rlxp-skill-row">
      <div className="rlxp-skill-header">
        <span className="rlxp-skill-name">{name}</span>
        <span className="rlxp-skill-level">Level {level}{isMax ? " (max)" : ""}</span>
      </div>
      <div className="rlxp-skill-track">
        <div className="rlxp-skill-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="rlxp-skill-xp">
        {isMax ? `${fmt(xp)} XP` : `${fmt(xp - levelStart)} / ${fmt(levelEnd - levelStart)} XP to level ${level + 1}`}
      </div>
    </div>
  );
}

function SkillsPanel({ skills, onClose }) {
  const rows = useMemo(() => {
    return Object.entries(skills)
      .map(([name, xp]) => ({ name, xp, level: levelForXp(xp) }))
      .sort((a, b) => b.level - a.level || b.xp - a.xp);
  }, [skills]);

  return (
    <div className="rlxp-modal-overlay" onClick={onClose}>
      <div className="rlxp-modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="rlxp-modal-header">
          <span>Skills</span>
          <button className="rlxp-modal-close" onClick={onClose}><Glyph name="cross" size={16} /></button>
        </div>
        <div className="rlxp-modal-body">
          {rows.map((r) => (
            <SkillRow key={r.name} name={r.name} xp={r.xp} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Chest opening ---------------- */

const LOOT_ICON = {
  cosmetic: "gem",
  restToken: "token",
  questScroll: "scroll",
  xpCache: "coins",
};

function lootIcon(entry) {
  if (entry.kind === "gear") { // legacy saves only
    const def = GEAR_SLOT_DEFS.find((d) => d.key === entry.slot);
    return def ? def.glyph : "sword";
  }
  return LOOT_ICON[entry.kind];
}

function lootLabel(entry) {
  if (entry.kind === "gear") return entry.label;
  if (entry.kind === "cosmetic") return entry.name;
  if (entry.kind === "restToken")
    return `${entry.amount} Rest Token${entry.amount > 1 ? "s" : ""}`;
  if (entry.kind === "questScroll") return `${TIER_LABEL[entry.tier]} Quest Scroll`;
  if (entry.kind === "xpCache") return `${fmt(entry.amount)} XP Cache`;
  return "";
}

/* The chime reflects the rarest thing actually inside, so a lucky drop from
   a plain chest still sounds like a lucky drop. */
function bestLootTier(chestTier, loot) {
  let best = TIER_INDEX(chestTier);
  (loot || []).forEach((entry) => {
    if (entry.tier) best = Math.max(best, TIER_INDEX(entry.tier));
  });
  return TIERS[Math.max(0, Math.min(best, TIERS.length - 1))];
}

function ChestOpeningModal({ chest, loot, onCollect, reducedMotion }) {
  const [phase, setPhase] = useState(reducedMotion ? "revealed" : "idle");
  const [openProgress, setOpenProgress] = useState(reducedMotion ? 1 : 0);
  const [flash, setFlash] = useState(false);
  const [sparks, setSparks] = useState(false);

  useEffect(() => {
    if (!reducedMotion) return;
    Audio_.play("loot_" + bestLootTier(chest.tier, loot));
    if ((loot || []).some((l) => l.kind === "xpCache")) Audio_.play("coins", 0.08);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleTap() {
    if (phase !== "idle") return;
    setPhase("opening");
    if (navigator.vibrate) navigator.vibrate([15, 60, 30]);
    // hinge creak now, then the chime keyed to what's actually inside
    Audio_.play("chestCreak");
    const best = bestLootTier(chest.tier, loot);
    Audio_.play("loot_" + best, 0.42);
    if ((loot || []).some((l) => l.kind === "xpCache")) Audio_.play("coins", 0.5);
    const duration = 620;
    const start = performance.now();
    setTimeout(() => {
      setFlash(true);
      if (!reducedMotion) setSparks(true);
    }, duration * 0.45);
    function step(now) {
      const t = Math.min((now - start) / duration, 1);
      setOpenProgress(t);
      if (t < 1) requestAnimationFrame(step);
      else setTimeout(() => setPhase("revealed"), 320);
    }
    requestAnimationFrame(step);
  }

  return (
    <div className="rlxp-modal-overlay rlxp-chest-overlay">
      <div className={`rlxp-chest-stage rlxp-tierglow-${chest.tier}`}>
        <div className="rlxp-chest-tier-label">{TIER_LABEL[chest.tier]}</div>
        <div className="rlxp-chest-name">{CHEST_LABEL[chest.tier]}</div>

        {phase !== "revealed" && (
          <button
            className={`rlxp-chest-visual rlxp-chest-${phase}`}
            onClick={handleTap}
            aria-label="Open chest"
          >
            {chest.tier === "mythic" && <span className="rlxp-chest-flamering" aria-hidden="true" />}
            <span className={`rlxp-chest-flash ${flash ? "rlxp-chest-flash-on" : ""}`} />
            {sparks && (
              <span className="rlxp-chest-sparks" aria-hidden="true">
                {Array.from({ length: 14 }).map((_, i) => (
                  <i
                    key={i}
                    className="rlxp-spark"
                    style={{
                      "--a": `${i * 25.7 + (i % 3) * 8}deg`,
                      "--d": `${58 + (i % 4) * 24}px`,
                      "--t": `${0.5 + (i % 3) * 0.16}s`,
                    }}
                  />
                ))}
              </span>
            )}
            <div
              className="rlxp-chest-glyph-stage"
              style={{
                transform: `scale(${1 + openProgress * 0.22}) translateY(${-openProgress * 10}px)`,
              }}
            >
              <ChestGlyph tier={chest.tier} size={132} />
            </div>
          </button>
        )}

        {phase === "idle" && <div className="rlxp-chest-prompt">Tap to open</div>}
        {phase === "opening" && <div className="rlxp-chest-prompt">The lock gives way…</div>}

        {phase === "revealed" && (
          <>
            <div className="rlxp-loot-list">
              {loot.map((entry, i) => (
                <div
                  key={i}
                  className={`rlxp-loot-row rlxp-tier-${entry.tier || "common"}`}
                  style={{ animationDelay: `${i * 0.12}s` }}
                >
                  <span className="rlxp-loot-icon"><Glyph name={lootIcon(entry)} size={22} /></span>
                  <span className="rlxp-loot-name">{lootLabel(entry)}</span>
                  {entry.kind === "cosmetic" && (
                    <span className="rlxp-loot-tier">{TIER_LABEL[entry.tier]}</span>
                  )}
                </div>
              ))}
            </div>
            <button className="rlxp-btn-primary rlxp-full" onClick={onCollect}>
              Collect
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function QuestRewardModal({ reward, onClose, heading = "Quest Complete", kicker }) {
  return (
    <div className="rlxp-modal-overlay rlxp-chest-overlay">
      <div className={`rlxp-chest-stage rlxp-tierglow-${reward.tier}`}>
        <div className="rlxp-chest-tier-label">{kicker || `${TIER_LABEL[reward.tier]} Quest`}</div>
        <div className="rlxp-chest-name">{heading}</div>
        <div className="rlxp-quest-complete-sub">{reward.title}</div>
        <div className="rlxp-loot-list">
          {reward.loot.map((entry, i) => (
            <div
              key={i}
              className={`rlxp-loot-row rlxp-tier-${entry.tier || reward.tier}`}
              style={{ animationDelay: `${i * 0.12}s` }}
            >
              <span className="rlxp-loot-icon">
                <Glyph name={entry.isQuestReward ? "star" : lootIcon(entry)} size={22} />
              </span>
              <span className="rlxp-loot-name">
                {entry.isQuestReward ? `${fmt(entry.amount)} XP reward` : lootLabel(entry)}
              </span>
              {entry.kind === "cosmetic" && (
                <span className="rlxp-loot-tier">{TIER_LABEL[entry.tier]}</span>
              )}
            </div>
          ))}
        </div>
        <button className="rlxp-btn-primary rlxp-full" onClick={onClose}>
          Collect
        </button>
      </div>
    </div>
  );
}

function RandomEventModal({ event, onClose }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOpen(true), 380);
    return () => clearTimeout(t);
  }, []);
  const rewardLine =
    event.kind === "xp" ? `+${fmt(event.amount)} XP`
    : event.kind === "restToken" ? "+1 Rest Token"
    : event.kind === "scroll" ? "+1 Quest Scroll"
    : "+1 Bronze-Bound Chest";
  return (
    <div className="rlxp-modal-overlay rlxp-chest-overlay" onClick={onClose}>
      <div className="rlxp-event-stage" onClick={(e) => e.stopPropagation()}>
        <div className={`rlxp-event-glyph ${open ? "rlxp-event-glyph-in" : ""}`}>{event.icon}</div>
        <div className="rlxp-event-title">{event.title}</div>
        <div className="rlxp-event-line">{event.line}</div>
        {open && (
          <>
            <div className="rlxp-event-reward">{rewardLine}</div>
            <button className="rlxp-btn-primary rlxp-full" onClick={onClose}>Take it</button>
          </>
        )}
      </div>
    </div>
  );
}

function EncouragementScroll({ note, onClose }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOpen(true), 450);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="rlxp-modal-overlay rlxp-chest-overlay" onClick={onClose}>
      <div className="rlxp-scroll-stage" onClick={(e) => e.stopPropagation()}>
        <div className={`rlxp-scroll-visual ${open ? "rlxp-scroll-open" : ""}`}>
          <span className="rlxp-scroll-glyph"><Glyph name="scroll" size={46} /></span>
        </div>
        {open && (
          <>
            <div className="rlxp-scroll-focus">A word on your {note.focus}</div>
            <div className="rlxp-scroll-message">{note.message}</div>
            <button className="rlxp-btn-primary rlxp-full" onClick={onClose}>
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- Active quest strip ---------------- */

function BossPanel({ boss, state, reducedMotion, lastHit, attacking }) {
  if (!boss) return null;
  const pct = Math.max(0, Math.min((boss.hp / Math.max(boss.maxHp, 1)) * 100, 100));
  const hero = (state.character && state.character.spriteId) || "human";
  const weapon = state.equippedWeapon;

  return (
    <div className={`rlxp-boss-panel ${boss.defeated ? "rlxp-boss-defeated" : ""}`}>
      <div className="rlxp-boss-banner">
        <span className="rlxp-boss-banner-rule" />
        <span className="rlxp-boss-banner-text">{boss.defeated ? "Boss Slain" : "Boss Fight"}</span>
        <span className="rlxp-boss-banner-rule" />
      </div>

      {/* The fight, laid out like a duel: you on the left, it on the right.
          Logging a workout is your turn. */}
      <Backdrop id={(state.equippedBackdrop) || "none"} className="rlxp-battle">
        <div className={`rlxp-battle-hero ${attacking ? "rlxp-battle-lunge" : ""}`}>
          {attacking && weapon ? (
            <WeaponSprite weaponId={weapon} spriteId={hero} facing="down" scale={4} reducedMotion={reducedMotion} />
          ) : (
            <Sprite id={hero} anim={attacking ? "attack" : "idle"} facing="down" scale={4} reducedMotion={reducedMotion} />
          )}
        </div>

        <div className="rlxp-battle-gap">
          {lastHit != null && (
            <span key={lastHit.id} className="rlxp-battle-hit">-{fmt(lastHit.amount)}</span>
          )}
        </div>

        <div className={`rlxp-battle-boss ${attacking ? "rlxp-battle-recoil" : ""} ${boss.defeated ? "rlxp-battle-dead" : ""}`}>
          <Sprite id="orc" anim="idle" facing="down" scale={4} playing={!boss.defeated} reducedMotion={reducedMotion} />
        </div>
      </Backdrop>

      <div className="rlxp-boss-name">{boss.name}</div>

      <div className="rlxp-boss-hpwrap">
        <div className="rlxp-boss-track">
          <div className={`rlxp-boss-fill ${boss.defeated ? "rlxp-boss-fill-dead" : ""}`} style={{ width: `${pct}%` }} />
          <span className="rlxp-boss-hptext">
            {boss.defeated ? "Defeated" : `${fmt(boss.hp)} / ${fmt(boss.maxHp)} HP`}
          </span>
        </div>
      </div>

      <div className="rlxp-boss-days">
        {boss.defeated
          ? "A new challenger arrives next week"
          : `${boss.daysRemaining} day${boss.daysRemaining === 1 ? "" : "s"} left — every activity you log lands a hit`}
      </div>
    </div>
  );
}

/* Shown right after a log, because the whole point of buying a weapon is
   watching it land — and the log sheet was covering that up entirely.
   Auto-closes, so it never becomes another thing to dismiss. */
function BattleModal({ boss, state, damage, reducedMotion, onClose }) {
  const [phase, setPhase] = useState("ready");
  const hero = (state.character && state.character.spriteId) || "human";
  const weapon = state.equippedWeapon;

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("strike"), 480);
    const t2 = setTimeout(() => setPhase("after"), 1700);
    const t3 = setTimeout(onClose, 2900);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const striking = phase === "strike";
  // show HP before the hit, then let it drain — you watch it come off
  const shownHp = phase === "ready" ? Math.min(boss.hp + damage, boss.maxHp) : boss.hp;
  const pct = Math.max(0, Math.min((shownHp / Math.max(boss.maxHp, 1)) * 100, 100));

  return (
    <div className="rlxp-modal-overlay rlxp-battle-overlay" onClick={onClose}>
      <div className="rlxp-battle-stage" onClick={(e) => e.stopPropagation()}>
        <div className="rlxp-battle-title">{boss.name}</div>

        <Backdrop id={state.equippedBackdrop} className="rlxp-battle rlxp-battle-big">
          <div className={`rlxp-battle-hero ${striking ? "rlxp-battle-lunge" : ""}`}>
            {striking && weapon ? (
              <WeaponSprite weaponId={weapon} spriteId={hero} facing="down" scale={5} reducedMotion={reducedMotion} />
            ) : (
              <Sprite id={hero} anim={striking ? "attack" : "idle"} facing="down" scale={5} reducedMotion={reducedMotion} />
            )}
          </div>

          <div className="rlxp-battle-gap">
            {phase !== "ready" && (
              <span className="rlxp-battle-hit">-{fmt(damage)}</span>
            )}
          </div>

          <div className={`rlxp-battle-boss ${striking ? "rlxp-battle-recoil" : ""} ${boss.hp <= 0 ? "rlxp-battle-dead" : ""}`}>
            <Sprite id="orc" anim="idle" facing="down" scale={5} playing={boss.hp > 0} reducedMotion={reducedMotion} />
          </div>
        </Backdrop>

        <div className="rlxp-boss-track rlxp-battle-track">
          <div
            className={`rlxp-boss-fill ${boss.hp <= 0 ? "rlxp-boss-fill-dead" : ""}`}
            style={{ width: `${pct}%` }}
          />
          <span className="rlxp-boss-hptext">
            {boss.hp <= 0 ? "Defeated" : `${fmt(shownHp)} / ${fmt(boss.maxHp)} HP`}
          </span>
        </div>

        <div className="rlxp-battle-foot">
          {boss.hp <= 0 ? "It falls." : "Tap to continue"}
        </div>
      </div>
    </div>
  );
}

function ChestShop({ state, coins, onBuy, onBuyCharacter, onBuyFlourish, onEquipFlourish, onWearCharacter, onBuyWeapon, onEquipWeapon, onBuyBackdrop, onEquipBackdrop, onClose }) {
  const [tab, setTab] = useState("weapons");
  const [bought, setBought] = useState(null);
  const reducedMotion = !!(state.settings && state.settings.reducedMotion);
  const worn = (state.character && state.character.spriteId) || "human";

  function confirm(label) {
    setBought(label);
    setTimeout(() => setBought(null), 1600);
  }

  return (
    <div className="rlxp-modal-overlay" onClick={onClose}>
      <div className="rlxp-modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="rlxp-modal-header">
          <span>Merchant</span>
          <button className="rlxp-modal-close" onClick={onClose}>
            <Glyph name="cross" size={16} />
          </button>
        </div>

        <div className="rlxp-shop-purse">
          <Glyph name="coins" size={20} />
          <span className="rlxp-shop-purse-amount">{fmt(coins)}</span>
          <span className="rlxp-shop-purse-label">gold</span>
        </div>

        <div className="rlxp-tabs">
          {[["weapons", "Armoury"], ["flourishes", "Flourishes"], ["heroes", "Heroes"], ["scenes", "Scenes"], ["chests", "Chests"]].map(([k, label]) => (
            <button
              key={k}
              className={`rlxp-tab ${tab === k ? "rlxp-tab-active" : ""}`}
              onClick={() => setTab(k)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="rlxp-modal-body">
          {tab === "weapons" && (
            <>
              <div className="rlxp-hint rlxp-shop-blurb">
                Your hero swings whatever you're holding. Every weapon plays
                here before you buy it.
              </div>
              <div className="rlxp-shop-preview-grid">
                {WEAPON_IDS.map((wid) => {
                  const w = WEAPONS[wid];
                  const owned = weaponOwned(wid, state);
                  const held = state.equippedWeapon === wid;
                  const afford = coins >= w.cost;
                  return (
                    <div key={wid} className={`rlxp-preview-card ${held ? "rlxp-preview-card-on" : ""}`}>
                      <div className="rlxp-preview-stage">
                        <WeaponSprite weaponId={wid} spriteId={worn} scale={4} reducedMotion={reducedMotion} />
                      </div>
                      <div className="rlxp-preview-name">{w.name}</div>
                      <div className="rlxp-preview-blurb">{w.blurb}</div>
                      {owned ? (
                        <button className="rlxp-preview-btn" disabled={held}
                          onClick={() => onEquipWeapon(held ? null : wid)}>
                          {held ? "Equipped" : "Equip"}
                        </button>
                      ) : (
                        <button className="rlxp-preview-btn rlxp-preview-buy" disabled={!afford}
                          onClick={() => { onBuyWeapon(wid); confirm(w.name + " is yours."); }}>
                          <Glyph name="coins" size={14} /> {fmt(w.cost)}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {tab === "flourishes" && (
            <>
              <div className="rlxp-hint rlxp-shop-blurb">
                A move your character performs every time you log a workout.
                Every one plays here before you buy it.
              </div>
              <div className="rlxp-shop-preview-grid">
                {FLOURISH_IDS.map((fid) => {
                  const f = FLOURISHES[fid];
                  const owned = flourishOwned(fid, state);
                  const usable = flourishUsable(fid, worn);
                  const equipped = state.equippedFlourish === fid;
                  // preview on a hero that can actually perform it
                  const previewOn = usable ? worn : f.characters[0];
                  const afford = coins >= f.cost;
                  return (
                    <div key={fid} className={`rlxp-preview-card ${equipped ? "rlxp-preview-card-on" : ""}`}>
                      <div className="rlxp-preview-stage">
                        {f.effect ? (
                          <div className="rlxp-effect-stack">
                            <Sprite id={previewOn} anim="idle" scale={4} reducedMotion={reducedMotion} />
                            <EffectSprite id={f.effect} scale={2} reducedMotion={reducedMotion} />
                          </div>
                        ) : (
                          <Sprite id={previewOn} anim={f.anim} scale={4} reducedMotion={reducedMotion} />
                        )}
                      </div>
                      <div className="rlxp-preview-name">{f.name}</div>
                      <div className="rlxp-preview-blurb">{f.blurb}</div>
                      {!usable && (
                        <div className="rlxp-preview-note">
                          Only the {SPRITES[f.characters[0]].name} can do this
                        </div>
                      )}
                      {owned ? (
                        <button
                          className="rlxp-preview-btn"
                          disabled={equipped || !usable}
                          onClick={() => onEquipFlourish(fid)}
                        >
                          {equipped ? "Equipped" : "Equip"}
                        </button>
                      ) : (
                        <button
                          className="rlxp-preview-btn rlxp-preview-buy"
                          disabled={!afford}
                          onClick={() => { onBuyFlourish(fid); confirm(f.name + " unlocked."); }}
                        >
                          <Glyph name="coins" size={14} /> {fmt(f.cost)}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {tab === "heroes" && (
            <>
              <div className="rlxp-hint rlxp-shop-blurb">
                Swap who you play as. Owned heroes can be changed any time,
                free.
              </div>
              <div className="rlxp-shop-preview-grid">
                {CHARACTER_IDS.map((cid) => {
                  const def = SPRITES[cid];
                  const unlocked = characterUnlocked(cid, state);
                  const cost = def.unlock.type === "gold" ? def.unlock.cost : null;
                  const afford = cost != null && coins >= cost;
                  return (
                    <div key={cid} className={`rlxp-preview-card ${worn === cid ? "rlxp-preview-card-on" : ""}`}>
                      <div className={`rlxp-preview-stage ${unlocked ? "" : "rlxp-preview-locked"}`}>
                        <Sprite id={cid} anim="idle" scale={4} playing={unlocked} reducedMotion={reducedMotion} />
                      </div>
                      <div className="rlxp-preview-name">{def.name}</div>
                      <div className="rlxp-preview-blurb">{def.blurb}</div>
                      {unlocked ? (
                        <button className="rlxp-preview-btn" disabled={worn === cid}
                          onClick={() => onWearCharacter(cid)}>
                          {worn === cid ? "Equipped" : "Wear this"}
                        </button>
                      ) : (
                        <button className="rlxp-preview-btn rlxp-preview-buy" disabled={!afford}
                          onClick={() => { onBuyCharacter(cid); confirm(def.name + " unlocked."); }}>
                          <Glyph name="coins" size={14} /> {fmt(cost)}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {tab === "scenes" && (
            <>
              <div className="rlxp-hint rlxp-shop-blurb">
                Where your hero stands, and where the boss fight happens.
              </div>
              <div className="rlxp-shop-preview-grid">
                {BACKDROP_IDS.map((bid) => {
                  const bd = BACKDROPS[bid];
                  const owned = backdropOwned(bid, state);
                  const equipped = (state.equippedBackdrop || "none") === bid;
                  const afford = coins >= bd.cost;
                  return (
                    <div key={bid} className={`rlxp-preview-card ${equipped ? "rlxp-preview-card-on" : ""}`}>
                      <Backdrop id={bid} className="rlxp-preview-stage rlxp-scene-preview">
                        <Sprite id={worn} anim="idle" scale={3} reducedMotion={reducedMotion} />
                      </Backdrop>
                      <div className="rlxp-preview-name">{bd.name}</div>
                      <div className="rlxp-preview-blurb">{bd.blurb}</div>
                      {owned ? (
                        <button className="rlxp-preview-btn" disabled={equipped}
                          onClick={() => onEquipBackdrop(bid)}>
                          {equipped ? "Equipped" : "Equip"}
                        </button>
                      ) : (
                        <button className="rlxp-preview-btn rlxp-preview-buy" disabled={!afford}
                          onClick={() => { onBuyBackdrop(bid); confirm(bd.name + " unlocked."); }}>
                          <Glyph name="coins" size={14} /> {fmt(bd.cost)}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {tab === "chests" && (
            <>
              <div className="rlxp-hint rlxp-shop-blurb">
                Gold comes from levelling, bosses, quests and keeping your daily
                streak alive.
              </div>
              <div className="rlxp-shop-grid">
                {TIERS.map((tier) => {
                  const price = CHEST_PRICES[tier];
                  const afford = coins >= price;
                  return (
                    <div key={tier} className={`rlxp-shop-row rlxp-tier-${tier} ${afford ? "" : "rlxp-shop-locked"}`}>
                      <ChestGlyph tier={tier} size={44} />
                      <div className="rlxp-shop-info">
                        <div className="rlxp-shop-name">{CHEST_LABEL[tier]}</div>
                        <div className="rlxp-shop-tier">{TIER_LABEL[tier]}</div>
                      </div>
                      <button className="rlxp-shop-buy" disabled={!afford}
                        onClick={() => { onBuy(tier); confirm(CHEST_LABEL[tier] + " added to your bag."); }}>
                        <Glyph name="coins" size={15} />
                        <span>{fmt(price)}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {bought && <div className="rlxp-shop-confirm">{bought}</div>}
        </div>
      </div>
    </div>
  );
}

function DailyTaskBoard({ state }) {
  const tasks = state.dailyTasks || [];
  if (tasks.length === 0) return null;
  const withProgress = tasks.map((t) => ({ task: t, ...dailyTaskProgress(t, state) }));
  const allDone = withProgress.every((t) => t.done);
  return (
    <div className={`rlxp-taskboard ${allDone ? "rlxp-taskboard-done" : ""}`}>
      <div className="rlxp-taskboard-head">
        <span>Daily Tasks</span>
        {state.dailyTaskStreak > 0 && (
          <span className="rlxp-taskboard-streak"><Glyph name="flame" size={13} /> {state.dailyTaskStreak}</span>
        )}
      </div>
      <div className="rlxp-taskboard-list">
        {withProgress.map(({ task, current, target, done }) => (
          <div key={task.id} className={`rlxp-task-row ${done ? "rlxp-task-done" : ""}`}>
            <span className="rlxp-task-check">{done ? <Glyph name="check" size={13} /> : null}</span>
            <span className="rlxp-task-title">{task.title}</span>
            {task.type !== "activityType" && !done && (
              <span className="rlxp-task-progress">{fmt(current)}/{fmt(target)}</span>
            )}
          </div>
        ))}
      </div>
      {allDone && <div className="rlxp-taskboard-claimed">Bonus chest earned — nice work!</div>}
    </div>
  );
}

function ActiveQuest({ quest, progress }) {
  if (!quest) return null;
  const pct = Math.min((progress / Math.max(quest.target, 1)) * 100, 100);
  const done = progress >= quest.target;
  return (
    <div className={`rlxp-quest-strip rlxp-tier-${quest.tier}`}>
      <div className="rlxp-quest-head">
        <span className="rlxp-quest-icon"><Glyph name="scroll" size={18} /></span>
        <span className="rlxp-quest-title">{quest.title}</span>
        <span className="rlxp-quest-reward">+{fmt(quest.reward)} XP</span>
      </div>
      <div className="rlxp-quest-track">
        <div className={`rlxp-quest-fill ${done ? "rlxp-quest-fill-done" : ""}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="rlxp-quest-progress">
        {done ? "Complete — collect it in your bag" : `${fmt(progress)} / ${fmt(quest.target)}`}
      </div>
    </div>
  );
}

/* ---------------- Inventory (bag) ---------------- */

function InventoryPanel({ state, onUseToken, onCancelToken, onEquip, onOpenChest, onStartQuest, onAbandonQuest, onClose }) {
  const [tab, setTab] = useState("items");
  const ownedSet = state.ownedCosmetics || [];

  return (
    <div className="rlxp-modal-overlay" onClick={onClose}>
      <div className="rlxp-modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="rlxp-modal-header">
          <span>Inventory</span>
          <button className="rlxp-modal-close" onClick={onClose}><Glyph name="cross" size={16} /></button>
        </div>

        <div className="rlxp-tabs">
          <button className={`rlxp-tab ${tab === "items" ? "rlxp-tab-active" : ""}`} onClick={() => setTab("items")}>
            Items{state.chests.length > 0 ? ` (${state.chests.length})` : ""}
          </button>
          <button className={`rlxp-tab ${tab === "cosmetics" ? "rlxp-tab-active" : ""}`} onClick={() => setTab("cosmetics")}>
            Cosmetics
          </button>
        </div>

        <div className="rlxp-modal-body">
          {tab === "items" && (
            <>
              <div className="rlxp-inventory-section-title">Chests</div>
              {state.chests.length === 0 ? (
                <div className="rlxp-hint">
                  No chests waiting. Earn one every 5 days on target, and another every 10 character
                  levels. Longer streaks and higher levels yield rarer chests.
                </div>
              ) : (
                <div className="rlxp-chest-grid">
                  {state.chests.map((c) => (
                    <button
                      key={c.id}
                      className={`rlxp-chest-slot rlxp-tier-${c.tier}`}
                      onClick={() => onOpenChest(c.id)}
                    >
                      <ChestGlyph tier={c.tier} size={30} />
                      <span className="rlxp-cosmetic-tier-tag">{TIER_LABEL[c.tier]}</span>
                      <span className="rlxp-chest-slot-source">{c.source}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="rlxp-settings-divider" />
              <div className="rlxp-inventory-section-title">Rest Tokens</div>
              <div className="rlxp-hint">
                A rest token waives one day's decay penalty. Tokens never expire — bank them for a
                week you know will be hard.
              </div>
              <div className="rlxp-token-row">
                <div className="rlxp-token-chip">
                  <span className="rlxp-token-icon"><Glyph name="token" size={16} /></span>
                  <span>{state.restTokens} held</span>
                </div>
              </div>
              {state.restTokenActiveToday ? (
                <div className="rlxp-token-active-row">
                  <div className="rlxp-hint">Active for today — no penalty tonight.</div>
                  <button className="rlxp-btn-secondary" onClick={onCancelToken}>Cancel</button>
                </div>
              ) : (
                <button
                  className="rlxp-btn-primary rlxp-full"
                  disabled={state.restTokens < 1}
                  onClick={onUseToken}
                >
                  Use 1 token for today
                </button>
              )}

              <div className="rlxp-settings-divider" />
              <div className="rlxp-inventory-section-title">Quest Scrolls</div>
              {state.activeQuest ? (
                <div className="rlxp-active-quest-box">
                  <div className="rlxp-hint">Active quest — one at a time.</div>
                  <div className="rlxp-quest-title">{state.activeQuest.title}</div>
                  <div className="rlxp-quest-reward">Reward: {fmt(state.activeQuest.reward)} XP</div>
                  <button className="rlxp-btn-secondary rlxp-full" onClick={onAbandonQuest}>
                    Abandon quest
                  </button>
                </div>
              ) : state.questScrolls.length === 0 ? (
                <div className="rlxp-hint">
                  No scrolls. Find them in chests — read one to take on a bonus objective for extra XP.
                </div>
              ) : (
                <div className="rlxp-scroll-grid">
                  {state.questScrolls.map((s) => (
                    <button
                      key={s.id}
                      className={`rlxp-scroll-slot rlxp-tier-${s.tier}`}
                      onClick={() => onStartQuest(s.id)}
                    >
                      <span className="rlxp-chest-slot-icon"><Glyph name="scroll" size={26} /></span>
                      <span className="rlxp-cosmetic-tier-tag">{TIER_LABEL[s.tier]}</span>
                      <span className="rlxp-chest-slot-source">Read scroll</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === "cosmetics" && (
            <>
              <div className="rlxp-hint">
                Cosmetics drop from chests. A chest can also yield an item one tier above its own.
              </div>
              {ITEM_CATEGORIES.map(({ key, label }) => (
                <div key={key} className="rlxp-cosmetic-category">
                  <div className="rlxp-cosmetic-category-label">{label}</div>
                  <div className="rlxp-cosmetic-grid">
                    {ITEMS.filter((i) => i.category === key).map((item) => {
                      const owned = ownedSet.includes(item.id);
                      const equipped = state.equipped[key] === item.id;
                      return (
                        <button
                          key={item.id}
                          className={`rlxp-cosmetic-item rlxp-tier-${item.tier} ${
                            equipped ? "rlxp-cosmetic-equipped" : ""
                          } ${!owned ? "rlxp-cosmetic-locked" : ""}`}
                          disabled={!owned}
                          onClick={() => owned && onEquip(key, item.id)}
                        >
                          <span className="rlxp-cosmetic-tier-tag">{TIER_LABEL[item.tier]}</span>
                          <span className="rlxp-cosmetic-name">{owned ? item.name : "???"}</span>
                          {!owned && <span className="rlxp-cosmetic-lock-hint">Not yet found</span>}
                          {equipped && <span className="rlxp-cosmetic-equipped-tag">Equipped</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}


/* ---------------- Activity Log Modal ---------------- */

const ACTIVITY_TABS = [
  { key: "weighted", label: "Weighted" },
  { key: "bodyweight", label: "Bodyweight" },
  { key: "weightedBw", label: "Weighted Pull-ups & Dips" },
  { key: "run", label: "Run" },
  { key: "walk", label: "Walk" },
  { key: "sprint", label: "Sprints" },
  { key: "steps", label: "Steps" },
  { key: "stretch", label: "Stretch" },
  { key: "custom", label: "Your Own" },
];

/* Typing a number on a phone means the keyboard covers half the screen, and
   reps/sets/weight are nearly always small adjustments from a familiar value.
   Tapping is faster and can be done one-handed mid-set. The field is still a
   real input, so anyone who prefers typing still can. */
function Stepper({ label, value, onChange, suffix }) {
  return (
    <div className="rlxp-numfield">
      <span className="rlxp-numfield-label">{label}{suffix ? ` (${suffix})` : ""}</span>
      <input
        className="rlxp-numfield-input"
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => e.target.select()}
      />
    </div>
  );
}

/* One-tap repeat. Most gym logging is the same movement as last time with the
   same numbers, so re-entering all of it is wasted effort. */
function RecentChips({ presets, onPick }) {
  const list = Object.entries(presets || {})
    .sort((a, b) => (b[1].at || 0) - (a[1].at || 0))
    .slice(0, 4);
  if (list.length === 0) return null;
  return (
    <div className="rlxp-recent">
      <div className="rlxp-recent-label">Do it again</div>
      <div className="rlxp-recent-row">
        {list.map(([name, pre]) => (
          <button key={name} type="button" className="rlxp-recent-chip" onClick={() => onPick(name, pre)}>
            <span className="rlxp-recent-name">{name}</span>
            <span className="rlxp-recent-detail">
              {pre.weight ? `${pre.weight}kg · ` : ""}{pre.reps} × {pre.sets}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ActivityLogModal({ onClose, onSubmit, savedExercises, customActivities, skills, focus, exerciseBodyParts, onSaveExercise, onSaveCustom, onSetExerciseBodyPart, todayStepXp, exercisePresets, onSavePreset }) {
  /* Reopening on "Weighted" every time means anyone who mainly walks or does
     steps scrolls the tab strip on every single log. Remember where they were. */
  const [tab, setTab] = useState(() => {
    try {
      const last = window.localStorage.getItem("rlxp-last-tab");
      return ACTIVITY_TABS.some((t) => t.key === last) ? last : "weighted";
    } catch (e) {
      return "weighted";
    }
  });
  useEffect(() => {
    try { window.localStorage.setItem("rlxp-last-tab", tab); } catch (e) { /* ignore */ }
  }, [tab]);

  // weighted
  const [exName, setExName] = useState("");
  const [exWeight, setExWeight] = useState("");
  const [exReps, setExReps] = useState("");
  const [exSets, setExSets] = useState("1");
  const [exPart, setExPart] = useState("Full body");

  // bodyweight
  const [bwName, setBwName] = useState(Object.keys(BODYWEIGHT_XP)[0]);
  const [bwReps, setBwReps] = useState("");
  const [bwSets, setBwSets] = useState("1");

  // weighted bodyweight
  const [wbwName, setWbwName] = useState(WEIGHTABLE_BODYWEIGHT[0]);
  const [wbwReps, setWbwReps] = useState("");
  const [wbwSets, setWbwSets] = useState("1");
  const [wbwAdded, setWbwAdded] = useState("");

  // run
  const [runKm, setRunKm] = useState("");
  const [isHill, setIsHill] = useState(false);
  const [walkMin, setWalkMin] = useState("");
  const [isIncline, setIsIncline] = useState(false);

  // sprint
  const [sprintMin, setSprintMin] = useState("");

  // steps
  const [steps, setSteps] = useState("");

  // stretch
  const [stretchMode, setStretchMode] = useState("bouts");
  const [stretchBouts, setStretchBouts] = useState("");
  const [stretchMin, setStretchMin] = useState("");
  const [stretchSec, setStretchSec] = useState("");

  // custom
  const [customId, setCustomId] = useState(customActivities[0]?.id || "");
  const [customReps, setCustomReps] = useState("");
  const [customSets, setCustomSets] = useState("1");
  const [customMinutes, setCustomMinutes] = useState("");
  const [customWeight, setCustomWeight] = useState("");
  const [showNewCustom, setShowNewCustom] = useState(false);
  const [newCustomName, setNewCustomName] = useState("");
  const [newCustomMode, setNewCustomMode] = useState("perRep");
  const [newCustomUnit, setNewCustomUnit] = useState("");
  const [newCustomValue, setNewCustomValue] = useState("");
  const [newCustomSkill, setNewCustomSkill] = useState(Object.keys(skills)[0] || "Strength");
  const [newSkillName, setNewSkillName] = useState("");

  useEffect(() => {
    const known = exerciseBodyParts && exerciseBodyParts[exName];
    if (known) setExPart(known);
  }, [exName, exerciseBodyParts]);

  const submittingRef = useRef(false);
  const num = (v) => (v === "" ? 0 : parseFloat(v));

  const preview = useMemo(() => {
    switch (tab) {
      case "weighted": {
        const per = weightedExerciseXP(num(exReps), num(exWeight));
        return per * Math.max(num(exSets), 1);
      }
      case "bodyweight": {
        const per = bodyweightXP(bwName, num(bwReps));
        return per * Math.max(num(bwSets), 1);
      }
      case "weightedBw": {
        const per = weightedBodyweightXP(wbwName, num(wbwReps), num(wbwAdded));
        return per * Math.max(num(wbwSets), 1);
      }
      case "run":
        return runXP(num(runKm), isHill);
      case "walk":
        return walkXP(num(walkMin), isIncline);
      case "sprint":
        return sprintXP(num(sprintMin));
      case "steps": {
        const total = stepsXPTotal(num(steps));
        return Math.max(total - todayStepXp, 0);
      }
      case "stretch": {
        const totalSeconds =
          stretchMode === "bouts"
            ? num(stretchBouts) * 30
            : num(stretchMin) * 60 + num(stretchSec);
        return stretchXP(totalSeconds);
      }
      case "custom": {
        const activity = customActivities.find((c) => c.id === customId);
        if (!activity) return 0;
        if (activity.mode === "perRep")
          return Math.round(activity.value * num(customReps) * Math.max(num(customSets), 1));
        if (activity.mode === "perMinute")
          return Math.round(activity.value * num(customMinutes));
        if (activity.mode === "perSession") return Math.round(activity.value);
        if (activity.mode === "weighted") {
          const per = weightedExerciseXP(num(customReps), num(customWeight));
          return per * Math.max(num(customSets), 1);
        }
        return 0;
      }
      default:
        return 0;
    }
  }, [
    tab, exReps, exWeight, exSets, bwName, bwReps, bwSets, wbwName, wbwReps, wbwAdded, wbwSets,
    runKm, isHill, walkMin, isIncline, sprintMin, steps, todayStepXp, stretchMode, stretchBouts, stretchMin, stretchSec,
    customId, customReps, customSets, customMinutes, customWeight, customActivities,
  ]);

  function handleSubmit() {
    // A laggy frame plus an eager thumb shouldn't produce two identical logs.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setTimeout(() => { submittingRef.current = false; }, 800);
    let details = "";
    let xp = preview;
    let stepTotalForState = null;
    let skill = null;
    let bodyPart = null;

    switch (tab) {
      case "weighted":
        if (!exReps || !exWeight) return;
        details = `${exName || "Weighted exercise"} — ${exWeight}kg × ${exReps} × ${exSets} sets`;
        if (exName && !savedExercises.includes(exName)) onSaveExercise(exName);
        if (exName) {
          onSetExerciseBodyPart(exName, exPart);
          onSavePreset(exName, {
            weight: num(exWeight),
            reps: num(exReps),
            sets: Math.max(num(exSets), 1),
            part: exPart,
            at: Date.now(),
          });
        }
        bodyPart = exPart;
        break;
      case "bodyweight":
        details = `${bwName} — ${bwReps} reps × ${bwSets} sets`;
        bodyPart = BODY_PART[bwName] || null;
        break;
      case "weightedBw":
        details = `${wbwName} +${wbwAdded || 0}kg — ${wbwReps} reps × ${wbwSets} sets`;
        bodyPart = BODY_PART[wbwName] || null;
        break;
      case "run":
        details = `${isHill ? "Hill run" : "Run"} — ${runKm} km`;
        break;
      case "walk":
        if (!walkMin) return;
        details = `${isIncline ? "Incline walk" : "Walk"} — ${walkMin} min`;
        bodyPart = "Legs";
        break;
      case "sprint":
        details = `Sprint intervals — ${sprintMin} min`;
        break;
      case "steps":
        details = `Steps — ${fmt(num(steps))} total today`;
        stepTotalForState = stepsXPTotal(num(steps));
        break;
      case "stretch": {
        const totalSeconds =
          stretchMode === "bouts" ? num(stretchBouts) * 30 : num(stretchMin) * 60 + num(stretchSec);
        details = `Stretching — ${Math.floor(totalSeconds / 30)} × 30s bouts`;
        break;
      }
      case "custom": {
        const activity = customActivities.find((c) => c.id === customId);
        if (!activity) return;
        // Read back in the user's own words: "12 posts", "40 min", "3 sets"
        const unit = activity.unit || "reps";
        if (activity.mode === "perRep") {
          const sets = Math.max(num(customSets), 1);
          details =
            sets > 1
              ? `${activity.name} — ${customReps} ${unit} × ${sets} sets`
              : `${activity.name} — ${customReps} ${unit}`;
        } else if (activity.mode === "perMinute") {
          details = `${activity.name} — ${customMinutes} min`;
        } else if (activity.mode === "weighted") {
          details = `${activity.name} — ${customReps} reps × ${Math.max(num(customSets), 1)} sets`;
        } else {
          details = `${activity.name}`;
        }
        skill = activity.skill;
        break;
      }
      default:
        return;
    }

    onSubmit({ type: tab, details, xp, stepTotalForState, skill, bodyPart });
  }

  function handleCreateCustom() {
    if (!newCustomName) return;
    if (newCustomMode !== "weighted" && newCustomValue === "") return;
    const skillName = newCustomSkill === "__new__" ? newSkillName.trim() : newCustomSkill;
    if (!skillName) return;
    const activity = {
      id: genId(),
      name: newCustomName,
      mode: newCustomMode,
      unit: (newCustomUnit || "").trim() || null,
      value: parseFloat(newCustomValue) || 0,
      skill: skillName,
    };
    onSaveCustom(activity);
    setCustomId(activity.id);
    setShowNewCustom(false);
    setNewCustomName("");
    setNewCustomValue("");
    setNewSkillName("");
  }

  return (
    <div
      className="rlxp-modal-overlay"
      onClick={() => {
        // Tapping the backdrop is a normal way to dismiss a sheet, but it's
        // also easy to do by accident — so it only closes when nothing has
        // been entered yet.
        if (preview > 0 || exName.trim()) return;
        onClose();
      }}
    >
      <div className="rlxp-modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="rlxp-modal-header">
          <span>Log Activity</span>
          <button className="rlxp-modal-close" onClick={onClose}><Glyph name="cross" size={16} /></button>
        </div>

        <div className="rlxp-tabs">
          {ACTIVITY_TABS.map((t) => (
            <button
              key={t.key}
              className={`rlxp-tab ${tab === t.key ? "rlxp-tab-active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="rlxp-modal-body">
          {tab === "weighted" && (
            <>
              <RecentChips
                presets={exercisePresets}
                onPick={(name, pre) => {
                  setExName(name);
                  setExWeight(String(pre.weight ?? ""));
                  setExReps(String(pre.reps ?? ""));
                  setExSets(String(pre.sets ?? ""));
                  if (pre.part) setExPart(pre.part);
                }}
              />
              <label className="rlxp-field">
                <span>Exercise name</span>
                <input
                  list="rlxp-saved-exercises"
                  value={exName}
                  onChange={(e) => setExName(e.target.value)}
                  placeholder="Bench press"
                />
                <datalist id="rlxp-saved-exercises">
                  {savedExercises.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </label>
              <div className="rlxp-stepper-row-group">
                <Stepper label="Weight" value={exWeight} onChange={setExWeight} suffix="kg" />
                <Stepper label="Reps" value={exReps} onChange={setExReps} />
                <Stepper label="Sets" value={exSets} onChange={setExSets} />
              </div>
              <label className="rlxp-field">
                <span>Body part</span>
                <select value={exPart} onChange={(e) => setExPart(e.target.value)}>
                  {BODY_PARTS.map((bp) => (
                    <option key={bp} value={bp}>{bp}</option>
                  ))}
                </select>
              </label>
              <div className="rlxp-hint">
                Counts toward Strength{focus ? ` · focus: ${focus}` : ""}. Body part is remembered
                for this exercise next time.
              </div>
            </>
          )}

          {tab === "bodyweight" && (
            <>
              <label className="rlxp-field">
                <span>Exercise</span>
                <select value={bwName} onChange={(e) => setBwName(e.target.value)}>
                  {Object.keys(BODYWEIGHT_XP).map((n) => (
                    <option key={n} value={n}>{n} ({BODYWEIGHT_XP[n]} XP/rep)</option>
                  ))}
                </select>
              </label>
              <div className="rlxp-stepper-row-group">
                <Stepper label="Reps" value={bwReps} onChange={setBwReps} />
                <Stepper label="Sets" value={bwSets} onChange={setBwSets} />
              </div>
              <div className="rlxp-hint">Counts toward Strength.</div>
            </>
          )}

          {tab === "weightedBw" && (
            <>
              <label className="rlxp-field">
                <span>Exercise</span>
                <select value={wbwName} onChange={(e) => setWbwName(e.target.value)}>
                  {WEIGHTABLE_BODYWEIGHT.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
              <div className="rlxp-field-row">
                <label className="rlxp-field">
                  <span>Added weight (kg)</span>
                  <input type="number" inputMode="decimal" value={wbwAdded} onChange={(e) => setWbwAdded(e.target.value)} />
                </label>
                <label className="rlxp-field">
                  <span>Reps</span>
                  <input type="number" inputMode="numeric" value={wbwReps} onChange={(e) => setWbwReps(e.target.value)} />
                </label>
                <label className="rlxp-field">
                  <span>Sets</span>
                  <input type="number" inputMode="numeric" value={wbwSets} onChange={(e) => setWbwSets(e.target.value)} />
                </label>
              </div>
              <div className="rlxp-hint">Counts toward Strength.</div>
            </>
          )}

          {tab === "run" && (
            <>
              <label className="rlxp-field">
                <span>Distance (km)</span>
                <input type="number" inputMode="decimal" value={runKm} onChange={(e) => setRunKm(e.target.value)} />
              </label>
              <label className="rlxp-checkbox-field">
                <input type="checkbox" checked={isHill} onChange={(e) => setIsHill(e.target.checked)} />
                <span>This was a deliberate hill run (×1.25 XP)</span>
              </label>
              <div className="rlxp-hint">Counts toward Agility.</div>
            </>
          )}

          {tab === "walk" && (
            <>
              <label className="rlxp-field">
                <span>Walk duration (minutes)</span>
                <input type="number" inputMode="decimal" value={walkMin} onChange={(e) => setWalkMin(e.target.value)} placeholder="40" />
              </label>
              <label className="rlxp-checkbox-field">
                <input type="checkbox" checked={isIncline} onChange={(e) => setIsIncline(e.target.checked)} />
                <span>Incline / uphill walk (×1.25 XP)</span>
              </label>
              <div className="rlxp-hint">Treadmill or outdoors — 10 XP per minute. Counts toward Agility and Legs.</div>
            </>
          )}

          {tab === "sprint" && (
            <>
              <label className="rlxp-field">
                <span>Session duration (minutes)</span>
                <input type="number" inputMode="decimal" value={sprintMin} onChange={(e) => setSprintMin(e.target.value)} />
              </label>
              <div className="rlxp-hint">Minimum 10 minutes to qualify. 60 XP per minute. Counts toward Agility.</div>
            </>
          )}

          {tab === "steps" && (
            <>
              <label className="rlxp-field">
                <span>Total steps today</span>
                <input type="number" inputMode="numeric" value={steps} onChange={(e) => setSteps(e.target.value)} />
              </label>
              <div className="rlxp-hint">
                Already awarded {fmt(todayStepXp)} XP for steps today — only the increase is added. Counts toward Agility.
              </div>
            </>
          )}

          {tab === "stretch" && (
            <>
              <div className="rlxp-subtabs">
                <button className={stretchMode === "bouts" ? "rlxp-subtab-active" : ""} onClick={() => setStretchMode("bouts")}>Bouts</button>
                <button className={stretchMode === "time" ? "rlxp-subtab-active" : ""} onClick={() => setStretchMode("time")}>Minutes/seconds</button>
              </div>
              {stretchMode === "bouts" ? (
                <label className="rlxp-field">
                  <span>Number of 30-second bouts</span>
                  <input type="number" inputMode="numeric" value={stretchBouts} onChange={(e) => setStretchBouts(e.target.value)} />
                </label>
              ) : (
                <div className="rlxp-field-row">
                  <label className="rlxp-field">
                    <span>Minutes</span>
                    <input type="number" inputMode="numeric" value={stretchMin} onChange={(e) => setStretchMin(e.target.value)} />
                  </label>
                  <label className="rlxp-field">
                    <span>Seconds</span>
                    <input type="number" inputMode="numeric" value={stretchSec} onChange={(e) => setStretchSec(e.target.value)} />
                  </label>
                </div>
              )}
              <div className="rlxp-hint">Counts toward Mobility.</div>
            </>
          )}

          {tab === "custom" && (
            <>
              {customActivities.length > 0 && !showNewCustom && (
                <label className="rlxp-field">
                  <span>Custom activity</span>
                  <select value={customId} onChange={(e) => setCustomId(e.target.value)}>
                    {customActivities.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.skill})</option>
                    ))}
                  </select>
                </label>
              )}

              {!showNewCustom && (
                <button className="rlxp-link-btn" onClick={() => setShowNewCustom(true)}>
                  + New custom activity
                </button>
              )}

              {showNewCustom && (
                <div className="rlxp-new-custom">
                  <label className="rlxp-field">
                    <span>Activity name</span>
                    <input value={newCustomName} onChange={(e) => setNewCustomName(e.target.value)} placeholder="Rock climbing" />
                  </label>
                  <label className="rlxp-field">
                    <span>How is XP earned?</span>
                    <select value={newCustomMode} onChange={(e) => setNewCustomMode(e.target.value)}>
                      <option value="perRep">XP for each one you do</option>
                      <option value="perMinute">XP for every minute spent</option>
                      <option value="perSession">XP each time you do it</option>
                      <option value="weighted">Reps and weight (gym formula)</option>
                    </select>
                  </label>
                  {newCustomMode === "perRep" && (
                    <label className="rlxp-field">
                      <span>What are you counting?</span>
                      <input
                        value={newCustomUnit}
                        onChange={(e) => setNewCustomUnit(e.target.value)}
                        placeholder="posts, pages, drawings, reps…"
                      />
                    </label>
                  )}
                  {newCustomMode !== "weighted" && (
                    <label className="rlxp-field">
                      <span>XP value</span>
                      <input type="number" inputMode="decimal" value={newCustomValue} onChange={(e) => setNewCustomValue(e.target.value)} />
                    </label>
                  )}
                  {newCustomMode === "weighted" && (
                    <div className="rlxp-hint">Uses reps × (1 + weight ÷ 5) automatically.</div>
                  )}
                  <label className="rlxp-field">
                    <span>Track under skill</span>
                    <select value={newCustomSkill} onChange={(e) => setNewCustomSkill(e.target.value)}>
                      {Object.keys(skills).map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                      <option value="__new__">+ Create new skill…</option>
                    </select>
                  </label>
                  {newCustomSkill === "__new__" && (
                    <label className="rlxp-field">
                      <span>New skill name</span>
                      <input value={newSkillName} onChange={(e) => setNewSkillName(e.target.value)} placeholder="Endurance" />
                    </label>
                  )}
                  <div className="rlxp-field-row">
                    <button className="rlxp-btn-secondary" onClick={() => setShowNewCustom(false)}>Cancel</button>
                    <button className="rlxp-btn-primary" onClick={handleCreateCustom}>Save activity</button>
                  </div>
                </div>
              )}

              {!showNewCustom && customActivities.length === 0 && (
                <div className="rlxp-hint">Create a custom activity to get started.</div>
              )}

              {!showNewCustom && customActivities.length > 0 && (() => {
                const activity = customActivities.find((c) => c.id === customId);
                if (!activity) return null;
                const skillHint = <div className="rlxp-hint">Counts toward {activity.skill}.</div>;
                if (activity.mode === "perRep")
                  return (
                    <>
                      <div className="rlxp-field-row">
                        <label className="rlxp-field"><span>{capitalise(activity.unit || "reps")}</span><input type="number" inputMode="numeric" value={customReps} onChange={(e) => setCustomReps(e.target.value)} /></label>
                        <label className="rlxp-field"><span>Sets</span><input type="number" inputMode="numeric" value={customSets} onChange={(e) => setCustomSets(e.target.value)} /></label>
                      </div>
                      {skillHint}
                    </>
                  );
                if (activity.mode === "perMinute")
                  return (
                    <>
                      <label className="rlxp-field"><span>Minutes</span><input type="number" inputMode="decimal" value={customMinutes} onChange={(e) => setCustomMinutes(e.target.value)} /></label>
                      {skillHint}
                    </>
                  );
                if (activity.mode === "perSession")
                  return (
                    <>
                      <div className="rlxp-hint">Logs {fmt(activity.value)} XP for this session.</div>
                      {skillHint}
                    </>
                  );
                if (activity.mode === "weighted")
                  return (
                    <>
                      <div className="rlxp-field-row">
                        <label className="rlxp-field"><span>Weight (kg)</span><input type="number" inputMode="decimal" value={customWeight} onChange={(e) => setCustomWeight(e.target.value)} /></label>
                        <label className="rlxp-field"><span>{capitalise(activity.unit || "reps")}</span><input type="number" inputMode="numeric" value={customReps} onChange={(e) => setCustomReps(e.target.value)} /></label>
                        <label className="rlxp-field"><span>Sets</span><input type="number" inputMode="numeric" value={customSets} onChange={(e) => setCustomSets(e.target.value)} /></label>
                      </div>
                      {skillHint}
                    </>
                  );
                return null;
              })()}
            </>
          )}
        </div>

        <div className="rlxp-modal-footer">
          <div className="rlxp-preview-xp">
            +{fmt(preview)} XP
          </div>
          <button className="rlxp-btn-primary rlxp-btn-log" onClick={handleSubmit} disabled={preview <= 0 && tab !== "steps"}>
            Log XP
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- History ---------------- */

function ActivityHistory({ history, todayDate, onDelete, onClose }) {
  /* Logged work is the one thing the app promises never to lose, so removing
     an entry asks first — a stray tap on a small icon shouldn't undo a
     session and silently claw back the XP. */
  const [confirmDelete, setConfirmDelete] = useState(null);
  const grouped = useMemo(() => {
    const map = {};
    [...history].reverse().forEach((h) => {
      map[h.date] = map[h.date] || [];
      map[h.date].push(h);
    });
    return Object.entries(map).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [history]);

  return (
    <div className="rlxp-modal-overlay" onClick={onClose}>
      <div className="rlxp-modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="rlxp-modal-header">
          <span>History</span>
          <button className="rlxp-modal-close" onClick={onClose}><Glyph name="cross" size={16} /></button>
        </div>
        <div className="rlxp-modal-body rlxp-history-body">
          {grouped.length === 0 && <div className="rlxp-hint">No activity logged yet.</div>}
          {grouped.map(([date, entries]) => (
            <div key={date} className="rlxp-history-day">
              <div className="rlxp-history-date">{formatDateNice(date)}</div>
              {entries.map((e) => (
                <div key={e.id} className="rlxp-history-row">
                  <div className="rlxp-history-main">
                    <div className="rlxp-history-type">{e.type}{e.skill ? ` · ${e.skill}` : ""}</div>
                    <div className="rlxp-history-details">{e.details}</div>
                  </div>
                  <div className={`rlxp-history-xp ${e.xp < 0 ? "rlxp-xp-negative" : ""}`}>
                    {e.xp < 0 ? "" : "+"}{fmt(e.xp)}
                  </div>
                  {date === todayDate && e.type !== "Decay" && e.type !== "Rest Token" && (
                    <div className="rlxp-history-actions">
                      <button onClick={() => setConfirmDelete(e)} aria-label="Delete entry"><Glyph name="trash" size={17} /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        {confirmDelete && (
          <div className="rlxp-confirm-layer" onClick={() => setConfirmDelete(null)}>
            <div className="rlxp-confirm-box" onClick={(ev) => ev.stopPropagation()}>
              <div className="rlxp-confirm-title">Remove this entry?</div>
              <div className="rlxp-confirm-detail">{confirmDelete.details}</div>
              <div className="rlxp-confirm-warn">
                {confirmDelete.xp > 0
                  ? `${fmt(confirmDelete.xp)} XP will be taken back off your total.`
                  : "Your total will be recalculated."}
              </div>
              <div className="rlxp-confirm-actions">
                <button className="rlxp-btn-secondary" onClick={() => setConfirmDelete(null)}>
                  Keep it
                </button>
                <button
                  className="rlxp-btn-danger"
                  onClick={() => {
                    onDelete(confirmDelete.id);
                    setConfirmDelete(null);
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Settings ---------------- */

function SettingsPanel({ settings, focus, onSetFocus, onChangeSettings, onExport, onImport, onReset, onCorrectXp, onClose }) {
  const [showReset, setShowReset] = useState(false);
  const [showCorrect, setShowCorrect] = useState(false);
  const [correctValue, setCorrectValue] = useState("");
  const fileRef = useRef(null);

  return (
    <div className="rlxp-modal-overlay" onClick={onClose}>
      <div className="rlxp-modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="rlxp-modal-header">
          <span>Settings</span>
          <button className="rlxp-modal-close" onClick={onClose}><Glyph name="cross" size={16} /></button>
        </div>
        <div className="rlxp-modal-body">
          <label className="rlxp-field">
            <span>Display name</span>
            <input
              value={settings.displayName}
              onChange={(e) => onChangeSettings({ ...settings, displayName: e.target.value })}
            />
          </label>

          <div className="rlxp-settings-divider" />
          <div className="rlxp-inventory-section-title">Training Focus</div>
          <div className="rlxp-hint">
            Pick the thing you want to do more of. You earn <strong>+50% XP</strong> on it, and
            you'll get the occasional word of encouragement. Change it whenever you like.
          </div>
          <div className="rlxp-focus-grid">
            {FOCUS_OPTIONS.map((f) => (
              <button
                key={f.key}
                className={`rlxp-focus-item ${focus === f.key ? "rlxp-focus-active" : ""}`}
                onClick={() => onSetFocus(focus === f.key ? null : f.key)}
              >
                <span className="rlxp-focus-label">{f.label}</span>
                <span className="rlxp-focus-blurb">{f.blurb}</span>
              </button>
            ))}
          </div>
          <div className="rlxp-settings-divider" />

          <label className="rlxp-toggle-row">
            <span>Sound effects</span>
            <input
              type="checkbox"
              checked={settings.soundOn}
              onChange={(e) => onChangeSettings({ ...settings, soundOn: e.target.checked })}
            />
          </label>
          {settings.soundOn && (
            <div className="rlxp-sound-preview">
              <span className="rlxp-sound-preview-label">Hear them</span>
              <div className="rlxp-sound-preview-row">
                {[
                  ["Log", "logged"],
                  ["Chest", "chestCreak"],
                  ["Rare drop", "loot_legendary"],
                  ["Boss hit", "bossHit"],
                  ["Level up", "levelup"],
                ].map(([label, cue]) => (
                  <button
                    key={cue}
                    type="button"
                    className="rlxp-sound-chip"
                    onClick={() => { Audio_.unlock(); Audio_.play(cue); }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="rlxp-toggle-row">
            <span>Reduced motion</span>
            <input
              type="checkbox"
              checked={settings.reducedMotion}
              onChange={(e) => onChangeSettings({ ...settings, reducedMotion: e.target.checked })}
            />
          </label>

          <label className="rlxp-toggle-row">
            <span>Easy mode (no decay)</span>
            <input
              type="checkbox"
              checked={!!settings.easyMode}
              onChange={(e) => onChangeSettings({ ...settings, easyMode: e.target.checked })}
            />
          </label>
          <div className="rlxp-hint">
            Easy mode removes the penalty for missing a day. You still earn XP, streaks and chests
            exactly as normal — you just never lose progress.
          </div>

          <div className="rlxp-settings-divider" />

          <button className="rlxp-btn-secondary rlxp-full" onClick={onExport}>
            Export data as JSON
          </button>
          <button className="rlxp-btn-secondary rlxp-full" onClick={() => fileRef.current?.click()}>
            Import data from JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImport(file);
              e.target.value = "";
            }}
          />

          <div className="rlxp-settings-divider" />

          {!showCorrect ? (
            <button className="rlxp-btn-secondary rlxp-full" onClick={() => setShowCorrect(true)}>
              Manually correct total XP
            </button>
          ) : (
            <div className="rlxp-new-custom">
              <div className="rlxp-hint rlxp-warning">
                This overwrites your total XP directly and may affect your level. Use with care.
              </div>
              <label className="rlxp-field">
                <span>New total XP</span>
                <input type="number" inputMode="numeric" value={correctValue} onChange={(e) => setCorrectValue(e.target.value)} />
              </label>
              <div className="rlxp-field-row">
                <button className="rlxp-btn-secondary" onClick={() => setShowCorrect(false)}>Cancel</button>
                <button
                  className="rlxp-btn-primary"
                  onClick={() => {
                    const v = parseFloat(correctValue);
                    if (!isNaN(v) && v >= 0) {
                      onCorrectXp(v);
                      setShowCorrect(false);
                    }
                  }}
                >
                  Confirm correction
                </button>
              </div>
            </div>
          )}

          <div className="rlxp-settings-divider" />

          {!showReset ? (
            <button className="rlxp-btn-danger rlxp-full" onClick={() => setShowReset(true)}>
              Reset all progress
            </button>
          ) : (
            <div className="rlxp-new-custom">
              <div className="rlxp-hint rlxp-warning">
                This permanently deletes your level, XP and history. This cannot be undone.
              </div>
              <div className="rlxp-field-row">
                <button className="rlxp-btn-secondary" onClick={() => setShowReset(false)}>Cancel</button>
                <button className="rlxp-btn-danger" onClick={onReset}>Yes, reset everything</button>
              </div>
            </div>
          )}

          <div className="rlxp-version">Version {APP_VERSION}</div>
        </div>
      </div>
    </div>
  );
}

/* =======================================================================
   Root App
   ======================================================================= */

function StorageWarningBanner() {
  return (
    <div className="rlxp-storage-warning">
      <div className="rlxp-storage-warning-title"><Glyph name="warning" size={17} /> Progress isn't being saved</div>
      <div className="rlxp-storage-warning-body">
        Your browser is blocking saved data on this page. This usually means Private
        Browsing is on, or Safari's "Block All Cookies" setting is on. Turn either off in
        Settings → Safari, then reopen the app. Anything logged right now will be lost when
        this tab closes.
      </div>
    </div>
  );
}

export default function RealLifeXP({ storageOk = true, user = null }) {
  const [state, setState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [showCharacter, setShowCharacter] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [levelUpInfo, setLevelUpInfo] = useState(null);
  const [showShop, setShowShop] = useState(false);
  const [openSheets, setOpenSheets] = useState(0);

  /* Keeps the page behind a sheet from drifting. overscroll-behavior handles
     most of it, but locking the body is what stops the background moving on
     older iOS, where you'd close a popup and find yourself somewhere else. */
  useEffect(() => {
    if (typeof document === "undefined") return;
    const el = document.body;
    if (openSheets > 0) {
      const prev = el.style.overflow;
      el.style.overflow = "hidden";
      return () => { el.style.overflow = prev; };
    }
    return undefined;
  }, [openSheets]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const count = () => setOpenSheets(document.querySelectorAll(".rlxp-modal-overlay").length);
    count();
    const mo = new MutationObserver(count);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
  const [splashDone, setSplashDone] = useState(false);
  const [clickMarkers, setClickMarkers] = useState([]);
  const [openingChest, setOpeningChest] = useState(null);
  const [questReward, setQuestReward] = useState(null);
  const [dailyTaskReward, setDailyTaskReward] = useState(null);
  const [bossReward, setBossReward] = useState(null);
  const [randomEvent, setRandomEvent] = useState(null);
  const [bossHit, setBossHit] = useState(null);
  const [coinFloaters, setCoinFloaters] = useState([]);
  /* The equipped flourish plays once on a log, then the hero settles back to
     idle. That moment is the whole reason to buy one. */
  const [heroAnim, setHeroAnim] = useState("idle");
  const [heroWeapon, setHeroWeapon] = useState(null);
  const [attacking, setAttacking] = useState(false);
  const [battleHit, setBattleHit] = useState(null);
  const pendingXpRef = useRef(null);
  const pendingBattleRef = useRef(false);
  const [barPulse, setBarPulse] = useState(false);

  /* The XP bar grows and a green number floats off it. Runs after the boss
     popup rather than behind it, so the reward is actually seen. */
  const showXpGain = useCallback((id, amount) => {
    setFloaters((f) => [...f, { id, amount }]);
    setBarPulse(true);
    setTimeout(() => setBarPulse(false), 900);
    setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 1800);
  }, []);
  const [encouragement, setEncouragement] = useState(null);
  const [floaters, setFloaters] = useState([]);
  const markerSeed = useRef(1);
  const openingChestRef = useRef(null);
  const questRewardRef = useRef(null);
  const dailyTaskRewardRef = useRef(null);
  const bossRewardRef = useRef(null);
  const randomEventRef = useRef(null);
  const bossHitRef = useRef(null);
  const coinRef = useRef(null);
  const encouragementRef = useRef(null);
  const floaterRef = useRef(null);
  const soundOnRef = useRef(true);

  useEffect(() => {
    openingChestRef.current = openingChest;
  }, [openingChest]);

  // A completed quest stashes its reward during the state update; show it once
  // the new state has actually committed.
  useEffect(() => {
    if (questRewardRef.current) {
      const reward = questRewardRef.current;
      questRewardRef.current = null;
      Audio_.play("questComplete");
      setQuestReward(reward);
    }
    if (coinRef.current) {
      const amount = coinRef.current;
      coinRef.current = null;
      const id = genId();
      Audio_.play("coins");
      setCoinFloaters((f) => [...f, { id, amount }]);
      setTimeout(() => setCoinFloaters((f) => f.filter((x) => x.id !== id)), 1900);
    }
    if (bossHitRef.current != null) {
      const amount = bossHitRef.current;
      bossHitRef.current = null;
      const id = genId();
      Audio_.play("bossHit");
      setBossHit({ id, amount });
      // the log sheet was covering the swing, so show it properly
      pendingBattleRef.current = true;
      setBattleHit({ id, amount });
      setTimeout(() => setBossHit((h) => (h && h.id === id ? null : h)), 1500);
    }
    if (randomEventRef.current) {
      const ev = randomEventRef.current;
      randomEventRef.current = null;
      Audio_.play("event");
      setRandomEvent(ev);
    }
    if (bossRewardRef.current) {
      const reward = bossRewardRef.current;
      bossRewardRef.current = null;
      Audio_.play("bossDefeat");
      setBossReward(reward);
    }
    if (dailyTaskRewardRef.current) {
      const reward = dailyTaskRewardRef.current;
      dailyTaskRewardRef.current = null;
      Audio_.play("taskComplete");
      setDailyTaskReward(reward);
    }
    if (encouragementRef.current) {
      const note = encouragementRef.current;
      encouragementRef.current = null;
      setEncouragement(note);
    }
    if (floaterRef.current != null) {
      const amount = floaterRef.current;
      floaterRef.current = null;
      const id = genId();
      Audio_.play("logged");
      /* If a boss fight is about to play, hold the XP celebration back — it
         was firing behind the popup where nobody could see it. */
      if (pendingBattleRef.current) {
        pendingXpRef.current = { id, amount };
      } else {
        showXpGain(id, amount);
      }
      const worn = (state.character && state.character.spriteId) || "human";
      // your turn: swing at the boss
      setAttacking(true);
      setTimeout(() => setAttacking(false), 1200);
      // a held weapon takes priority — that's the whole point of buying one
      if (state.equippedWeapon && WEAPONS[state.equippedWeapon]) {
        setHeroWeapon(state.equippedWeapon);
        setTimeout(() => setHeroWeapon(null), 1400);
      } else {
        const fl = state.equippedFlourish;
        if (fl && flourishUsable(fl, worn) && FLOURISHES[fl]) {
          setHeroAnim(FLOURISHES[fl].anim);
          setTimeout(() => setHeroAnim("idle"), 1400);
        }
      }
    }
  }, [state]);

  // Minimum splash duration, independent of data load speed
  useEffect(() => {
    const t = setTimeout(() => setSplashDone(true), 3400);
    return () => clearTimeout(t);
  }, []);

  const playClickTick = useCallback((soundOn) => {
    if (!soundOn) return;
    Audio_.play("tick");
  }, []);

  // OSRS-style click feedback: yellow click marker + tick sound everywhere,
  // haptic vibration specifically for button presses. Uses a native capture
  // listener so it still fires inside modals that stop event bubbling.
  useEffect(() => {
    function handlePointerDown(e) {
      const root = document.querySelector(".rlxp-root");
      if (!root || !root.contains(e.target)) return;
      const x = e.clientX ?? (e.touches && e.touches[0]?.clientX);
      const y = e.clientY ?? (e.touches && e.touches[0]?.clientY);
      if (x == null || y == null) return;
      const id = markerSeed.current++;
      setClickMarkers((prev) => [...prev, { id, x, y }]);
      setTimeout(() => {
        setClickMarkers((prev) => prev.filter((m) => m.id !== id));
      }, 500);

      const isButton = e.target.closest && e.target.closest("button, .rlxp-tab, .rlxp-cosmetic-item");
      if (isButton && navigator.vibrate) {
        navigator.vibrate(10);
      }
      // iOS only permits audio to start inside a real gesture
      Audio_.unlock();
      playClickTick(soundOnRef.current);
    }
    /* iOS Safari refuses to apply :active to anything except links unless the
       document carries a touch listener. Without this, every press state we
       just wrote would silently do nothing on an iPhone — the one device
       this app is actually used on. */
    const noop = () => {};
    document.addEventListener("touchstart", noop, { passive: true });
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("touchstart", noop);
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [playClickTick]);

  // Load + roll forward on mount
  useEffect(() => {
    (async () => {
      let loadedState = null;
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        if (res?.value) loadedState = JSON.parse(res.value);
      } catch (e) {
        loadedState = null;
      }
      const base = loadedState || defaultState();
      const rolled = processRollover(base);
      setState(rolled);
      setLoaded(true);
    })();
  }, []);

  // Re-check rollover whenever the tab/app becomes active again
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        setState((prev) => (prev ? processRollover(prev) : prev));
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Persist on every change (after initial load)
  useEffect(() => {
    if (!loaded || !state) return;
    soundOnRef.current = !!state.settings?.soundOn;
    Audio_.setEnabled(soundOnRef.current);
    (async () => {
      try {
        await window.storage.set(STORAGE_KEY, JSON.stringify(state), false);
      } catch (e) {
        /* best-effort */
      }
    })();
  }, [state, loaded]);

  const playLevelSound = useCallback(() => {
    Audio_.play("levelup");
  }, []);

  const currentLevel = useMemo(() => (state ? levelForXp(state.totalXp) : 1), [state]);
  const targetMet = state ? state.todayEarned >= state.todayTarget : false;
  const currentRisk = state
    ? state.settings.easyMode
      ? 0
      : computeDecay(state.todayTarget, state.todayEarned, state.totalXp, state.consecutiveFailures)
    : 0;

  const handleLogSubmit = useCallback(
    ({ type, details, xp, stepTotalForState, skill, bodyPart }) => {
      setState((prev) => {
        if (!prev) return prev;
        const oldLevel = levelForXp(prev.totalXp);
        const oldTotalXp = prev.totalXp;
        let next = { ...prev, history: [...prev.history], skills: { ...prev.skills } };

        if (type === "steps") {
          const idx = next.history.findIndex((h) => h.date === next.lastProcessedDate && h.type === "Steps");
          const delta = xp;
          next.totalXp = next.totalXp + delta;
          next.todayEarned = next.todayEarned + delta;
          next.todayStepXp = stepTotalForState ?? next.todayStepXp;
          next.skills["Agility"] = (next.skills["Agility"] || 0) + delta;
          if (idx >= 0) {
            const entry = { ...next.history[idx] };
            entry.details = details;
            entry.xp = entry.xp + delta;
            entry.totalAfter = next.totalXp;
            entry.skill = "Agility";
            next.history[idx] = entry;
          } else if (delta !== 0) {
            next.history.push({
              id: genId(),
              date: next.lastProcessedDate,
              type: "Steps",
              details,
              xp: delta,
              totalAfter: next.totalXp,
              skill: "Agility",
            });
          }
        } else {
          const entrySkill = type === "custom" ? skill : ACTIVITY_SKILL[type];
          const focus = next.focus;
          const focused = matchesFocus(focus, entrySkill, bodyPart);
          const bonus = focused ? Math.round(xp * FOCUS_BONUS) : 0;
          const totalXp = xp + bonus;
          floaterRef.current = totalXp;

          next.totalXp = next.totalXp + totalXp;
          next.todayEarned = next.todayEarned + totalXp;
          if (entrySkill) {
            next.skills[entrySkill] = (next.skills[entrySkill] || 0) + totalXp;
          }
          if (bodyPart) {
            next.bodyPartXp = { ...next.bodyPartXp, [bodyPart]: (next.bodyPartXp[bodyPart] || 0) + totalXp };
          }
          next.history.push({
            id: genId(),
            date: next.lastProcessedDate,
            type: ACTIVITY_TABS.find((t) => t.key === type)?.label || type,
            details: bonus > 0 ? `${details}  (+${fmt(bonus)} focus bonus)` : details,
            xp: totalXp,
            totalAfter: next.totalXp,
            skill: entrySkill || null,
            bodyPart: bodyPart || null,
          });

          // Encouragement: first focused log of the day, or a big focused session
          if (focused && next.lastEncouragementDate !== next.lastProcessedDate) {
            const priorFocused = next.history
              .slice(0, -1)
              .some((h) => h.date === next.lastProcessedDate && matchesFocus(focus, h.skill, h.bodyPart));
            const substantial = totalXp >= next.todayTarget * 2;
            if (!priorFocused || substantial) {
              next.lastEncouragementDate = next.lastProcessedDate;
              encouragementRef.current = { focus, message: pickEncouragement(focus) };
            }
          }
        }

        // Weekly boss — any XP earned this submission deals damage
        const earnedThisSubmit = next.totalXp - oldTotalXp;
        if (earnedThisSubmit > 0 && next.weeklyBoss && !next.weeklyBoss.defeated) {
          const dealt = Math.min(earnedThisSubmit, next.weeklyBoss.hp);
          const newHp = Math.max(0, next.weeklyBoss.hp - earnedThisSubmit);
          next.weeklyBoss = { ...next.weeklyBoss, hp: newHp };
          bossHitRef.current = dealt;
          if (newHp <= 0) {
            next.weeklyBoss.defeated = true;
            next.bossDefeatStreak = next.bossDefeatStreak + 1;
            const tier = chestTierForBossStreak(next.bossDefeatStreak);
            const bossCoins = coinsForBoss(next.bossDefeatStreak);
            next.coins = (next.coins || 0) + bossCoins;
            coinRef.current = (coinRef.current || 0) + bossCoins;
            const bonusXp = Math.max(20, Math.round((next.weeklyBoss.maxHp * 0.2) / 10) * 10);
            next.totalXp = next.totalXp + bonusXp;
            next.todayEarned = next.todayEarned + bonusXp;
            next.chests = [...next.chests, { id: genId(), tier, source: `${next.weeklyBoss.name} defeated` }];
            next.history.push({
              id: genId(),
              date: next.lastProcessedDate,
              type: "Boss",
              details: `${next.weeklyBoss.name} defeated!`,
              xp: bonusXp,
              totalAfter: next.totalXp,
            });
            bossRewardRef.current = {
              tier,
              title: `${next.weeklyBoss.name} defeated!`,
              loot: [{ kind: "xpCache", amount: bonusXp, isQuestReward: true }],
            };
          }
        }

        // Random event — at most one per day, only on a log that earned XP
        if (earnedThisSubmit > 0 && next.lastEventDate !== next.lastProcessedDate) {
          const ev = rollRandomEvent(next);
          if (ev) {
            next.lastEventDate = next.lastProcessedDate;
            let detail = ev.title;
            if (ev.kind === "xp") {
              next.totalXp = next.totalXp + ev.amount;
              next.todayEarned = next.todayEarned + ev.amount;
              detail = `${ev.title} +${fmt(ev.amount)} XP`;
            } else if (ev.kind === "restToken") {
              next.restTokens = next.restTokens + 1;
              detail = `${ev.title} +1 Rest Token`;
            } else if (ev.kind === "scroll") {
              next.questScrolls = [...next.questScrolls, { id: genId(), tier: "rare" }];
              detail = `${ev.title} +1 Quest Scroll`;
            } else if (ev.kind === "chest") {
              next.chests = [...next.chests, { id: genId(), tier: "rare", source: "A hooded stranger" }];
              detail = `${ev.title} +1 Bronze-Bound Chest`;
            }
            next.history.push({
              id: genId(),
              date: next.lastProcessedDate,
              type: "Event",
              details: detail,
              xp: ev.kind === "xp" ? ev.amount : 0,
              totalAfter: next.totalXp,
            });
            randomEventRef.current = ev;
          }
        }

        // Quest completion — checked against today's entries after this log
        if (next.activeQuest) {
          const prog = questProgress(next.activeQuest, next);
          if (prog >= next.activeQuest.target) {
            const q = next.activeQuest;
            const qLoot = rollQuestLoot(q.tier, next.ownedCosmetics, next.todayTarget);
            next.ownedCosmetics = [...next.ownedCosmetics];
            let lootXp = 0;
            qLoot.forEach((entry) => {
              if (entry.kind === "cosmetic" && !next.ownedCosmetics.includes(entry.itemId)) {
                next.ownedCosmetics.push(entry.itemId);
              } else if (entry.kind === "restToken") {
                next.restTokens = next.restTokens + entry.amount;
              } else if (entry.kind === "xpCache") {
                lootXp += entry.amount;
              }
            });
            const totalQuestXp = q.reward + lootXp;
            next.totalXp = next.totalXp + totalQuestXp;
            next.todayEarned = next.todayEarned + totalQuestXp;
            next.history.push({
              id: genId(),
              date: next.lastProcessedDate,
              type: "Quest",
              details: `Quest complete — ${q.title}`,
              xp: totalQuestXp,
              totalAfter: next.totalXp,
            });
            next.activeQuest = null;
            const questCoins = coinsForQuest(q.tier);
            next.coins = (next.coins || 0) + questCoins;
            coinRef.current = (coinRef.current || 0) + questCoins;
            questRewardRef.current = {
              tier: q.tier,
              title: q.title,
              loot: [{ kind: "xpCache", amount: q.reward, isQuestReward: true }].concat(qLoot),
            };
          }
        }

        // Daily Task Board — grant the moment all three are complete, same day
        if (!next.dailyTasksBonusClaimed && next.dailyTasks && next.dailyTasks.length > 0) {
          const allDone = next.dailyTasks.every((t) => dailyTaskProgress(t, next).done);
          if (allDone) {
            next.dailyTasksBonusClaimed = true;
            const taskCoins = coinsForDailyTasks(next.dailyTaskStreak);
            next.coins = (next.coins || 0) + taskCoins;
            coinRef.current = (coinRef.current || 0) + taskCoins;
            const bonusXp = Math.max(10, Math.round((next.todayTarget * 0.3) / 10) * 10);
            const tier = chestTierForStreak(next.dailyTaskStreak + 1);
            next.totalXp = next.totalXp + bonusXp;
            next.todayEarned = next.todayEarned + bonusXp;
            next.chests = [...next.chests, { id: genId(), tier, source: "Daily tasks complete" }];
            next.history.push({
              id: genId(),
              date: next.lastProcessedDate,
              type: "Daily Tasks",
              details: "All three daily tasks complete",
              xp: bonusXp,
              totalAfter: next.totalXp,
            });
            dailyTaskRewardRef.current = {
              tier,
              title: "All three daily tasks complete",
              loot: [{ kind: "xpCache", amount: bonusXp, isQuestReward: true }],
            };
          }
        }

        const newLevel = levelForXp(next.totalXp);

        // Milestone chest every 10 character levels
        const milestone = Math.floor(newLevel / 10) * 10;
        if (milestone >= 10 && milestone > (next.levelChestsClaimedThrough || 0)) {
          next.chests = [...next.chests];
          for (let m = (next.levelChestsClaimedThrough || 0) + 10; m <= milestone; m += 10) {
            const tier = chestTierForLevel(m);
            next.chests.push({ id: genId(), tier, source: `Level ${m} milestone` });
            next.history.push({
              id: genId(),
              date: next.lastProcessedDate,
              type: "Chest",
              details: `${CHEST_LABEL[tier]} earned — reached level ${m}`,
              xp: 0,
              totalAfter: next.totalXp,
            });
          }
          next.levelChestsClaimedThrough = milestone;
        }

        next.highestLevelEver = Math.max(next.highestLevelEver || 1, newLevel);

        if (newLevel > oldLevel) {
          const snapshot = next.skillsAtLastLevelUp || {};
          const topSkills = Object.keys(next.skills)
            .map((name) => ({
              name,
              xpGained: (next.skills[name] || 0) - (snapshot[name] || 0),
              level: levelForXp(next.skills[name] || 0),
            }))
            .filter((s) => s.xpGained > 0)
            .sort((a, b) => b.xpGained - a.xpGained)
            .slice(0, 3);
          next.skillsAtLastLevelUp = { ...next.skills };
          // pay for every level crossed, not just the last one
          let lvlCoins = 0;
          for (let L = oldLevel + 1; L <= newLevel; L++) lvlCoins += coinsForLevelUp(L);
          next.coins = (next.coins || 0) + lvlCoins;
          coinRef.current = (coinRef.current || 0) + lvlCoins;
          setLevelUpInfo({
            oldLevel,
            newLevel,
            gained: newLevel - oldLevel,
            oldTotalXp,
            newTotalXp: next.totalXp,
            topSkills,
          });
          setTimeout(playLevelSound, 0);
        }
        return next;
      });
      setShowLog(false);
    },
    [playLevelSound]
  );

  const handleSaveExercise = useCallback((name) => {
    setState((prev) => (prev ? { ...prev, savedExercises: [...new Set([...prev.savedExercises, name])] } : prev));
  }, []);

  const handleSaveCustom = useCallback((activity) => {
    setState((prev) => {
      if (!prev) return prev;
      const skills = { ...prev.skills };
      const skillsAtLastLevelUp = { ...prev.skillsAtLastLevelUp };
      if (!(activity.skill in skills)) {
        skills[activity.skill] = 0;
        skillsAtLastLevelUp[activity.skill] = 0;
      }
      return {
        ...prev,
        customActivities: [...prev.customActivities, activity],
        skills,
        skillsAtLastLevelUp,
      };
    });
  }, []);

  const recomputeToday = useCallback((s) => {
    const todaysEntries = s.history.filter((h) => h.date === s.lastProcessedDate);
    const sum = todaysEntries.reduce((acc, h) => acc + h.xp, 0);
    const totalXp = Math.max(0, s.dayStartTotalXp + sum);
    const stepsEntry = todaysEntries.find((h) => h.type === "Steps");
    return {
      ...s,
      totalXp,
      todayEarned: todaysEntries.filter((h) => h.type !== "Decay").reduce((a, h) => a + h.xp, 0),
      todayStepXp: stepsEntry ? stepsEntry.xp : 0,
    };
  }, []);

  const handleDeleteEntry = useCallback(
    (id) => {
      setState((prev) => {
        if (!prev) return prev;
        const entry = prev.history.find((h) => h.id === id);
        const skills = { ...prev.skills };
        const bodyPartXp = { ...prev.bodyPartXp };
        if (entry && entry.skill && entry.type !== "Decay") {
          skills[entry.skill] = Math.max(0, (skills[entry.skill] || 0) - entry.xp);
        }
        if (entry && entry.bodyPart && entry.type !== "Decay") {
          bodyPartXp[entry.bodyPart] = Math.max(0, (bodyPartXp[entry.bodyPart] || 0) - entry.xp);
        }
        const filtered = prev.history.filter((h) => h.id !== id);
        const next = recomputeToday({ ...prev, history: filtered, skills, bodyPartXp });
        return next;
      });
    },
    [recomputeToday]
  );

  const handleExport = useCallback(() => {
    if (!state) return;
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `real-life-xp-backup-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [state]);

  const handleImport = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        setState(processRollover(parsed));
      } catch (e) {
        /* ignore malformed file */
      }
    };
    reader.readAsText(file);
  }, []);

  const handleReset = useCallback(() => {
    setState(defaultState());
    setShowSettings(false);
  }, []);

  const handleCorrectXp = useCallback((value) => {
    setState((prev) => (prev ? { ...prev, totalXp: value } : prev));
  }, []);

  /* Accepts either the old (race, sex) pair from onboarding or a full
     character object from the hero picker, and merges rather than replaces —
     choosing a sprite must never wipe the rest of the character. */
  const handleChooseCharacter = useCallback((raceOrChar, sex) => {
    setState((prev) => {
      if (!prev) return prev;
      const patch =
        raceOrChar && typeof raceOrChar === "object"
          ? raceOrChar
          : { race: raceOrChar, sex };
      return { ...prev, character: { ...(prev.character || {}), ...patch } };
    });
  }, []);

  
  const handleSetFocus = useCallback((focus) => {
    setState((prev) => (prev ? { ...prev, focus } : prev));
  }, []);

  const handleSetExerciseBodyPart = useCallback((name, part) => {
    setState((prev) =>
      prev ? { ...prev, exerciseBodyParts: { ...prev.exerciseBodyParts, [name]: part } } : prev
    );
  }, []);

  /* Remembers the numbers used for each exercise so it can be repeated with
     one tap next time, which is how most gym logging actually works. */
  const handleBuyCharacter = useCallback((spriteId) => {
    setState((prev) => {
      if (!prev) return prev;
      const def = SPRITES[spriteId];
      if (!def || def.unlock.type !== "gold") return prev;
      const owned = prev.ownedCharacters || [];
      if (owned.includes(spriteId)) return prev;
      if ((prev.coins || 0) < def.unlock.cost) return prev;   // never go negative
      return {
        ...prev,
        coins: prev.coins - def.unlock.cost,
        ownedCharacters: [...owned, spriteId],
        // wearing it immediately is what you wanted when you bought it
        character: { ...(prev.character || {}), spriteId },
        history: [
          ...prev.history,
          {
            id: genId(),
            date: prev.lastProcessedDate,
            type: "Purchase",
            details: `Unlocked ${def.name} for ${fmt(def.unlock.cost)} gold`,
            xp: 0,
            totalAfter: prev.totalXp,
          },
        ],
      };
    });
    Audio_.play("coins");
  }, []);

  const handleBuyFlourish = useCallback((flourishId) => {
    setState((prev) => {
      if (!prev) return prev;
      const f = FLOURISHES[flourishId];
      if (!f) return prev;
      const owned = prev.ownedFlourishes || [];
      if (owned.includes(flourishId)) return prev;
      if ((prev.coins || 0) < f.cost) return prev;   // never go negative
      return {
        ...prev,
        coins: prev.coins - f.cost,
        ownedFlourishes: [...owned, flourishId],
        // equip it straight away if the current hero can perform it
        equippedFlourish: flourishUsable(flourishId, (prev.character || {}).spriteId || "human")
          ? flourishId
          : prev.equippedFlourish,
        history: [
          ...prev.history,
          {
            id: genId(),
            date: prev.lastProcessedDate,
            type: "Purchase",
            details: `Unlocked the ${f.name} flourish for ${fmt(f.cost)} gold`,
            xp: 0,
            totalAfter: prev.totalXp,
          },
        ],
      };
    });
    Audio_.play("coins");
  }, []);

  const handleEquipFlourish = useCallback((flourishId) => {
    setState((prev) => {
      if (!prev) return prev;
      if (!(prev.ownedFlourishes || []).includes(flourishId)) return prev;
      return { ...prev, equippedFlourish: flourishId };
    });
  }, []);

  const handleBuyWeapon = useCallback((weaponId) => {
    setState((prev) => {
      if (!prev) return prev;
      const w = WEAPONS[weaponId];
      if (!w) return prev;
      const owned = prev.ownedWeapons || [];
      if (owned.includes(weaponId)) return prev;
      if ((prev.coins || 0) < w.cost) return prev;   // never go negative
      return {
        ...prev,
        coins: prev.coins - w.cost,
        ownedWeapons: [...owned, weaponId],
        equippedWeapon: weaponId,   // you bought it to hold it
        history: [
          ...prev.history,
          {
            id: genId(),
            date: prev.lastProcessedDate,
            type: "Purchase",
            details: `Bought the ${w.name} for ${fmt(w.cost)} gold`,
            xp: 0,
            totalAfter: prev.totalXp,
          },
        ],
      };
    });
    Audio_.play("coins");
  }, []);

  const handleEquipWeapon = useCallback((weaponId) => {
    setState((prev) => {
      if (!prev) return prev;
      if (weaponId && !(prev.ownedWeapons || []).includes(weaponId)) return prev;
      return { ...prev, equippedWeapon: weaponId };
    });
  }, []);

  const handleBuyBackdrop = useCallback((backdropId) => {
    setState((prev) => {
      if (!prev) return prev;
      const bd = BACKDROPS[backdropId];
      if (!bd || !bd.cost) return prev;
      const owned = prev.ownedBackdrops || [];
      if (owned.includes(backdropId)) return prev;
      if ((prev.coins || 0) < bd.cost) return prev;   // never go negative
      return {
        ...prev,
        coins: prev.coins - bd.cost,
        ownedBackdrops: [...owned, backdropId],
        equippedBackdrop: backdropId,   // you bought it to look at it
        history: [
          ...prev.history,
          {
            id: genId(),
            date: prev.lastProcessedDate,
            type: "Purchase",
            details: `Unlocked ${bd.name} for ${fmt(bd.cost)} gold`,
            xp: 0,
            totalAfter: prev.totalXp,
          },
        ],
      };
    });
    Audio_.play("coins");
  }, []);

  const handleEquipBackdrop = useCallback((backdropId) => {
    setState((prev) => {
      if (!prev) return prev;
      if (!backdropOwned(backdropId, prev)) return prev;
      return { ...prev, equippedBackdrop: backdropId };
    });
  }, []);

  const handleBuyChest = useCallback((tier) => {
    setState((prev) => {
      if (!prev) return prev;
      const price = CHEST_PRICES[tier];
      if ((prev.coins || 0) < price) return prev;   // guard: never go negative
      return {
        ...prev,
        coins: prev.coins - price,
        chests: [...prev.chests, { id: genId(), tier, source: "Bought from the merchant" }],
        history: [
          ...prev.history,
          {
            id: genId(),
            date: prev.lastProcessedDate,
            type: "Purchase",
            details: `Bought a ${CHEST_LABEL[tier]} for ${fmt(price)} gold`,
            xp: 0,
            totalAfter: prev.totalXp,
          },
        ],
      };
    });
    Audio_.play("coins");
  }, []);

  const handleSavePreset = useCallback((name, preset) => {
    setState((prev) =>
      prev ? { ...prev, exercisePresets: { ...(prev.exercisePresets || {}), [name]: preset } } : prev
    );
  }, []);

  const handleChangeSettings = useCallback((settings) => {
    setState((prev) => (prev ? { ...prev, settings } : prev));
  }, []);

  const handleEquip = useCallback((category, itemId) => {
    setState((prev) => (prev ? { ...prev, equipped: { ...prev.equipped, [category]: itemId } } : prev));
  }, []);

  const handleUseRestToken = useCallback(() => {
    setState((prev) => (prev && prev.restTokens > 0 ? { ...prev, restTokenActiveToday: true } : prev));
  }, []);

  const handleCancelRestToken = useCallback(() => {
    setState((prev) => (prev ? { ...prev, restTokenActiveToday: false } : prev));
  }, []);

  const handleCompleteOnboarding = useCallback((chosenName, character) => {
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        onboarded: true,
        character: character || prev.character,
        settings: { ...prev.settings, displayName: chosenName },
        chests: [
          ...prev.chests,
          { id: genId(), tier: "common", source: "Welcome gift", starter: true },
        ],
        activeQuest: prev.activeQuest || starterQuest(),
      };
    });
  }, []);

  const handleOpenChest = useCallback(
    (chestId) => {
      if (!state) return;
      const chest = state.chests.find((c) => c.id === chestId);
      if (!chest) return;
      const loot = chest.gift
        ? [
            { kind: "restToken", amount: 2 },
            {
              kind: "gear",
              itemId: "gear-helmet-kittyears",
              label: "Kitty Kat Ears",
              slot: "helmet",
              tier: "epic",
            },
          ]
        : rollChestLoot(chest.tier, state.ownedCosmetics, state.todayTarget, !!chest.starter);
      setOpeningChest({ chest, loot });
    },
    [state]
  );

  const handleCollectLoot = useCallback(() => {
    setState((prev) => {
      if (!prev || !openingChestRef.current) return prev;
      const { chest, loot } = openingChestRef.current;
      const oldLevel = levelForXp(prev.totalXp);
      const chestCoins = COIN_PER_TIER[chest.tier] || 25;
      coinRef.current = (coinRef.current || 0) + chestCoins;
      let next = {
        ...prev,
        coins: (prev.coins || 0) + chestCoins,
        chests: prev.chests.filter((c) => c.id !== chest.id),
        ownedCosmetics: [...prev.ownedCosmetics],
        questScrolls: [...prev.questScrolls],
        history: [...prev.history],
      };
      let xpGained = 0;
      loot.forEach((entry) => {
        if (entry.kind === "cosmetic" && !next.ownedCosmetics.includes(entry.itemId)) {
          next.ownedCosmetics.push(entry.itemId);
        } else if (entry.kind === "restToken") {
          next.restTokens = next.restTokens + entry.amount;
        } else if (entry.kind === "questScroll") {
          next.questScrolls.push({ id: genId(), tier: entry.tier });
        } else if (entry.kind === "xpCache") {
          xpGained += entry.amount;
        }
      });
      if (xpGained > 0) {
        next.totalXp = next.totalXp + xpGained;
        next.todayEarned = next.todayEarned + xpGained;
        next.history.push({
          id: genId(),
          date: next.lastProcessedDate,
          type: "Chest",
          details: `${CHEST_LABEL[chest.tier]} — XP cache`,
          xp: xpGained,
          totalAfter: next.totalXp,
        });
        next.highestLevelEver = Math.max(next.highestLevelEver, levelForXp(next.totalXp));

        const newLevel = levelForXp(next.totalXp);
        if (newLevel > oldLevel) {
          const snapshot = next.skillsAtLastLevelUp || {};
          const topSkills = Object.keys(next.skills)
            .map((name) => ({
              name,
              xpGained: (next.skills[name] || 0) - (snapshot[name] || 0),
              level: levelForXp(next.skills[name] || 0),
            }))
            .filter((s) => s.xpGained > 0)
            .sort((a, b) => b.xpGained - a.xpGained)
            .slice(0, 3);
          next.skillsAtLastLevelUp = { ...next.skills };
          // pay for every level crossed, not just the last one
          let lvlCoins = 0;
          for (let L = oldLevel + 1; L <= newLevel; L++) lvlCoins += coinsForLevelUp(L);
          next.coins = (next.coins || 0) + lvlCoins;
          coinRef.current = (coinRef.current || 0) + lvlCoins;
          setLevelUpInfo({
            oldLevel,
            newLevel,
            gained: newLevel - oldLevel,
            oldTotalXp: prev.totalXp,
            newTotalXp: next.totalXp,
            topSkills,
          });
          setTimeout(playLevelSound, 0);
        }
      }
      return next;
    });
    setOpeningChest(null);
  }, [playLevelSound]);

  const handleStartQuest = useCallback((scrollId) => {
    setState((prev) => {
      if (!prev || prev.activeQuest) return prev;
      const scroll = prev.questScrolls.find((s) => s.id === scrollId);
      if (!scroll) return prev;
      return {
        ...prev,
        questScrolls: prev.questScrolls.filter((s) => s.id !== scrollId),
        activeQuest: generateQuest(scroll.tier, prev.todayTarget),
      };
    });
  }, []);

  const handleAbandonQuest = useCallback(() => {
    setState((prev) => (prev ? { ...prev, activeQuest: null } : prev));
  }, []);

  const styleTag = <style>{CSS}</style>;

  const showSplash = !splashDone;

  if (!loaded || !state) {
    return (
      <div className="rlxp-root rlxp-loading">
        {styleTag}
        <LoadingSplash />
      </div>
    );
  }

  const reducedMotion = state.settings.reducedMotion;
  const equipped = state.equipped || defaultEquipped();

  return (
    <div className={`rlxp-root ${reducedMotion ? "rlxp-reduced-motion" : ""}`}>
      {styleTag}

      {clickMarkers.map((m) => (
        <div key={m.id} className="rlxp-click-marker" style={{ left: m.x, top: m.y }} />
      ))}

      {showSplash && <LoadingSplash />}

      {!showSplash && !state.onboarded && (
        <OnboardingFlow onComplete={handleCompleteOnboarding} reducedMotion={state.settings.reducedMotion} />
      )}

      {!storageOk && <StorageWarningBanner />}

      <div className="rlxp-topbar">
        <IconButton label="Hero" onClick={() => setShowCharacter(true)}><Glyph name="helm" size={24} /></IconButton>
        <div className="rlxp-bag-wrap">
          <IconButton label="Bag" onClick={() => setShowInventory(true)}><Glyph name="bag" size={24} /></IconButton>
          {state.chests.length > 0 && (
            <span className="rlxp-bag-badge">{state.chests.length}</span>
          )}
        </div>
        <IconButton label="Shop" onClick={() => setShowShop(true)}><Glyph name="shop" size={24} /></IconButton>
        <IconButton label="History" onClick={() => setShowHistory(true)}><Glyph name="scroll" size={24} /></IconButton>
        <IconButton label="Settings" onClick={() => setShowSettings(true)}><Glyph name="gear" size={24} /></IconButton>
      </div>

      <Panel className={`rlxp-main-panel rlxp-border-${tierOfItemId(equipped.border)}`}>
        <div className="rlxp-hero-row">
          {state.character && (
            <button
              className="rlxp-hero-portrait"
              aria-label="Open character"
              onClick={() => setShowCharacter(true)}
            >
              {/* the scene lives inside the character's own box */}
              <Backdrop id={state.equippedBackdrop} className="rlxp-portrait-backdrop" />
              {heroWeapon ? (
                <WeaponSprite
                  weaponId={heroWeapon}
                  spriteId={state.character.spriteId || "human"}
                  scale={3}
                  reducedMotion={reducedMotion}
                />
              ) : (
                <Sprite
                  id={state.character.spriteId || "human"}
                  anim={heroAnim}
                  scale={3}
                  reducedMotion={reducedMotion}
                />
              )}
            </button>
          )}

          <button
            className="rlxp-purse"
            aria-label="Open merchant"
            onClick={() => setShowShop(true)}
          >
            <Glyph name="coins" size={16} />
            <span>{fmt(state.coins || 0)}</span>
          </button>

          <LevelDisplay
            level={currentLevel}
            displayName={state.settings.displayName}
            nameEffectTier={tierOfItemId(equipped.nameEffect)}
            levelStyleTier={tierOfItemId(equipped.levelStyle)}
          />
        </div>
        <div className={barPulse ? "rlxp-xpbar-gain" : ""}>
          <XPBar totalXp={state.totalXp} level={currentLevel} riskXp={currentRisk} frameTier={tierOfItemId(equipped.barFrame)} />
        </div>
        <div className="rlxp-floater-wrap" aria-hidden="true">
          {coinFloaters.map((f, i) => (
            <span key={f.id} className="rlxp-coin-floater" style={{ left: `${6 + (i % 3) * 52}px` }}>
              +{fmt(f.amount)} gold
            </span>
          ))}
          {floaters.map((f, i) => (
            <span key={f.id} className="rlxp-floater" style={{ right: `${6 + (i % 3) * 46}px` }}>
              +{fmt(f.amount)} XP
            </span>
          ))}
        </div>
        <DailyWarning
          earned={state.todayEarned}
          target={state.todayTarget}
          riskXp={currentRisk}
          targetMet={targetMet}
          tokenActive={state.restTokenActiveToday}
          easyMode={!!state.settings.easyMode}
          restTokens={state.restTokens || 0}
          onUseToken={handleUseRestToken}
        />
        <BossPanel boss={state.weeklyBoss} state={state} reducedMotion={reducedMotion} lastHit={bossHit} attacking={attacking} />
        <DailyTaskBoard state={state} />
        <ActiveQuest quest={state.activeQuest} progress={questProgress(state.activeQuest, state)} />
      </Panel>

      <div className="rlxp-action-bar">
        <button className="rlxp-log-btn" onClick={() => setShowLog(true)}>
          + Log Activity
        </button>
      </div>

      {showLog && (
        <ActivityLogModal
          onClose={() => setShowLog(false)}
          onSubmit={handleLogSubmit}
          savedExercises={state.savedExercises}
          customActivities={state.customActivities}
          skills={state.skills}
          focus={state.focus}
          exerciseBodyParts={state.exerciseBodyParts}
          onSetExerciseBodyPart={handleSetExerciseBodyPart}
          exercisePresets={state.exercisePresets || {}}
          onSavePreset={handleSavePreset}
          onSaveExercise={handleSaveExercise}
          onSaveCustom={handleSaveCustom}
          todayStepXp={state.todayStepXp}
        />
      )}

      {showHistory && (
        <ActivityHistory
          history={state.history}
          todayDate={state.lastProcessedDate}
          onDelete={handleDeleteEntry}
          onClose={() => setShowHistory(false)}
        />
      )}

      {showSettings && (
        <SettingsPanel
          settings={state.settings}
          focus={state.focus}
          onSetFocus={handleSetFocus}
          onChangeSettings={handleChangeSettings}
          onExport={handleExport}
          onImport={handleImport}
          onReset={handleReset}
          onCorrectXp={handleCorrectXp}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showSkills && <SkillsPanel skills={state.skills} onClose={() => setShowSkills(false)} />}

      {showCharacter && (
        <CharacterPanel
          state={state}
          onChooseCharacter={handleChooseCharacter}
          onBuyCharacter={handleBuyCharacter}
          onEquipFlourish={handleEquipFlourish}
          onEquipWeapon={handleEquipWeapon}
          onClose={() => setShowCharacter(false)}
        />
      )}

      {showInventory && (
        <InventoryPanel
          state={state}
          onUseToken={handleUseRestToken}
          onCancelToken={handleCancelRestToken}
          onEquip={handleEquip}
          onOpenChest={handleOpenChest}
          onStartQuest={handleStartQuest}
          onAbandonQuest={handleAbandonQuest}
          onClose={() => setShowInventory(false)}
        />
      )}

      {openingChest && (
        <ChestOpeningModal
          chest={openingChest.chest}
          loot={openingChest.loot}
          onCollect={handleCollectLoot}
          reducedMotion={reducedMotion}
        />
      )}

      {questReward && (
        <QuestRewardModal reward={questReward} onClose={() => setQuestReward(null)} />
      )}

      {dailyTaskReward && (
        <QuestRewardModal
          reward={dailyTaskReward}
          heading="Daily Tasks Complete"
          kicker={`${TIER_LABEL[dailyTaskReward.tier]} Reward`}
          onClose={() => setDailyTaskReward(null)}
        />
      )}

      {bossReward && (
        <QuestRewardModal
          reward={bossReward}
          heading="Boss Defeated"
          kicker={`${TIER_LABEL[bossReward.tier]} Spoils`}
          onClose={() => setBossReward(null)}
        />
      )}

      {randomEvent && (
        <RandomEventModal event={randomEvent} onClose={() => setRandomEvent(null)} />
      )}

      {battleHit && state.weeklyBoss && (
        <BattleModal
          boss={state.weeklyBoss}
          state={state}
          damage={battleHit.amount}
          reducedMotion={reducedMotion}
          onClose={() => {
            setBattleHit(null);
            pendingBattleRef.current = false;
            const pend = pendingXpRef.current;
            if (pend) {
              pendingXpRef.current = null;
              showXpGain(pend.id, pend.amount);
            }
          }}
        />
      )}

      {showShop && (
        <ChestShop
          state={state}
          coins={state.coins || 0}
          onBuy={handleBuyChest}
          onBuyCharacter={handleBuyCharacter}
          onBuyFlourish={handleBuyFlourish}
          onEquipFlourish={handleEquipFlourish}
          onWearCharacter={(cid) => handleChooseCharacter({ spriteId: cid })}
          onBuyWeapon={handleBuyWeapon}
          onEquipWeapon={handleEquipWeapon}
          onBuyBackdrop={handleBuyBackdrop}
          onEquipBackdrop={handleEquipBackdrop}
          onClose={() => setShowShop(false)}
        />
      )}

      {encouragement && (
        <EncouragementScroll note={encouragement} onClose={() => setEncouragement(null)} />
      )}

      <LevelUpCelebration info={levelUpInfo} onDone={() => setLevelUpInfo(null)} reducedMotion={reducedMotion} />
    </div>
  );
}

/* =======================================================================
   Styles
   ======================================================================= */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800&family=Spectral:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');

.rlxp-root {
  line-height: 1.45;
  /* Nothing should ever make the page slide sideways under the thumb. */
  overflow-x: clip;
  --bg-void: #0b0906;
  --panel: #1b160f;
  --panel-2: #221b12;
  --border: #4a3c22;
  --border-light: #786232;
  --gold: #d4af37;
  --gold-bright: #f2d780;
  --green: #4a8f3c;
  --green-bright: #7bc766;
  --red: #a5312b;
  --red-bright: #e2493f;
  --text: #f1e7cf;
  --text-muted: #c3b28c;
  --text-dim: #8d7f60;

  min-height: 100vh;
  width: 100%;
  background:
    radial-gradient(ellipse at top, #22190f 0%, var(--bg-void) 60%),
    var(--bg-void);
  color: var(--text);
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  display: flex;
  flex-direction: column;
  align-items: center;
  /* Recent iPhones have a notch at the top and a home-indicator bar at the
     bottom. Without these insets the top row sits under the notch and the Log
     button ends up beneath the home bar, where taps get swallowed. */
  padding:
    calc(14px + env(safe-area-inset-top)) 
    calc(12px + env(safe-area-inset-right))
    calc(96px + env(safe-area-inset-bottom))
    calc(12px + env(safe-area-inset-left));
  box-sizing: border-box;
}

.rlxp-loading { align-items: center; justify-content: center; }
.rlxp-loading-text { color: var(--text-muted); font-family: 'Spectral', Georgia, 'Times New Roman', serif; letter-spacing: 0.03em; }

.rlxp-topbar {
  width: 100%;
  max-width: 460px;
  display: flex;
  justify-content: space-between;
  gap: 4px;
  margin-bottom: 10px;
}

.rlxp-icon-btn {
  flex: 1 1 0;
  min-width: 0;
  background: linear-gradient(180deg, var(--panel-2), var(--panel));
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--gold);
  padding: 8px 1px 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(212,175,55,0.10), inset 0 0 10px rgba(0,0,0,0.5);
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease;
}
.rlxp-icon-btn-glyph {
  display: block;
  line-height: 0;
  filter: drop-shadow(0 1px 0 rgba(0,0,0,0.8));
}
.rlxp-icon-btn-label {
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-weight: 600;
  font-size: 12px;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  text-shadow: 0 1px 0 rgba(0,0,0,0.75);
  white-space: nowrap;
}
.rlxp-icon-btn:hover { border-color: var(--gold); }
.rlxp-icon-btn:active { transform: translateY(1px); }
.rlxp-icon-btn:focus-visible { outline: 2px solid var(--gold-bright); outline-offset: 2px; }
.rlxp-glyph { display: inline-block; vertical-align: -0.15em; }
/* pixel icons must never be smoothed or scaled by fractions */
.rlxp-icon {
  background-repeat: no-repeat;
  image-rendering: pixelated;
  vertical-align: -0.2em;
}

.rlxp-panel {
  background:
    linear-gradient(180deg, var(--panel-2), var(--panel));
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow:
    0 0 0 1px rgba(0,0,0,0.4),
    0 12px 30px rgba(0,0,0,0.55),
    inset 0 1px 0 rgba(255,255,255,0.04);
  position: relative;
}

.rlxp-main-panel {
  width: 100%;
  max-width: 460px;
  padding: 22px 20px 26px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.rlxp-main-panel::before {
  content: "";
  position: absolute;
  inset: 4px;
  border: 1px solid rgba(212,175,55,0.15);
  border-radius: 10px;
  pointer-events: none;
}

.rlxp-eyebrow {
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-weight: 600;
  font-size: 15.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
}






.rlxp-level-block { text-align: left; }
.rlxp-level-row { display: flex; align-items: baseline; gap: 10px; margin-top: 2px; }
.rlxp-level-label {
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-weight: 600;
  color: var(--text-muted);
  font-size: 14px;
  letter-spacing: 0.08em;
}
.rlxp-level-number {
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  font-weight: 800;
  font-size: 52px;
  line-height: 1;
  color: var(--gold);
  text-shadow: 0 0 18px rgba(212,175,55,0.45), 0 2px 0 rgba(0,0,0,0.6);
}
.rlxp-max-badge {
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-weight: 700;
  font-size: 12.5px;
  color: #0b0906;
  background: var(--gold);
  padding: 3px 8px;
  border-radius: 5px;
  letter-spacing: 0.05em;
  box-shadow: 0 0 10px rgba(242,215,128,0.5);
}

.rlxp-xpbar-wrap { display: flex; flex-direction: column; gap: 6px; }
.rlxp-xpbar-track {
  position: relative;
  width: 100%;
  height: 26px;
  background: #0e0b07;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  box-shadow: inset 0 2px 6px rgba(0,0,0,0.7);
}
.rlxp-xpbar-fill-green {
  position: absolute;
  top: 0; left: 0; bottom: 0;
  background: linear-gradient(180deg, var(--green-bright), var(--green));
  box-shadow: 0 0 10px rgba(123,199,102,0.45);
  /* slow enough to watch it climb, not so slow it feels sluggish */
  transition: width 0.8s cubic-bezier(0.2, 0.8, 0.3, 1), box-shadow 0.3s ease, filter 0.3s ease;
}
.rlxp-xpbar-fill-red {
  position: absolute;
  top: 0; bottom: 0;
  background: repeating-linear-gradient(135deg, var(--red-bright), var(--red-bright) 6px, var(--red) 6px, var(--red) 12px);
  box-shadow: 0 0 10px rgba(226,73,63,0.5);
  transition: width 0.4s ease, left 0.4s ease;
}
.rlxp-xpbar-sheen {
  position: absolute;
  top: 0; left: 0; right: 0; height: 45%;
  background: linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0));
  pointer-events: none;
}
.rlxp-xpbar-caption {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.rlxp-xpbar-next { color: var(--text-dim); }

.rlxp-daily { display: flex; flex-direction: column; gap: 6px; }
.rlxp-daily-row {
  display: flex;
  justify-content: space-between;
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-weight: 600;
  font-size: 12.5px;
  letter-spacing: 0.03em;
  color: var(--text-muted);
  text-transform: uppercase;
}
.rlxp-daily-track {
  height: 8px;
  background: #0e0b07;
  border: 1px solid var(--border);
  border-radius: 5px;
  overflow: hidden;
}
.rlxp-daily-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--green), var(--green-bright));
  transition: width 0.4s ease;
}

.rlxp-decay-box {
  border: 1px solid rgba(165,49,43,0.5);
  background: rgba(165,49,43,0.08);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 15.5px;
}
.rlxp-decay-line1 { color: var(--text-muted); }
.rlxp-decay-line2 { color: var(--red-bright); margin-top: 2px; }
.rlxp-decay-safe {
  border-color: rgba(123,199,102,0.4);
  background: rgba(74,143,60,0.08);
  color: var(--green-bright);
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
}
.rlxp-decay-check { font-weight: 700; }

.rlxp-log-btn {
  margin-top: 4px;
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-weight: 700;
  font-size: 17px;
  letter-spacing: 0.03em;
  color: #17130c;
  background: linear-gradient(180deg, var(--gold-bright), var(--gold));
  border: 1px solid #8a6d22;
  border-radius: 10px;
  padding: 13px;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(212,175,55,0.35), inset 0 1px 0 rgba(255,255,255,0.4);
  transition: transform 0.1s ease, box-shadow 0.15s ease;
}

/* ---- persistent action bar ----
   The main screen outgrew one phone screen, which left the single button
   people press every day sitting below the fold. It now stays put. */
.rlxp-action-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  display: flex;
  justify-content: center;
  padding:
    14px
    calc(12px + env(safe-area-inset-right))
    calc(12px + env(safe-area-inset-bottom))
    calc(12px + env(safe-area-inset-left));
  background: linear-gradient(180deg, rgba(11,9,6,0) 0%, rgba(11,9,6,0.88) 40%, rgba(11,9,6,0.98) 100%);
  pointer-events: none;
}
.rlxp-action-bar > .rlxp-log-btn {
  pointer-events: auto;
  width: 100%;
  max-width: 460px;
  margin-top: 0;
}
.rlxp-log-btn:hover { box-shadow: 0 4px 20px rgba(212,175,55,0.5), inset 0 1px 0 rgba(255,255,255,0.4); }
.rlxp-log-btn:active { transform: translateY(1px); }
.rlxp-log-btn:focus-visible { outline: 2px solid var(--gold-bright); outline-offset: 2px; }

/* Modal */
.rlxp-modal-overlay {
  position: fixed; inset: 0;
  background: rgba(5,4,2,0.74);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 50;
  padding: 0;
}
.rlxp-modal-sheet {
  position: relative;
  width: 100%;
  max-width: 460px;
  max-height: 86vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: linear-gradient(180deg, var(--panel-2), var(--panel));
  /* A full, lit border plus a deep shadow so it's unmistakably a window
     opening over the page rather than part of it. */
  border: 1px solid var(--border-light);
  border-bottom: none;
  border-radius: 16px 16px 0 0;
  box-shadow:
    0 -2px 0 rgba(212,175,55,0.22),
    0 -14px 50px rgba(0,0,0,0.8),
    inset 0 1px 0 rgba(255,232,180,0.10);
  padding: 0 16px calc(20px + env(safe-area-inset-bottom));
  box-sizing: border-box;
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
}
.rlxp-modal-header {
  /* Sticks to the top of the sheet. Previously it scrolled with the content,
     so the X wandered up the screen as you moved down the form. */
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex; justify-content: space-between; align-items: center;
  margin: 0 -16px 12px;
  padding: 14px 16px 12px;
  background: linear-gradient(180deg, var(--panel-2) 78%, rgba(34,27,18,0));
  border-bottom: 1px solid rgba(120,98,50,0.35);
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  color: var(--gold);
  font-size: 19px;
}
/* the little grab handle every sheet gets, so it reads as draggable/dismissable */
.rlxp-modal-header::before {
  content: "";
  position: absolute;
  top: 5px; left: 50%;
  transform: translateX(-50%);
  width: 38px; height: 4px;
  border-radius: 2px;
  background: rgba(212,175,55,0.30);
}
.rlxp-modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  margin: -8px -8px -8px 0;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  touch-action: manipulation;
}
.rlxp-modal-close:active { color: var(--gold); }
.rlxp-modal-body { display: flex; flex-direction: column; gap: 12px; }
.rlxp-history-body { gap: 16px; }

.rlxp-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}
.rlxp-tab {
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-weight: 600;
  font-size: 14px;
  background: #150f0a;
  border: 1px solid var(--border);
  color: var(--text-muted);
  /* 40px minimum: smaller than this and thumbs miss it mid-set */
  min-height: 40px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  touch-action: manipulation;
}
.rlxp-tab:active { border-color: var(--gold); }
.rlxp-tab-active {
  color: #17130c;
  background: linear-gradient(180deg, var(--gold-bright), var(--gold));
  border-color: #8a6d22;
}

.rlxp-field { display: flex; flex-direction: column; gap: 4px; font-size: 14px; font-weight: 600; color: var(--text-muted); flex: 1; }
.rlxp-field input, .rlxp-field select {
  box-sizing: border-box;
  min-height: 52px;
  /* Must stay >= 16px or Safari zooms the whole page on focus. */
  background: #100c07;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 14px 12px;
  color: var(--text);
  font-size: 16px;
  font-weight: 400;
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
}
.rlxp-field input:focus-visible, .rlxp-field select:focus-visible {
  outline: 2px solid var(--gold-bright);
  outline-offset: 1px;
}
.rlxp-field-row { display: flex; gap: 8px; }
.rlxp-checkbox-field { display: flex; align-items: center; gap: 8px; font-size: 15.5px; color: var(--text-muted); }
.rlxp-toggle-row { display: flex; align-items: center; justify-content: space-between; font-size: 15.5px; padding: 4px 0; }
.rlxp-hint { font-size: 12.5px; color: var(--text-dim); line-height: 1.4; }
.rlxp-warning { color: var(--red-bright); }

.rlxp-subtabs { display: flex; gap: 6px; margin-bottom: 4px; }
.rlxp-subtabs button {
  flex: 1;
  background: #150f0a;
  border: 1px solid var(--border);
  color: var(--text-muted);
  padding: 7px;
  border-radius: 6px;
  font-size: 12.5px;
  font-weight: 600;
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  cursor: pointer;
}
.rlxp-subtab-active { color: var(--gold) !important; border-color: var(--gold) !important; }

.rlxp-link-btn {
  background: none;
  border: none;
  color: var(--gold);
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-weight: 600;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  padding: 4px 0;
}
.rlxp-new-custom {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: rgba(0,0,0,0.15);
}

.rlxp-modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.rlxp-preview-xp {
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  color: var(--green-bright);
  font-size: 19px;
}
.rlxp-btn-primary, .rlxp-btn-secondary, .rlxp-btn-danger {
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-weight: 700;
  border-radius: 8px;
  padding: 10px 16px;
  cursor: pointer;
  font-size: 14px;
  border: 1px solid var(--border);
}
.rlxp-btn-primary {
  background: linear-gradient(180deg, var(--gold-bright), var(--gold));
  color: #17130c;
  border-color: #8a6d22;
}
.rlxp-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
.rlxp-btn-secondary { background: #150f0a; color: var(--text); }
.rlxp-btn-danger { background: rgba(165,49,43,0.15); color: var(--red-bright); border-color: rgba(165,49,43,0.6); }
.rlxp-full { width: 100%; }
.rlxp-btn-log { flex-shrink: 0; }

.rlxp-settings-divider { height: 1px; background: var(--border); margin: 6px 0; }

/* History */
.rlxp-history-day { display: flex; flex-direction: column; gap: 6px; }
.rlxp-history-date {
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  color: var(--gold);
  font-size: 12.5px;
  letter-spacing: 0.03em;
  border-bottom: 1px solid var(--border);
  padding-bottom: 4px;
}
.rlxp-history-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px dashed rgba(255,255,255,0.05);
}
.rlxp-history-main { flex: 1; min-width: 0; }
.rlxp-history-type { font-size: 12.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-dim); }
.rlxp-history-details { font-size: 15.5px; color: var(--text); overflow-wrap: anywhere; }
.rlxp-history-xp { font-family: 'Cinzel', Georgia, 'Times New Roman', serif; font-size: 15.5px; color: var(--green-bright); white-space: nowrap; }
.rlxp-xp-negative { color: var(--red-bright); }
.rlxp-history-actions button {
  display: flex;
  align-items: center;
  justify-content: center;
  /* was 29x21 — too small to hit, and it deletes a workout */
  width: 40px;
  height: 40px;
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  touch-action: manipulation;
}
.rlxp-history-actions button:active { color: var(--red-bright); }

/* Skills panel */
.rlxp-skill-row { display: flex; flex-direction: column; gap: 5px; padding: 8px 0; border-bottom: 1px dashed rgba(255,255,255,0.06); }
.rlxp-skill-header { display: flex; justify-content: space-between; align-items: baseline; }
.rlxp-skill-name { font-family: 'Cinzel', Georgia, 'Times New Roman', serif; color: var(--gold); font-size: 15.5px; }
.rlxp-skill-level { font-family: 'Spectral', Georgia, 'Times New Roman', serif; font-weight: 700; color: var(--text-muted); font-size: 14px; }
.rlxp-skill-track { height: 8px; background: #0e0b07; border: 1px solid var(--border); border-radius: 5px; overflow: hidden; }
.rlxp-skill-fill { height: 100%; background: linear-gradient(90deg, var(--green), var(--green-bright)); }
.rlxp-skill-xp { font-size: 12.5px; color: var(--text-dim); }

/* Level up celebration */
.rlxp-levelup-overlay {
  position: fixed; inset: 0;
  background: rgba(5,4,2,0.85);
  display: flex; align-items: center; justify-content: center;
  z-index: 100;
  padding: 20px;
}
.rlxp-levelup-card {
  width: 100%;
  max-width: 380px;
  text-align: center;
  padding: 28px 26px 24px;
  border: 2px solid var(--gold);
  border-radius: 14px;
  background: linear-gradient(180deg, var(--panel-2), var(--panel));
  box-shadow: 0 0 60px rgba(212,175,55,0.5);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rlxp-levelup-anim { animation: rlxp-pop 0.35s ease; }
@keyframes rlxp-pop {
  0% { transform: scale(0.85); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
.rlxp-levelup-title {
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  font-weight: 800;
  font-size: 22px;
  letter-spacing: 0.1em;
  color: var(--gold-bright);
  text-shadow: 0 0 20px rgba(242,215,128,0.7);
}
.rlxp-levelup-level {
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  font-size: 42px;
  color: var(--gold);
  margin-top: 4px;
}
.rlxp-levelup-gain {
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-weight: 700;
  color: var(--green-bright);
  margin-top: 2px;
  font-size: 15.5px;
}
.rlxp-levelup-bar-track {
  position: relative;
  height: 18px;
  background: #0e0b07;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  margin-top: 16px;
  box-shadow: inset 0 2px 6px rgba(0,0,0,0.7);
}
.rlxp-levelup-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--green), var(--green-bright), var(--gold-bright));
  box-shadow: 0 0 12px rgba(123,199,102,0.55);
  transition: width 1.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.rlxp-levelup-tick {
  position: absolute;
  top: 0; bottom: 0;
  width: 2px;
  background: rgba(11,9,6,0.6);
}
.rlxp-levelup-bar-caption {
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-weight: 600;
  font-size: 12.5px;
  color: var(--text-dim);
  margin-top: 6px;
}
.rlxp-levelup-stats {
  margin-top: 16px;
  border-top: 1px solid var(--border);
  padding-top: 12px;
  text-align: left;
}
.rlxp-levelup-stats-title {
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-weight: 700;
  font-size: 12.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 7px;
}
.rlxp-levelup-stat-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 14px;
}
.rlxp-levelup-stat-name { font-family: 'Cinzel', Georgia, 'Times New Roman', serif; color: var(--gold); flex: 1; font-size: 14px; }
.rlxp-levelup-stat-level { color: var(--text-muted); font-weight: 600; font-size: 12.5px; }
.rlxp-levelup-stat-xp { color: var(--green-bright); font-weight: 600; white-space: nowrap; }
.rlxp-levelup-continue {
  margin-top: 18px;
  width: 100%;
}

/* ---------------- Click marker (OSRS-style) ---------------- */
.rlxp-click-marker {
  position: fixed;
  z-index: 200;
  width: 22px;
  height: 22px;
  margin-left: -11px;
  margin-top: -11px;
  pointer-events: none;
  border: 2px solid #f2d94e;
  border-top-color: transparent;
  border-radius: 50%;
  box-shadow: 0 0 6px rgba(242,217,78,0.8);
  animation: rlxp-click-spin 0.5s ease-out forwards;
}
@keyframes rlxp-click-spin {
  0% { transform: scale(0.4) rotate(0deg); opacity: 1; }
  100% { transform: scale(1.1) rotate(220deg); opacity: 0; }
}

/* ---------------- Intro splash ---------------- */
.rlxp-splash {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: radial-gradient(ellipse at center, #241a0f 0%, #0b0906 75%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  animation: rlxp-splash-fade 3.4s ease forwards;
}
@keyframes rlxp-splash-fade {
  0% { opacity: 1; }
  88% { opacity: 1; }
  100% { opacity: 0; visibility: hidden; }
}
.rlxp-splash-clash {
  position: relative;
  width: 180px;
  height: 90px;
  animation: rlxp-clash-shake 0.5s ease-out 1.15s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.rlxp-splash-sword {
  position: absolute;
  font-size: 42px;
  filter: drop-shadow(0 0 8px rgba(212,175,55,0.6));
  animation: rlxp-sword-in 1.25s cubic-bezier(0.5, 0, 0.3, 1) forwards;
}
.rlxp-splash-sword-left { left: 8px; transform-origin: center; }
.rlxp-splash-shield {
  position: absolute;
  right: 8px;
  font-size: 40px;
  filter: drop-shadow(0 0 8px rgba(120,150,200,0.5));
  animation: rlxp-shield-in 1.25s cubic-bezier(0.5, 0, 0.3, 1) forwards;
}
@keyframes rlxp-sword-in {
  0%   { transform: translateX(-120px) rotate(-70deg); opacity: 0; }
  35%  { opacity: 1; }
  72%  { transform: translateX(6px) rotate(6deg); opacity: 1; }
  84%  { transform: translateX(-4px) rotate(-3deg); }
  100% { transform: translateX(0) rotate(0deg); opacity: 1; }
}
@keyframes rlxp-shield-in {
  0%   { transform: translateX(120px) rotate(30deg); opacity: 0; }
  35%  { opacity: 1; }
  72%  { transform: translateX(-6px) rotate(-4deg); opacity: 1; }
  84%  { transform: translateX(4px) rotate(2deg); }
  100% { transform: translateX(0) rotate(0deg); opacity: 1; }
}
@keyframes rlxp-clash-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-6px); }
  40% { transform: translateX(5px); }
  60% { transform: translateX(-3px); }
  80% { transform: translateX(2px); }
}
.rlxp-splash-flash {
  position: absolute;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: radial-gradient(circle, #fff8dd 0%, #f2d780 40%, transparent 70%);
  animation: rlxp-flash-burst 0.85s ease-out 1.05s forwards;
  opacity: 0;
}
@keyframes rlxp-flash-burst {
  0% { transform: scale(0.2); opacity: 0; }
  30% { opacity: 1; }
  100% { transform: scale(9); opacity: 0; }
}
.rlxp-splash-title {
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  font-weight: 800;
  font-size: 26px;
  letter-spacing: 0.12em;
  color: var(--gold-bright);
  text-shadow: 0 0 20px rgba(242,215,128,0.7);
  opacity: 0;
  animation: rlxp-title-in 0.75s ease 1.5s forwards;
}
.rlxp-splash-subtitle {
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-weight: 500;
  font-style: italic;
  font-size: 14px;
  color: var(--text-dim);
  opacity: 0;
  animation: rlxp-title-in 0.75s ease 1.9s forwards;
}
@keyframes rlxp-title-in {
  0% { transform: translateY(8px); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}

/* ---------------- Rest token / inventory ---------------- */
.rlxp-decay-token {
  border-color: rgba(90,150,214,0.5);
  background: rgba(60,110,170,0.1);
  color: #8fb8e8;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
}
.rlxp-token-icon { font-size: 15.5px; }
.rlxp-inventory-section-title {
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  color: var(--gold);
  font-size: 15.5px;
  letter-spacing: 0.03em;
}
.rlxp-token-list { display: flex; flex-wrap: wrap; gap: 8px; }
.rlxp-token-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(60,110,170,0.12);
  border: 1px solid rgba(90,150,214,0.4);
  color: #a9c8ec;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 600;
}
.rlxp-token-active-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

/* Cosmetics grid */
.rlxp-cosmetic-category { display: flex; flex-direction: column; gap: 8px; }
.rlxp-cosmetic-category-label {
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-weight: 700;
  font-size: 12.5px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.rlxp-cosmetic-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.rlxp-cosmetic-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  padding: 9px 10px;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  background: #150f0a;
  border: 1.5px solid var(--border);
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
}
.rlxp-cosmetic-tier-tag {
  font-size: 12.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.rlxp-cosmetic-name { font-size: 14px; font-weight: 600; color: var(--text); }
.rlxp-cosmetic-lock-hint { font-size: 12.5px; color: var(--text-dim); line-height: 1.3; }
.rlxp-cosmetic-equipped-tag {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--green-bright);
  text-transform: uppercase;
}
.rlxp-cosmetic-locked { opacity: 0.45; cursor: not-allowed; }
.rlxp-cosmetic-equipped { box-shadow: 0 0 0 2px var(--gold-bright) inset; }

.rlxp-tier-common .rlxp-cosmetic-tier-tag { color: #9aa0a6; }
.rlxp-tier-rare { border-color: #8a5a2e !important; }
.rlxp-tier-rare .rlxp-cosmetic-tier-tag { color: #cd8f4e; }
.rlxp-tier-epic { border-color: #7a5cc9 !important; }
.rlxp-tier-epic .rlxp-cosmetic-tier-tag { color: #b79bf0; }
.rlxp-tier-legendary { border-color: #b8860b !important; }
.rlxp-tier-legendary .rlxp-cosmetic-tier-tag { color: var(--gold-bright); }
.rlxp-tier-mythic {
  border-color: #e0562b !important;
  background: linear-gradient(135deg, #1c0f08, #2a1006) !important;
}
.rlxp-tier-mythic .rlxp-cosmetic-tier-tag {
  background: linear-gradient(90deg, #ff7a3d, #ffd23d, #ff3d7a, #ff7a3d);
  background-size: 300% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: rlxp-prismatic-shift 3s linear infinite;
}

/* =======================================================================
   COSMETIC SETS — one material per rarity, applied consistently across
   the bar casing, panel trim, level numerals and nameplate.
   Progress colours are never themed: green = earned, red = at risk.
   ======================================================================= */

/* ---- shared material surfaces ---- */
@keyframes rlxp-sheen-sweep {
  0%   { background-position: -180% 0; }
  100% { background-position: 280% 0; }
}
@keyframes rlxp-flame-spin { to { transform: rotate(360deg); } }
@keyframes rlxp-ember-flicker {
  0%, 100% { opacity: 0.85; filter: brightness(1); }
  50%      { opacity: 1;    filter: brightness(1.35); }
}
@keyframes rlxp-dragon-bob {
  0%, 100% { transform: translateY(-50%) rotate(-6deg); }
  50%      { transform: translateY(-62%) rotate(4deg); }
}

/* ============ XP BAR CASING ============ */
.rlxp-xpbar-frame {
  position: relative;
  padding: 5px;
  border-radius: 10px;
  background: linear-gradient(180deg, #4a4a4a, #262626);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.18),
    inset 0 -2px 3px rgba(0,0,0,0.5),
    0 3px 8px rgba(0,0,0,0.5);
}
.rlxp-xpbar-frame .rlxp-xpbar-track {
  border: none;
  border-radius: 5px;
}

.rlxp-barframe-common {
  background: linear-gradient(180deg, #6e6e6e, #2f2f2f);
}
.rlxp-barframe-rare {
  background: linear-gradient(180deg, #d79a53, #6d4218);
  box-shadow:
    inset 0 1px 0 rgba(255,224,180,0.45),
    inset 0 -2px 3px rgba(0,0,0,0.55),
    0 3px 10px rgba(150,90,30,0.35);
}
.rlxp-barframe-epic {
  background: linear-gradient(180deg, #f2f4f8, #8e96a5);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.8),
    inset 0 -2px 3px rgba(0,0,0,0.4),
    0 3px 12px rgba(200,210,230,0.35);
}
.rlxp-barframe-epic::after {
  content: "";
  position: absolute; inset: 0;
  border-radius: 10px;
  pointer-events: none;
  background: linear-gradient(100deg, transparent 35%, rgba(255,255,255,0.75) 50%, transparent 65%);
  background-size: 220% 100%;
  animation: rlxp-sheen-sweep 4.5s linear infinite;
}
.rlxp-barframe-legendary {
  background: linear-gradient(180deg, #ffe9a3 0%, #d4af37 45%, #8a6a12 100%);
  box-shadow:
    inset 0 1px 0 rgba(255,248,214,0.9),
    inset 0 -2px 4px rgba(0,0,0,0.5),
    0 0 18px rgba(212,175,55,0.45);
}
.rlxp-barframe-legendary::after {
  content: "";
  position: absolute; inset: 0;
  border-radius: 10px;
  pointer-events: none;
  background: linear-gradient(100deg, transparent 38%, rgba(255,255,255,0.85) 50%, transparent 62%);
  background-size: 220% 100%;
  animation: rlxp-sheen-sweep 3.4s linear infinite;
}

/* Mythic: living flames circling the casing, with a dragon breathing them */
.rlxp-barframe-mythic {
  background: #1a0d05;
  overflow: visible;
  box-shadow:
    inset 0 1px 0 rgba(255,190,120,0.5),
    0 0 26px rgba(255,90,20,0.5);
}
.rlxp-bar-flames {
  position: absolute;
  inset: -3px;
  border-radius: 13px;
  pointer-events: none;
  background: conic-gradient(from 0deg,
    #ff2d00, #ff8c00, #ffd23d, #ff6a00, #ff1a3c, #ff8c00, #ffd23d, #ff2d00);
  animation: rlxp-flame-spin 2.6s linear infinite;
  filter: blur(2.5px) saturate(1.3);
  z-index: 0;
}
.rlxp-barframe-mythic .rlxp-xpbar-track {
  position: relative;
  z-index: 1;
  box-shadow: inset 0 2px 8px rgba(0,0,0,0.85);
}
.rlxp-bar-dragon {
  position: absolute;
  left: -20px;
  top: 50%;
  font-size: 26px;
  z-index: 2;
  pointer-events: none;
  filter: drop-shadow(0 0 8px rgba(255,120,20,0.9));
  animation: rlxp-dragon-bob 2.2s ease-in-out infinite, rlxp-ember-flicker 1.1s ease-in-out infinite;
}

/* ============ PANEL TRIM ============ */
.rlxp-border-common { border-color: #6e6e6e; }
.rlxp-border-rare {
  border-color: #b9793a;
  box-shadow: 0 0 0 1px rgba(185,121,58,0.35), 0 12px 30px rgba(0,0,0,0.55);
}
.rlxp-border-epic {
  border-color: #c3cad6;
  box-shadow: 0 0 0 1px rgba(195,202,214,0.4), 0 0 18px rgba(195,202,214,0.22), 0 12px 30px rgba(0,0,0,0.55);
}
.rlxp-border-legendary {
  border-color: var(--gold);
  box-shadow: 0 0 0 1px rgba(212,175,55,0.55), 0 0 26px rgba(212,175,55,0.4), 0 12px 30px rgba(0,0,0,0.55);
}
.rlxp-border-mythic {
  border-color: #ff5a1f;
  animation: rlxp-dragon-pulse 2.2s ease-in-out infinite;
}
@keyframes rlxp-dragon-pulse {
  0%, 100% { box-shadow: 0 0 0 1px rgba(255,90,31,0.6), 0 0 22px rgba(255,90,31,0.4), 0 12px 30px rgba(0,0,0,0.55); }
  50%      { box-shadow: 0 0 0 1px rgba(255,160,40,0.9), 0 0 44px rgba(255,120,20,0.7), 0 12px 30px rgba(0,0,0,0.55); }
}

/* ============ LEVEL NUMERALS ============ */
.rlxp-levelstyle-common {
  background: linear-gradient(180deg, #d7d7d7, #7d7d7d);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  text-shadow: none;
  filter: drop-shadow(0 2px 0 rgba(0,0,0,0.55));
}
.rlxp-levelstyle-rare {
  background: linear-gradient(180deg, #f0b775, #8a5423);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 2px 0 rgba(0,0,0,0.55));
}
.rlxp-levelstyle-epic {
  background: linear-gradient(180deg, #ffffff, #9aa3b2);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 0 12px rgba(195,202,214,0.5));
}
.rlxp-levelstyle-legendary {
  background: linear-gradient(180deg, #fff3c4 0%, #d4af37 55%, #8a6a12 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 0 16px rgba(212,175,55,0.6));
}
.rlxp-levelstyle-mythic {
  background: linear-gradient(180deg, #fff0a8 0%, #ff9a1f 40%, #ff2d00 75%, #7a0f00 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  animation: rlxp-ember-flicker 1.5s ease-in-out infinite;
  filter: drop-shadow(0 0 16px rgba(255,90,20,0.75));
}

/* ============ NAMEPLATE ============ */
.rlxp-eyebrow.rlxp-nameeffect-common { color: #9b9b9b; }
.rlxp-nameeffect-rare { color: #d79a53; }
.rlxp-nameeffect-epic {
  background: linear-gradient(90deg, #c3cad6, #ffffff, #c3cad6);
  background-size: 220% 100%;
  -webkit-background-clip: text; background-clip: text; color: transparent;
  animation: rlxp-sheen-sweep 4s linear infinite;
}
.rlxp-nameeffect-legendary {
  background: linear-gradient(90deg, #8a6a12, #fff3c4, #d4af37, #8a6a12);
  background-size: 220% 100%;
  -webkit-background-clip: text; background-clip: text; color: transparent;
  animation: rlxp-sheen-sweep 3.2s linear infinite;
}
.rlxp-nameeffect-mythic {
  background: linear-gradient(90deg, #ff2d00, #ffd23d, #ff8c00, #ff2d00);
  background-size: 260% 100%;
  -webkit-background-clip: text; background-clip: text; color: transparent;
  animation: rlxp-sheen-sweep 2.4s linear infinite, rlxp-ember-flicker 1.4s ease-in-out infinite;
}

/* ---- character panel ---- */
.rlxp-char-canvas {
  width: 100%;
  display: block;
}
.rlxp-char-stage {
  border: 1px solid var(--border);
  border-radius: 12px;
  background:
    radial-gradient(ellipse at 50% 30%, rgba(212,175,55,0.10), transparent 65%),
    linear-gradient(180deg, #17110a, #0e0b07);
  box-shadow: inset 0 2px 10px rgba(0,0,0,0.6);
  padding: 8px 0 4px;
  position: relative;
}
.rlxp-char-caption {
  text-align: center;
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-weight: 600;
  font-size: 12.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-dim);
  padding-bottom: 6px;
}
.rlxp-char-choice-row { display: flex; gap: 8px; }
.rlxp-char-choice {
  flex: 1;
  padding: 9px 6px;
  border-radius: 8px;
  cursor: pointer;
  background: #150f0a;
  border: 1.5px solid var(--border);
  color: var(--text-muted);
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-weight: 700;
  font-size: 14px;
}
.rlxp-char-choice-on {
  color: var(--gold);
  border-color: var(--gold);
  box-shadow: 0 0 0 1px var(--gold) inset, 0 0 12px rgba(212,175,55,0.3);
}
.rlxp-char-stats-grid { display: flex; gap: 12px; }
.rlxp-char-main-stats { flex: 1.6; display: flex; flex-direction: column; }
.rlxp-char-side-stats {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  justify-content: center;
}
.rlxp-char-side-stat {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: rgba(0,0,0,0.18);
}
.rlxp-char-side-level {
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  font-size: 19px;
  color: var(--gold);
  min-width: 24px;
}
.rlxp-char-side-label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.rlxp-onboard-char { width: 100%; }

/* ---- gear ---- */
.rlxp-gearslot { display: flex; flex-direction: column; gap: 6px; }
.rlxp-gear-chip-row { display: flex; flex-wrap: wrap; gap: 7px; }
.rlxp-gear-chip { flex: 0 1 auto; padding: 7px 11px; font-size: 12.5px; }
.rlxp-gear-locked { opacity: 0.45; cursor: not-allowed; }
.rlxp-gear-req { font-size: 12.5px; color: var(--red-bright); font-weight: 600; }

/* ---- focus picker ---- */
.rlxp-focus-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.rlxp-focus-item {
  display: flex; flex-direction: column; gap: 2px;
  padding: 9px 10px; border-radius: 8px; cursor: pointer; text-align: left;
  background: #150f0a; border: 1.5px solid var(--border);
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
}
.rlxp-focus-label { font-size: 14px; font-weight: 700; color: var(--text); }
.rlxp-focus-blurb { font-size: 12.5px; color: var(--text-dim); line-height: 1.3; }
.rlxp-focus-active {
  border-color: var(--gold);
  box-shadow: 0 0 0 1px var(--gold) inset, 0 0 14px rgba(212,175,55,0.3);
}
.rlxp-focus-active .rlxp-focus-label { color: var(--gold); }

/* ---- encouragement scroll ---- */
.rlxp-scroll-stage {
  width: 100%; max-width: 340px;
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  padding: 26px 24px 22px; border-radius: 14px; text-align: center;
  border: 2px solid #8a6d22;
  background: linear-gradient(180deg, #2a2114, #1a140c);
  box-shadow: 0 0 40px rgba(212,175,55,0.35);
}
.rlxp-scroll-visual { transition: transform 0.45s cubic-bezier(0.34,1.56,0.64,1); }
.rlxp-scroll-glyph { font-size: 52px; display: block; filter: drop-shadow(0 0 12px rgba(212,175,55,0.5)); }
.rlxp-scroll-open { transform: scale(1.15) rotate(-4deg); }
.rlxp-scroll-focus {
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-weight: 700; font-size: 12.5px; letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--text-dim);
}
.rlxp-scroll-message {
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-style: italic; font-size: 17px; line-height: 1.5; color: var(--gold-bright);
  animation: rlxp-loot-in 0.5s ease;
}

/* =======================================================================
   CHESTS, LOOT & INVENTORY GRID — the whole surface below had almost no
   styling before (bare buttons + emoji); this is the real design pass.
   ======================================================================= */

@keyframes rlxp-loot-in {
  0%   { opacity: 0; transform: translateY(8px); }
  100% { opacity: 1; transform: translateY(0); }
}

/* ---- chest tier glow (matches the chest MATERIAL naming) ---- */
.rlxp-tierglow-common  { border-color: #6e6e6e; box-shadow: 0 0 30px rgba(0,0,0,0.5); }
.rlxp-tierglow-rare {
  border-color: #b9793a;
  box-shadow: 0 0 0 1px rgba(185,121,58,0.3), 0 0 34px rgba(185,121,58,0.28);
}
.rlxp-tierglow-epic {
  border-color: #c3cad6;
  box-shadow: 0 0 0 1px rgba(195,202,214,0.35), 0 0 36px rgba(195,202,214,0.3);
}
.rlxp-tierglow-legendary {
  border-color: var(--gold);
  box-shadow: 0 0 0 1px rgba(212,175,55,0.5), 0 0 44px rgba(212,175,55,0.4);
}
.rlxp-tierglow-mythic {
  border-color: #ff5a1f;
  animation: rlxp-dragon-pulse 2.2s ease-in-out infinite;
}

/* ---- chest opening stage ---- */
.rlxp-chest-overlay { align-items: center; }
.rlxp-chest-stage {
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 24px 22px 22px;
  border: 2px solid var(--border);
  border-radius: 16px;
  background: linear-gradient(180deg, var(--panel-2), var(--panel));
  text-align: center;
  animation: rlxp-pop 0.3s ease;
}
.rlxp-chest-tier-label {
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-weight: 700;
  font-size: 12.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-dim);
}
.rlxp-chest-name {
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  font-size: 22px;
  color: var(--gold-bright);
  margin-bottom: 4px;
}
.rlxp-chest-visual {
  position: relative;
  width: 100%;
  height: 190px;
  padding: 0;
  border: none;
  background:
    radial-gradient(ellipse at 50% 62%, rgba(212,175,55,0.14), transparent 68%),
    linear-gradient(180deg, #17110a, #0d0a06);
  border-radius: 12px;
  box-shadow: inset 0 2px 12px rgba(0,0,0,0.6);
  cursor: pointer;
  overflow: hidden;
}
.rlxp-chest-idle { animation: rlxp-chest-idle-bob 2.6s ease-in-out infinite; }
@keyframes rlxp-chest-idle-bob {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-4px); }
}
.rlxp-chest-canvas { width: 100%; height: 100%; display: block; }
.rlxp-chest-flamering {
  position: absolute;
  inset: 10px;
  border-radius: 50%;
  pointer-events: none;
  background: conic-gradient(from 0deg, #ff2d00, #ff8c00, #ffd23d, #ff6a00, #ff1a3c, #ff8c00, #ffd23d, #ff2d00);
  filter: blur(20px) saturate(1.3);
  opacity: 0.35;
  animation: rlxp-flame-spin 3s linear infinite;
}
.rlxp-chest-flash {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 55%, rgba(255,244,214,0.95), rgba(255,210,120,0) 60%);
  opacity: 0;
  pointer-events: none;
}
.rlxp-chest-flash-on { animation: rlxp-chest-flash-pop 0.5s ease; }
@keyframes rlxp-chest-flash-pop {
  0%   { opacity: 0; }
  30%  { opacity: 1; }
  100% { opacity: 0; }
}
/* ---- random events ---- */
.rlxp-event-stage {
  width: min(340px, 88vw);
  padding: 26px 20px 20px;
  border: 1px solid var(--gold);
  border-radius: 14px;
  background:
    radial-gradient(ellipse at 50% 20%, rgba(212,175,55,0.18), transparent 65%),
    linear-gradient(180deg, #1a140c, #0d0a06);
  box-shadow: 0 12px 40px rgba(0,0,0,0.7), inset 0 0 30px rgba(212,175,55,0.08);
  text-align: center;
}
.rlxp-event-glyph {
  font-size: 58px;
  line-height: 1;
  opacity: 0;
  transform: scale(0.4) rotate(-12deg);
  transition: opacity 0.45s ease-out, transform 0.55s cubic-bezier(0.34,1.56,0.64,1);
}
.rlxp-event-glyph-in { opacity: 1; transform: scale(1) rotate(0deg); }
.rlxp-event-title {
  margin-top: 12px;
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  font-weight: 700;
  font-size: 19px;
  color: var(--gold);
}
.rlxp-event-line {
  margin-top: 6px;
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-size: 14px;
  font-style: italic;
  color: var(--text-muted);
}
.rlxp-event-reward {
  margin: 16px 0 14px;
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  font-weight: 700;
  font-size: 19px;
  color: var(--green-bright);
  text-shadow: 0 0 14px rgba(123,199,102,0.5);
  animation: rlxp-float-up-hold 0.5s ease-out;
}
@keyframes rlxp-float-up-hold {
  0% { opacity: 0; transform: translateY(10px); }
  100% { opacity: 1; transform: translateY(0); }
}

/* ---- engraved type ----
   Every heading and numeral sits in the stone rather than floating on it:
   a dark drop below plus a faint light catch above reads as carved, and the
   extra contrast is what actually makes small text legible on a phone in
   daylight. Applied by family so it reaches everything at once. */
.rlxp-root {
  text-shadow: 0 1px 0 rgba(0,0,0,0.55);
}
.rlxp-level-number,
.rlxp-splash-title,
.rlxp-boss-banner-text,
.rlxp-boss-name,
.rlxp-chest-name,
.rlxp-event-title,
.rlxp-modal-header > span,
.rlxp-quest-title,
.rlxp-taskboard-head > span:first-child {
  text-shadow:
    0 2px 0 rgba(0,0,0,0.9),
    0 -1px 0 rgba(255,232,180,0.18),
    0 0 18px rgba(212,175,55,0.20);
}
.rlxp-eyebrow,
.rlxp-task-title,
.rlxp-boss-days,
.rlxp-hint,
.rlxp-field > span,
.rlxp-daily-label,
.rlxp-decay-text {
  text-shadow: 0 1px 0 rgba(0,0,0,0.85);
}

/* ---- confirm dialog ---- */
.rlxp-confirm-layer {
  /* fixed, not absolute: an absolute layer inside a scrolling sheet lands
     wherever the scroll happens to be, which put it off-screen entirely. */
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(6,4,3,0.8);
  backdrop-filter: blur(2px);
  z-index: 60;
}
.rlxp-confirm-box {
  width: 100%;
  max-width: 310px;
  padding: 20px 18px 16px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: linear-gradient(180deg, var(--panel-2), var(--panel));
  box-shadow: 0 16px 44px rgba(0,0,0,0.75);
  text-align: center;
}
.rlxp-confirm-title {
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  font-weight: 700;
  font-size: 17px;
  color: var(--text);
}
.rlxp-confirm-detail {
  margin-top: 8px;
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-size: 14px;
  color: var(--text-muted);
  word-break: break-word;
}
.rlxp-confirm-warn {
  margin-top: 8px;
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-size: 12.5px;
  color: var(--red-bright);
}
.rlxp-confirm-actions {
  display: flex;
  gap: 9px;
  margin-top: 16px;
}
.rlxp-confirm-actions > button { flex: 1 1 0; }
.rlxp-btn-danger {
  padding: 11px 12px;
  border-radius: 9px;
  border: 1px solid #7a2a22;
  background: linear-gradient(180deg, #c0392b, #8e2419);
  color: #ffe9e4;
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
}
.rlxp-btn-danger:active { transform: translateY(1px); }

/* ---- gold ---- */
.rlxp-purse {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 5px;
  min-height: 38px;
  padding: 6px 12px;
  border: 1px solid rgba(212,175,55,0.45);
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(212,175,55,0.16), rgba(0,0,0,0.3));
  color: var(--gold-bright);
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  text-shadow: 0 1px 0 rgba(0,0,0,0.8);
}
.rlxp-purse:active { transform: translateY(1px); border-color: var(--gold); }

.rlxp-coin-floater {
  position: absolute;
  top: -4px;
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  font-weight: 700;
  font-size: 15.5px;
  color: var(--gold-bright);
  text-shadow: 0 0 12px rgba(242,215,128,0.7), 0 1px 0 rgba(0,0,0,0.7);
  white-space: nowrap;
  pointer-events: none;
  animation: rlxp-float-up 1.8s ease-out forwards;
}

.rlxp-shop-purse {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin-bottom: 14px;
  padding: 12px;
  border: 1px solid rgba(212,175,55,0.4);
  border-radius: 10px;
  background: linear-gradient(180deg, rgba(212,175,55,0.14), rgba(0,0,0,0.28));
  color: var(--gold-bright);
}
.rlxp-shop-purse-amount {
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  font-weight: 800;
  font-size: 22px;
}
.rlxp-shop-purse-label {
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-size: 14px;
  color: var(--text-muted);
}
.rlxp-shop-blurb { margin-bottom: 14px; }
.rlxp-shop-grid { display: flex; flex-direction: column; gap: 9px; }
.rlxp-shop-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 11px;
  background: linear-gradient(180deg, var(--panel-2), var(--panel));
}
.rlxp-shop-locked { opacity: 0.55; }
.rlxp-shop-info { flex: 1; min-width: 0; }
.rlxp-shop-name {
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  font-weight: 700;
  font-size: 15.5px;
  color: var(--text);
}
.rlxp-shop-tier {
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-size: 12.5px;
  color: var(--text-dim);
}
.rlxp-shop-buy {
  flex: none;
  display: flex;
  align-items: center;
  gap: 5px;
  min-height: 44px;
  padding: 0 14px;
  border-radius: 9px;
  border: 1px solid #8a6d22;
  background: linear-gradient(180deg, var(--gold-bright), var(--gold));
  color: #241a06;
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  font-weight: 800;
  font-size: 15.5px;
  cursor: pointer;
  touch-action: manipulation;
}
.rlxp-shop-buy:active { transform: translateY(1px); }
.rlxp-shop-buy:disabled {
  background: linear-gradient(180deg, #3a3126, #2a2419);
  border-color: var(--border);
  color: var(--text-dim);
  cursor: default;
}
.rlxp-shop-confirm {
  margin-top: 14px;
  padding: 10px;
  text-align: center;
  border-radius: 9px;
  border: 1px solid rgba(123,199,102,0.45);
  background: rgba(123,199,102,0.12);
  color: var(--green-bright);
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-size: 14px;
}

/* ---- number fields ----
   Tall enough to hit without aiming, and large type so the value is readable
   at a glance mid-set. 16px minimum or Safari zooms the page on focus. */
.rlxp-stepper-row-group {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
}
.rlxp-numfield { flex: 1 1 0; min-width: 0; }
.rlxp-numfield-label {
  display: block;
  margin-bottom: 6px;
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-size: 14px;
  color: var(--text-muted);
  text-shadow: 0 1px 0 rgba(0,0,0,0.8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rlxp-numfield-input {
  width: 100%;
  box-sizing: border-box;
  height: 56px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #0e0b07;
  box-shadow: inset 0 2px 7px rgba(0,0,0,0.65);
  color: var(--text);
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  font-weight: 700;
  font-size: 22px;
  text-align: center;
  -moz-appearance: textfield;
}
.rlxp-numfield-input::-webkit-outer-spin-button,
.rlxp-numfield-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.rlxp-numfield-input:focus {
  outline: none;
  border-color: var(--gold);
  box-shadow: inset 0 2px 7px rgba(0,0,0,0.65), 0 0 0 3px rgba(212,175,55,0.18);
}

/* ---- one-tap repeat ---- */
.rlxp-recent { margin-bottom: 14px; }
.rlxp-recent-label {
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-size: 12.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-bottom: 7px;
}
.rlxp-recent-row {
  display: flex;
  gap: 7px;
  overflow-x: auto;
  padding-bottom: 3px;
  -webkit-overflow-scrolling: touch;
}
.rlxp-recent-chip {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  max-width: 165px;
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: linear-gradient(180deg, rgba(212,175,55,0.08), rgba(0,0,0,0.2));
  cursor: pointer;
  text-align: left;
}
.rlxp-recent-chip:active { border-color: var(--gold); transform: translateY(1px); }
.rlxp-recent-name {
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-size: 14px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.rlxp-recent-detail {
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  font-size: 12.5px;
  color: var(--gold);
}

/* ---- sound preview ---- */
.rlxp-sound-preview { margin: 2px 0 6px; }
.rlxp-sound-preview-label {
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-size: 12.5px;
  color: var(--text-dim);
}
.rlxp-sound-preview-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.rlxp-sound-chip {
  min-height: 40px;
  background: linear-gradient(180deg, var(--panel-2), var(--panel));
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-muted);
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-size: 12.5px;
  padding: 6px 11px;
  cursor: pointer;
}
.rlxp-sound-chip:active { transform: translateY(1px); border-color: var(--gold); }

/* ---- bag badge ---- */
.rlxp-bag-wrap { position: relative; flex: 1 1 0; min-width: 0; display: flex; }
.rlxp-bag-wrap .rlxp-icon-btn { flex: 1 1 auto; }
.rlxp-bag-badge {
  position: absolute;
  top: -4px;
  right: 0;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 10px;
  background: linear-gradient(180deg, #e0c356, #b8912b);
  border: 1px solid #6b551a;
  color: #241a06;
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  font-weight: 800;
  font-size: 12.5px;
  line-height: 18px;
  text-align: center;
  box-shadow: 0 2px 6px rgba(0,0,0,0.6);
  pointer-events: none;
}

.rlxp-chest-glyph-stage {
  transition: transform 0.35s cubic-bezier(0.34, 1.4, 0.64, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  height: 190px;
}

.rlxp-sprite-stack { position: relative; }

.rlxp-scene-preview {
  /* the hero stands on the floor of the scene, not floating in the middle */
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 10px;
}

/* ---- the daily warning ----
   Escalates through the day: quiet early, red and pulsing when the clock is
   nearly out. This is the honest core of the app, so it should feel like a
   real deadline — while keeping the way out visible at all times. */
.rlxp-warning {
  padding: 11px 13px 12px;
  border-radius: 11px;
  border: 1px solid var(--border);
  background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.25));
  transition: border-color 0.4s ease, background 0.4s ease, box-shadow 0.4s ease;
  margin-bottom: 12px;
}
.rlxp-warning-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}
.rlxp-warning-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.04em;
  color: var(--text);
  text-shadow: 0 1px 0 rgba(0,0,0,0.8);
}
.rlxp-warning-clock {
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  font-weight: 800;
  font-size: 16px;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.rlxp-warning-track {
  position: relative;
  height: 22px;
  border-radius: 6px;
  background: linear-gradient(180deg, #120c08, #080504);
  border: 1px solid rgba(0,0,0,0.7);
  box-shadow: inset 0 2px 6px rgba(0,0,0,0.85);
  overflow: hidden;
}
.rlxp-warning-fill {
  height: 100%;
  border-radius: 5px;
  transition: width 0.8s cubic-bezier(0.2,0.8,0.3,1), background 0.4s ease;
}
.rlxp-warning-amount {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  font-weight: 700;
  font-size: 12.5px;
  color: #fff0dc;
  text-shadow: 0 1px 2px rgba(0,0,0,0.95);
  pointer-events: none;
}
.rlxp-warning-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 9px;
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-size: 13px;
  color: var(--text-muted);
}
.rlxp-warning-penalty strong { color: var(--red-bright); }
.rlxp-warning-token {
  display: flex;
  align-items: center;
  gap: 5px;
  min-height: 34px;
  padding: 4px 11px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: linear-gradient(180deg, #241d13, #17130c);
  color: var(--text-muted);
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-size: 13px;
  cursor: pointer;
}

/* --- calm: the day is young --- */
.rlxp-warning-calm .rlxp-warning-fill { background: linear-gradient(180deg, #b8912b, #8a6d22); }

/* --- urgent: afternoon, still short --- */
.rlxp-warning-urgent {
  border-color: rgba(200,110,40,0.55);
  background: linear-gradient(180deg, rgba(200,110,40,0.10), rgba(0,0,0,0.28));
}
.rlxp-warning-urgent .rlxp-warning-fill { background: linear-gradient(180deg, #e07a3a, #a8501f); }
.rlxp-warning-urgent .rlxp-warning-clock { color: #f0a05a; }

/* --- critical: under two hours. This is the state that should get you off
       the sofa, so it pulses rather than sitting still. --- */
.rlxp-warning-critical {
  border-color: rgba(226,73,63,0.75);
  background: linear-gradient(180deg, rgba(190,40,30,0.18), rgba(0,0,0,0.3));
  animation: rlxp-warn-pulse 2s ease-in-out infinite;
}
.rlxp-warning-critical .rlxp-warning-fill { background: linear-gradient(180deg, #e2493f, #8e2419); }
.rlxp-warning-critical .rlxp-warning-clock {
  color: #ff8a7a;
  text-shadow: 0 0 12px rgba(255,90,70,0.6);
}
.rlxp-warning-critical .rlxp-warning-title { color: #ffb9ac; }
@keyframes rlxp-warn-pulse {
  0%, 100% { box-shadow: 0 0 0 rgba(226,73,63,0); }
  50%      { box-shadow: 0 0 22px rgba(226,73,63,0.35); }
}

/* --- safe: done for the day, everything calms --- */
.rlxp-warning-safe {
  border-color: rgba(123,199,102,0.5);
  background: linear-gradient(180deg, rgba(123,199,102,0.10), rgba(0,0,0,0.22));
}
.rlxp-warning-safe .rlxp-warning-fill { background: linear-gradient(180deg, #7bc766, #4a8f3c); }
.rlxp-warning-safe .rlxp-warning-title { color: #b6e5a6; }

.rlxp-reduced-motion .rlxp-warning-critical { animation: none; }

/* ---- hero row ----
   The character sits in its own framed box beside the level, and the equipped
   scene fills that box — so the hero is standing somewhere, and it's obvious
   the box itself is a thing you can press. */
.rlxp-hero-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 6px;
}
.rlxp-hero-portrait {
  position: relative;
  flex: none;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  width: 92px;
  height: 108px;
  padding: 0 0 6px;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background-color: #0e0b07;
  box-shadow:
    inset 0 2px 10px rgba(0,0,0,0.7),
    0 0 0 1px rgba(212,175,55,0.12);
  overflow: hidden;
  cursor: pointer;
}
.rlxp-hero-portrait:active { transform: translateY(1px); filter: brightness(1.15); }
.rlxp-hero-portrait .rlxp-sprite,
.rlxp-hero-portrait .rlxp-sprite-stack { position: relative; z-index: 1; }

/* ---- backdrops ----
   The scene sits behind everything and is pinned to the bottom, so the floor
   always meets the bottom edge and a character standing on it reads as being
   in the room rather than floating over a picture. */
.rlxp-backdrop { position: relative; }
.rlxp-portrait-backdrop {
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: inherit;
}

.rlxp-hero-portrait .rlxp-sprite,
.rlxp-hero-portrait .rlxp-sprite-stack { position: relative; z-index: 1; }

/* ---- shop previews ----
   Everything animates in the shop before you buy it. You should be able to
   see exactly what you're spending gold on. */
.rlxp-shop-preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 10px;
}
.rlxp-preview-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 11px;
  background: linear-gradient(180deg, var(--panel-2), var(--panel));
  text-align: center;
}
.rlxp-preview-card-on {
  border-color: var(--gold);
  box-shadow: 0 0 0 1px rgba(212,175,55,0.3), inset 0 0 16px rgba(212,175,55,0.1);
}
.rlxp-preview-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 128px;
  border-radius: 9px;
  background-color: #070504;
  background-image:
    radial-gradient(ellipse at 50% 75%, rgba(212,175,55,0.10), transparent 65%);
  overflow: hidden;
}
/* a scene preview supplies its own image, so it must not keep the glow */
.rlxp-scene-preview { background-image: none; }

/* an effect sits ON the character, centred and overflowing outward */
.rlxp-effect-stack {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}
.rlxp-effect-stack .rlxp-effect {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.rlxp-preview-locked { filter: brightness(0.32) grayscale(0.7); }
.rlxp-preview-name {
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  font-weight: 700;
  font-size: 15.5px;
  color: var(--text);
}
.rlxp-preview-blurb {
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-size: 12.5px;
  font-style: italic;
  color: var(--text-dim);
  min-height: 34px;
  line-height: 1.35;
}
.rlxp-preview-note {
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-size: 12.5px;
  color: #d8a24a;
}
.rlxp-preview-btn {
  width: 100%;
  min-height: 40px;
  margin-top: 4px;
  border-radius: 9px;
  border: 1px solid var(--border);
  background: linear-gradient(180deg, #241d13, #17130c);
  color: var(--text-muted);
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-size: 14px;
  cursor: pointer;
}
.rlxp-preview-btn:disabled { opacity: 0.6; cursor: default; }
.rlxp-preview-buy {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border-color: #8a6d22;
  background: linear-gradient(180deg, var(--gold-bright), var(--gold));
  color: #241a06;
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  font-weight: 800;
}
.rlxp-preview-buy:disabled {
  background: linear-gradient(180deg, #3a3126, #2a2419);
  border-color: var(--border);
  color: var(--text-dim);
}

/* ---- hero roster ---- */
.rlxp-char-sprite-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px 0 6px;
}
.rlxp-hero-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
  margin-bottom: 6px;
}
.rlxp-hero-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 10px 10px;
  border: 1px solid var(--border);
  border-radius: 11px;
  background: linear-gradient(180deg, var(--panel-2), var(--panel));
  text-align: center;
}
.rlxp-hero-card-on {
  border-color: var(--gold);
  box-shadow: 0 0 0 1px rgba(212,175,55,0.35), inset 0 0 18px rgba(212,175,55,0.10);
}
/* Locked heroes are shown, not hidden — you can't want what you can't see. */
.rlxp-hero-card-locked .rlxp-hero-card-art { filter: brightness(0.32) grayscale(0.7); }
.rlxp-hero-card-art {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 96px;
}
.rlxp-hero-card-name {
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  font-weight: 700;
  font-size: 15.5px;
  color: var(--text);
}
.rlxp-hero-card-blurb {
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-size: 12.5px;
  font-style: italic;
  color: var(--text-dim);
  min-height: 34px;
}
.rlxp-hero-card-btn {
  width: 100%;
  min-height: 40px;
  margin-top: 4px;
  border-radius: 9px;
  border: 1px solid var(--border);
  background: linear-gradient(180deg, #241d13, #17130c);
  color: var(--text-muted);
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-size: 14px;
  cursor: pointer;
}
.rlxp-hero-card-btn:disabled { opacity: 0.65; cursor: default; }
.rlxp-hero-card-buy {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border-color: #8a6d22;
  background: linear-gradient(180deg, var(--gold-bright), var(--gold));
  color: #241a06;
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  font-weight: 800;
}
.rlxp-hero-card-buy:disabled {
  background: linear-gradient(180deg, #3a3126, #2a2419);
  border-color: var(--border);
  color: var(--text-dim);
}


/* ---- pixel sprites ----
   The art is 8x8-ish drawn inside a 32x32 frame, so it must never be
   smoothed or scaled by fractions or it turns to mush. */
.rlxp-sprite {
  background-repeat: no-repeat;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  -ms-interpolation-mode: nearest-neighbor;
}

.rlxp-hero-portrait .rlxp-sprite { margin: 0 auto; }

/* ---- xp gain ----
   The bar grows and glows, and the number floats off it. Deliberately after
   the boss popup, so the reward isn't happening behind something. */
.rlxp-xpbar-gain .rlxp-xpbar-fill-green {
  box-shadow:
    0 0 16px rgba(123,199,102,0.85),
    inset 0 1px 0 rgba(255,255,255,0.4);
  filter: brightness(1.25);
}
.rlxp-xpbar-gain { animation: rlxp-bar-swell 0.9s ease-out; }
@keyframes rlxp-bar-swell {
  0%   { transform: scaleY(1); }
  22%  { transform: scaleY(1.14); }
  100% { transform: scaleY(1); }
}

/* ---- battle popup ---- */
.rlxp-battle-overlay { align-items: center; }
.rlxp-battle-stage {
  width: min(400px, 92vw);
  padding: 18px 16px 14px;
  border: 1px solid rgba(212,175,55,0.55);
  border-radius: 14px;
  background:
    radial-gradient(ellipse at 50% 20%, rgba(190,60,35,0.20), transparent 65%),
    linear-gradient(180deg, #1b1009, #0b0705);
  box-shadow: 0 18px 50px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,170,120,0.12);
}
.rlxp-battle-title {
  text-align: center;
  margin-bottom: 10px;
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  font-weight: 700;
  font-size: 17px;
  color: var(--gold-bright);
  text-shadow: 0 2px 0 rgba(0,0,0,0.9), 0 0 16px rgba(242,215,128,0.35);
}
.rlxp-battle-big { height: 190px; }
.rlxp-battle-track { margin-top: 12px; }
.rlxp-battle-foot {
  margin-top: 9px;
  text-align: center;
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-size: 13px;
  color: var(--text-dim);
}

/* ---- the duel ----
   You on the left, it on the right. Logging a workout is your turn, and you
   see the hit land rather than just watching a number change. */
.rlxp-battle {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  height: 150px;
  padding: 0 6px;
  border-radius: 10px;
  background-color: #0b0705;
  overflow: hidden;
}
/* A vignette laid OVER the scene rather than replacing it. Using the
   background shorthand here silently wiped the backdrop image. */
.rlxp-battle::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(ellipse at 50% 95%, rgba(190,60,35,0.18), transparent 62%),
    linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0.10) 40%, rgba(0,0,0,0.30));
}
.rlxp-battle > * { position: relative; z-index: 1; }
.rlxp-battle-hero, .rlxp-battle-boss {
  flex: none;
  transition: transform 0.22s cubic-bezier(0.3, 1.4, 0.5, 1);
}
/* A slight lean toward each other reads as a stand-off while keeping both
   faces visible — the side-on art has no eyes to show. */
.rlxp-battle-hero { transform: rotate(2deg); }
.rlxp-battle-boss { transform: rotate(-2deg); }
.rlxp-battle-lunge { transform: translateX(18px) rotate(4deg) scale(1.04); }
.rlxp-battle-recoil { transform: translateX(10px) rotate(-7deg); filter: brightness(1.9) saturate(0.4); }
/* the lunge: step in on the swing, then back */
.rlxp-battle-lunge { transform: translateX(16px); }
.rlxp-battle-recoil { transform: translateX(9px); filter: brightness(1.9) saturate(0.4); }
.rlxp-battle-dead { opacity: 0.35; filter: grayscale(0.8); }

.rlxp-battle-gap {
  position: relative;
  flex: 1;
  align-self: stretch;
}
.rlxp-battle-hit {
  position: absolute;
  top: 26px;
  left: 50%;
  transform: translateX(-50%);
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  font-weight: 800;
  font-size: 26px;
  color: #ff6f5e;
  text-shadow: 0 0 16px rgba(255,90,70,0.8), 0 2px 0 rgba(0,0,0,0.9);
  pointer-events: none;
  white-space: nowrap;
  animation: rlxp-battle-hit-fly 1.3s ease-out forwards;
}
@keyframes rlxp-battle-hit-fly {
  0%   { opacity: 0; transform: translateX(-90%) translateY(10px) scale(0.7); }
  20%  { opacity: 1; transform: translateX(-60%) translateY(0) scale(1.15); }
  35%  { transform: translateX(-50%) scale(1); }
  100% { opacity: 0; transform: translateX(-10%) translateY(-28px) scale(0.95); }
}

/* ---- weekly boss panel ---- */
.rlxp-boss-panel {
  border: 1px solid rgba(190,70,45,0.45);
  border-radius: 12px;
  background:
    radial-gradient(ellipse at 50% 12%, rgba(190,60,35,0.16), transparent 62%),
    linear-gradient(180deg, #1b1009, #0d0806);
  box-shadow: inset 0 1px 0 rgba(255,140,100,0.10), inset 0 0 24px rgba(0,0,0,0.6);
  padding: 12px 12px 14px;
}
.rlxp-boss-defeated {
  border-color: rgba(123,199,102,0.45);
  background:
    radial-gradient(ellipse at 50% 12%, rgba(123,199,102,0.12), transparent 62%),
    linear-gradient(180deg, #101609, #080b06);
}
.rlxp-boss-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}
.rlxp-boss-banner-rule {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(212,175,55,0.55), transparent);
}
.rlxp-boss-banner-text {
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  font-weight: 800;
  font-size: 12.5px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--gold-bright);
  text-shadow: 0 1px 0 #000, 0 0 14px rgba(242,215,128,0.45);
  white-space: nowrap;
}

.rlxp-boss-canvas { width: 100%; display: block; }

@keyframes rlxp-boss-hit-rise {
  0%   { opacity: 0; transform: translateX(-50%) translateY(14px) scale(0.7); }
  18%  { opacity: 1; transform: translateX(-50%) translateY(0) scale(1.12); }
  30%  { transform: translateX(-50%) translateY(0) scale(1); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-34px) scale(0.95); }
}
.rlxp-boss-name {
  margin-top: 9px;
  text-align: center;
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  font-weight: 700;
  font-size: 17px;
  color: var(--text);
  text-shadow: 0 1px 0 rgba(0,0,0,0.9), 0 0 12px rgba(212,175,55,0.16);
}
.rlxp-boss-hpwrap { margin-top: 8px; }
.rlxp-boss-track {
  position: relative;
  height: 22px;
  border-radius: 6px;
  background: linear-gradient(180deg, #150d09, #0a0605);
  border: 1px solid rgba(0,0,0,0.7);
  box-shadow: inset 0 2px 6px rgba(0,0,0,0.85);
  overflow: hidden;
}
.rlxp-boss-fill {
  height: 100%;
  background: linear-gradient(180deg, #e05a45, #a52d1c);
  box-shadow: inset 0 1px 0 rgba(255,170,150,0.35);
  transition: width 0.6s cubic-bezier(0.2, 0.8, 0.3, 1);
}
.rlxp-boss-fill-dead { background: linear-gradient(180deg, #7bc766, #3f7a33); }
.rlxp-boss-hptext {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  font-weight: 700;
  font-size: 12.5px;
  letter-spacing: 0.06em;
  color: #fff0dc;
  text-shadow: 0 1px 2px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.8);
  pointer-events: none;
}
.rlxp-boss-days {
  margin-top: 7px;
  text-align: center;
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-size: 12.5px;
  color: var(--text-muted);
  text-shadow: 0 1px 0 rgba(0,0,0,0.7);
}

/* ---- active quest ---- */
.rlxp-quest-strip {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: linear-gradient(180deg, rgba(212,175,55,0.06), rgba(0,0,0,0.18));
  padding: 10px 12px;
}
.rlxp-quest-head {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 8px;
}
.rlxp-quest-icon { flex: none; color: var(--gold); line-height: 0; }
.rlxp-quest-title {
  flex: 1;
  min-width: 0;
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-size: 14px;
  color: var(--text);
}
.rlxp-quest-reward {
  flex: none;
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  font-weight: 700;
  font-size: 14px;
  color: var(--gold);
  white-space: nowrap;
}
.rlxp-quest-track {
  position: relative;
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(180deg, #150f0a, #0a0705);
  border: 1px solid rgba(0,0,0,0.6);
  box-shadow: inset 0 2px 5px rgba(0,0,0,0.8);
  overflow: hidden;
}
.rlxp-quest-fill {
  height: 100%;
  border-radius: 6px;
  background: linear-gradient(180deg, var(--gold-bright), var(--gold));
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.35);
  transition: width 0.7s cubic-bezier(0.2, 0.8, 0.3, 1);
}
.rlxp-quest-fill-done { background: linear-gradient(180deg, var(--green-bright), var(--green)); }
.rlxp-quest-progress {
  margin-top: 6px;
  text-align: right;
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-size: 12.5px;
  color: var(--text-dim);
}

/* ---- daily task board ---- */
.rlxp-taskboard {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: linear-gradient(180deg, rgba(212,175,55,0.05), rgba(0,0,0,0.15));
  padding: 10px 12px;
}
.rlxp-taskboard-done {
  border-color: rgba(123,199,102,0.5);
  background: linear-gradient(180deg, rgba(123,199,102,0.10), rgba(0,0,0,0.15));
}
.rlxp-taskboard-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-weight: 600;
  font-size: 12.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-bottom: 6px;
}
.rlxp-taskboard-streak {
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  font-size: 14px;
  color: var(--gold);
  text-transform: none;
  letter-spacing: 0;
}
.rlxp-taskboard-list { display: flex; flex-direction: column; gap: 5px; }
.rlxp-task-row {
  display: flex;
  align-items: center;
  gap: 9px;
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-size: 14px;
  color: var(--text-muted);
}
.rlxp-task-check {
  flex: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid var(--border);
  font-size: 12.5px;
  line-height: 14px;
  text-align: center;
  color: var(--green-bright);
}
.rlxp-task-done { color: var(--text); }
.rlxp-task-done .rlxp-task-check { border-color: rgba(123,199,102,0.6); background: rgba(123,199,102,0.15); }
.rlxp-task-done .rlxp-task-title { text-decoration: line-through; text-decoration-color: rgba(123,199,102,0.5); }
.rlxp-task-title { flex: 1; }
.rlxp-task-progress { font-size: 12.5px; color: var(--text-muted); }
.rlxp-taskboard-claimed {
  margin-top: 8px;
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-size: 14px;
  color: var(--green-bright);
  text-align: center;
}

.rlxp-chest-prompt {
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-size: 12.5px;
  color: var(--text-dim);
  margin-top: 2px;
}

/* ---- chest spark burst ---- */
.rlxp-chest-sparks { position: absolute; inset: 0; pointer-events: none; z-index: 3; }
.rlxp-spark {
  position: absolute;
  left: 50%;
  top: 55%;
  width: 6px;
  height: 6px;
  border-radius: 1px;
  background: linear-gradient(180deg, #fff3c4, #d4af37);
  box-shadow: 0 0 8px rgba(242,215,128,0.9);
  opacity: 0;
  animation: rlxp-spark-fly var(--t) ease-out forwards;
}
@keyframes rlxp-spark-fly {
  0%   { opacity: 1; transform: rotate(var(--a)) translateX(8px) scale(1); }
  100% { opacity: 0; transform: rotate(var(--a)) translateX(var(--d)) scale(0.35); }
}

/* ---- floating +XP numbers ---- */
.rlxp-floater-wrap { position: relative; height: 0; z-index: 5; }
.rlxp-floater {
  position: absolute;
  top: -4px;
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  font-weight: 700;
  font-size: 15.5px;
  color: var(--green-bright);
  text-shadow: 0 0 12px rgba(123,199,102,0.65), 0 1px 0 rgba(0,0,0,0.6);
  white-space: nowrap;
  pointer-events: none;
  animation: rlxp-float-up 1.6s ease-out forwards;
}
@keyframes rlxp-float-up {
  0%   { opacity: 0; transform: translateY(8px); }
  14%  { opacity: 1; }
  100% { opacity: 0; transform: translateY(-36px); }
}

/* ---- loot reveal ---- */
.rlxp-loot-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 8px 0 4px;
}
.rlxp-loot-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 9px;
  border: 1.5px solid var(--border);
  background: rgba(0,0,0,0.22);
  animation: rlxp-loot-in 0.4s ease both;
}
.rlxp-loot-icon {
  font-size: 19px;
  width: 26px;
  text-align: center;
  flex-shrink: 0;
}
.rlxp-loot-name {
  flex: 1;
  text-align: left;
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-weight: 600;
  font-size: 14px;
  color: var(--text);
}
.rlxp-loot-tier {
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-dim);
  flex-shrink: 0;
}

/* ---- inventory: chest & scroll grid ---- */
.rlxp-chest-grid, .rlxp-scroll-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 10px;
}
.rlxp-chest-slot, .rlxp-scroll-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 8px 10px;
  border-radius: 10px;
  border: 1.5px solid var(--border);
  background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(0,0,0,0.2));
  cursor: pointer;
  text-align: center;
}
.rlxp-chest-slot-icon { font-size: 26px; line-height: 1; }
.rlxp-chest-slot-source {
  font-size: 12.5px;
  color: var(--text-dim);
  line-height: 1.25;
}

/* ---- flat chest glyph (inventory list, onboarding) ---- */
.rlxp-chest-glyph-common { color: #8d8d8d; }
.rlxp-chest-glyph-rare { color: #cd8f4e; filter: drop-shadow(0 0 6px rgba(205,143,78,0.4)); }
.rlxp-chest-glyph-epic { color: #d7dce3; filter: drop-shadow(0 0 6px rgba(215,220,227,0.4)); }
.rlxp-chest-glyph-legendary { color: var(--gold-bright); filter: drop-shadow(0 0 8px rgba(212,175,55,0.5)); }
.rlxp-chest-glyph-mythic {
  color: #ff6a2b;
  filter: drop-shadow(0 0 10px rgba(255,90,31,0.6));
  animation: rlxp-ember-flicker 1.4s ease-in-out infinite;
}

.rlxp-reduced-motion * { transition: none !important; animation: none !important; }
.rlxp-reduced-motion .rlxp-loot-row { opacity: 1; }

.rlxp-storage-warning {
  width: 100%;
  max-width: 460px;
  margin-bottom: 8px;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(165,49,43,0.15);
  border: 1px solid rgba(226,73,63,0.6);
}
.rlxp-storage-warning-title {
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-weight: 700;
  color: var(--red-bright);
  font-size: 14px;
  margin-bottom: 4px;
}
.rlxp-storage-warning-body {
  font-size: 12.5px;
  line-height: 1.4;
  color: var(--text-muted);
}
.rlxp-version {
  text-align: center;
  font-size: 12.5px;
  color: var(--text-dim);
  margin-top: 4px;
  letter-spacing: 0.04em;
}

.rlxp-decay-easy {
  border-color: rgba(123,199,102,0.35);
  background: rgba(74,143,60,0.06);
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
}
.rlxp-quest-complete-sub {
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-size: 14px;
  color: var(--text-muted);
  margin-bottom: 2px;
}

/* ---------------- Onboarding ---------------- */
.rlxp-onboard-overlay {
  position: fixed;
  inset: 0;
  z-index: 250;
  background: radial-gradient(ellipse at top, #22190f 0%, #0b0906 70%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.rlxp-onboard-card {
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 28px 24px 22px;
  border-radius: 16px;
  border: 1px solid var(--border);
  background: linear-gradient(180deg, var(--panel-2), var(--panel));
  box-shadow: 0 0 50px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04);
  text-align: center;
  animation: rlxp-onboard-in 0.35s ease;
}
@keyframes rlxp-onboard-in {
  0% { transform: translateY(10px); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}
.rlxp-onboard-art {
  font-size: 46px;
  line-height: 1;
  margin-bottom: 2px;
  display: flex;
  justify-content: center;
  filter: drop-shadow(0 0 14px rgba(212,175,55,0.35));
}
.rlxp-onboard-title {
  font-family: 'Cinzel', Georgia, 'Times New Roman', serif;
  font-size: 22px;
  color: var(--gold);
  line-height: 1.2;
}
.rlxp-onboard-body {
  font-family: 'Spectral', Georgia, 'Times New Roman', serif;
  font-size: 15.5px;
  line-height: 1.55;
  color: var(--text-muted);
  margin-bottom: 4px;
}
.rlxp-onboard-dots { display: flex; gap: 6px; margin: 6px 0 10px; }
.rlxp-onboard-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--border);
}
.rlxp-onboard-dot-on { background: var(--gold); box-shadow: 0 0 8px rgba(212,175,55,0.7); }
.rlxp-onboard-skip { color: var(--text-dim); font-size: 12.5px; }
.rlxp-onboard-field { width: 100%; text-align: left; margin: 4px 0 8px; }
.rlxp-onboard-gift {
  font-size: 12.5px;
  color: var(--text-dim);
  margin-top: 10px;
}

@media (min-width: 480px) {
  .rlxp-modal-overlay { align-items: center; }
  .rlxp-modal-sheet { border-radius: 16px; border-bottom: 1px solid var(--border); }
}

/* =======================================================================
   PRESS FEEDBACK

   A button that doesn't visibly move when you tap it reads as broken, even
   when it worked. Every interactive thing now gives way under the thumb.

   Two behaviours, matched to how the element is drawn:
   - Raised buttons (the gold ones sitting on a hard bottom edge) press DOWN
     into that edge, like a real key travelling.
   - Flat things (chips, tiles, tabs, list rows) shrink slightly and brighten.

   The transition is deliberately asymmetric: instant down, eased back up.
   Snapping down feels responsive; springing back feels mechanical.
   ======================================================================= */
.rlxp-root button,
.rlxp-root .rlxp-cosmetic-item,
.rlxp-root .rlxp-chest-slot,
.rlxp-root .rlxp-scroll-slot,
.rlxp-root .rlxp-focus-item,
.rlxp-root .rlxp-gear-chip,
.rlxp-root .rlxp-gearslot,
.rlxp-root .rlxp-token-chip {
  transition:
    transform 0.16s cubic-bezier(0.2, 0.9, 0.3, 1.4),
    filter 0.16s ease,
    box-shadow 0.16s ease,
    border-color 0.16s ease;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

/* flat elements: give way and brighten */
.rlxp-root button:active,
.rlxp-root .rlxp-cosmetic-item:active,
.rlxp-root .rlxp-chest-slot:active,
.rlxp-root .rlxp-scroll-slot:active,
.rlxp-root .rlxp-focus-item:active,
.rlxp-root .rlxp-gear-chip:active,
.rlxp-root .rlxp-gearslot:active,
.rlxp-root .rlxp-token-chip:active {
  transform: scale(0.955);
  filter: brightness(1.18);
  transition-duration: 0.02s;
}

/* raised gold buttons: travel down into their own edge instead of shrinking,
   because scaling a full-width bar looks like a glitch rather than a press */
.rlxp-root .rlxp-log-btn:active,
.rlxp-root .rlxp-btn-primary:active,
.rlxp-root .rlxp-shop-buy:active,
.rlxp-root .rlxp-btn-danger:active,
.rlxp-root .rlxp-auth-primary:active {
  transform: translateY(3px) scale(0.995);
  filter: brightness(1.06);
  box-shadow: 0 0 0 rgba(0,0,0,0), inset 0 3px 8px rgba(0,0,0,0.35);
  transition-duration: 0.02s;
}

/* tabs and slot tiles also take a lit border, so the target is unmistakable */
.rlxp-root .rlxp-tab:active,
.rlxp-root .rlxp-chest-slot:active,
.rlxp-root .rlxp-cosmetic-item:active,
.rlxp-root .rlxp-recent-chip:active,
.rlxp-root .rlxp-sound-chip:active {
  border-color: var(--gold-bright);
}

/* disabled things must NOT pretend to respond */
.rlxp-root button:disabled:active {
  transform: none;
  filter: none;
  box-shadow: none;
}

/* honour the reduced-motion setting */
.rlxp-reduced-motion button:active,
.rlxp-reduced-motion .rlxp-cosmetic-item:active,
.rlxp-reduced-motion .rlxp-chest-slot:active {
  transform: none;
}

/* =======================================================================
   PIXEL FRAMES

   Real Minifantasy borders wrapped around the app's own panels.

   Each frame is a 3x3 set of 16px tiles. border-image keeps the four corners
   pixel-perfect and stretches only the middles, so one small PNG can frame a
   panel of any size — which is the whole reason the pack is sliced this way.

   Repeating the edge tiles rather than stretching them is what keeps the
   pixels crisp instead of smeared.
   ======================================================================= */
.rlxp-framed {
  border-style: solid;
  border-width: 16px;
  border-image-slice: 16 fill;
  border-image-repeat: repeat;
  image-rendering: pixelated;
  background: none;
  box-shadow: none;
}
.rlxp-frame-panel  { border-image-source: url(ui/frames/panel.png); }
.rlxp-frame-sheet  { border-image-source: url(ui/frames/sheet.png); }
.rlxp-frame-boss   { border-image-source: url(ui/frames/boss.png); }
.rlxp-frame-card   { border-image-source: url(ui/frames/card.png); }
.rlxp-frame-slot   { border-image-source: url(ui/frames/slot.png); }
.rlxp-frame-banner { border-image-source: url(ui/frames/banner.png); }

`;
