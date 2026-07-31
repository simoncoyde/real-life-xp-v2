# Real-Life XP — what we're building

> This is the north star. When a decision is unclear, it gets settled here.

---

## The idea in one line

**It's the game of life, and how you play it.**

You log the things you actually do. You earn XP. You level up. Skip a day and
you lose XP — because that's how real skill works.

---

## The thesis

Consistency compounds. Sporadic effort doesn't.

Someone who draws every day for ten years will be extraordinary. Someone who
draws the *same total amount* spread thinly across an entire lifetime will not
be. Same hours. Completely different outcome.

Most tracking apps only ever add. They celebrate the streak and quietly forgive
the gap. That's comfortable, and it's a lie — in real life, the gap costs you.
Skills fade. Fitness fades. Momentum fades.

**The XP decay isn't a punishment mechanic. It's the honest part.** It's the
only bit of the design that tells the truth about how progress actually
behaves. Everything else — the loot, the bosses, the levels — exists to make
showing up tomorrow feel worth it.

---

## Where this goes

Today it's medieval and gym-focused, because that's what the people building
and playing it do.

But nothing about the engine is specific to exercise. The same loop works for
anything you want to get better at:

- Growing a social media following
- Drawing, or any craft
- Learning an instrument or a language
- Studying
- Anything a person can do daily and wants to be better at

**The long-term shape:** different versions of the game for different goals,
and the ability for people to define their own activities. The XP, the decay,
the levels, the loot all work identically. Only the theme and the activity list
change.

---

## What it needs to feel like

- **Unique.** Not a template. Its own art style, its own voice.
- **Polished.** Consistent, considered, finished-feeling.
- **A brand and an environment**, not just a utility.
- **Genuinely good-looking.** Real artwork, real sound, real atmosphere.

---

## Principles

1. **Never lose someone's logged work.** Everything else is negotiable; this
   isn't. Someone who logged a workout must never find it gone.
2. **Play is never blocked.** No signal, no account, no problem. It syncs later.
3. **The decay is honest, not cruel.** Rest tokens, easy mode, and forgiveness
   mechanics exist — but the core truth stays intact.
4. **No emoji, no stock look.** Every visual is ours.
5. **Don't build it twice.** Decide architecture early, even when the feature
   is far off.

---

## Open design questions

- **Activities should become data, not code.** Right now exercise types are
  written into the app itself. For "your own tasks" and other themed versions
  to work, an activity needs to be a piece of *content* the app reads —
  a name, how XP is earned, which skill it feeds. Worth doing before there
  are lots of players, because changing it later means rewriting saved data.
- **How much do themes share?** One app that switches theme, or separate apps
  sharing an engine?
- **What's social?** Leaderboards, friends, shared goals, guilds?
- **The player character** is currently assembled by code, which is why any
  race / sex / armour combination works. Downloaded character models are fixed
  single objects. Decide whether to keep the flexible system and make it look
  far better, or move to a modular model pack.
