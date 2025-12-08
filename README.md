# PrimeX

My custom Twitter/X client. Vim keybinds, One Dark theme, zero distractions.

I'm obsessed with speed. The default Twitter UI is slow, cluttered, and forces you to use a mouse. I spend hours on this site—it needed to feel like a proper tool, not a slot machine.

## Demo
https://x.com/diegooprime/status/1997924643286479117?s=20

## How it works

**Navigation**

| Key | Action |
|-----|--------|
| `j/k` | Next/prev tweet |
| `h` | Back |
| `l` | Like |
| `g/G` | Top/bottom |
| `Enter` | Open |
| `Esc` | Clear focus |

**Actions**

| Key | Action |
|-----|--------|
| `c` | Reply |
| `r` | Retweet |
| `b` | Bookmark |
| `s` | Copy link |
| `m` | Mute video |
| `x` | Not interested |

**Leader commands** (press `Space` first)

| Keys | Action |
|------|--------|
| `f f` | Search |
| `t` | Compose |
| `p` | My profile |
| `a` | Bookmarks |
| `o` | Open all bookmarks in tabs |
| `h` | Home |
| `r` | Refresh |
| `?` | Help |

**Removed:** both sidebars, Grok, messages button, premium upsells, checkmarks, compose box, For You/Following tabs, all ads.

**Stats widget:** tracks my time spent (24h/7d) and tweets scrolled. Goes yellow >1hr, red >2hr. Keeps me honest.

**Bookmarks:** 5-column grid, same keybinds.

## Install

```bash
git clone [repo]
# chrome://extensions/ → Developer mode → Load unpacked → primeX_extension/
```

## Config

`keyboard.js` → `MY_PROFILE` for profile shortcut

`content.js` → `updateStatsWidget()` for time thresholds

`styles.css` → CSS variables for colors

## License

MIT