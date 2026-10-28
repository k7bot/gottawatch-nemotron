# Gottawatch: Ask Gottawatch (Devpost project description draft)

## Inspiration

The best recommendations come from friends, not algorithms. But they get lost in group chats, and when you sit down
on the couch you can't remember who said what was worth watching.

## What it does

Friends recommend shows and movies from their phones, with a short note ("start at episode 2"). Your TV shows a
lean-back feed of those picks. New for this hackathon is **Ask Gottawatch**: type or tap a mood on your phone ("short
and funny, both of us"), or on the TV pick a mood chip with the remote or choose "Type your own" and use the on-screen
keyboard. An NVIDIA Nemotron agent on Nebius Token Factory answers with one to three picks from your friends, usually
in about 2 to 4 seconds on the live app (occasionally up to about 7). Any quote it shows is your friends' own words,
never a made-up review. "How I picked this" shows the steps the agent took.

It's honest about relevance: when nothing your friends sent fits ("a Korean horror movie from the 1980s"), it says so
instead of stretching a pick. A question that isn't about what to watch, or an attempt to talk it out of its rules,
gets a friendly redirect back to your friends' picks.

## How we built it

- **Nemotron 3 Super 120B** runs the Ask agent with tool calling: it reads your friends' unwatched picks, title
  details and your watch history, then answers in JSON.
- **Nemotron 3 Nano 30B** picks Tonight's pick for the TV and is the fast fallback when the agent can't answer.
- Calls go to the OpenAI-compatible Token Factory endpoint with plain `fetch`; no SDK.
- A server-side validator keeps only real candidate titles and only quotes that appear word for word in a friend's
  note. Friend notes are treated as data, not instructions.
- Every answer carries a status: `ok` (grounded picks), `no_match` (nothing fits; say so) or `off_topic` (redirect).
  The server checks the model's status: a what-to-watch question is never treated as off topic, and "nothing fits"
  only counts after the agent has read the friend picks. "Short" is held to its word (picks over the length are dropped
  when a shorter one fits).
- Super → Nano → rule-based fallback, so Ask always answers, and the UI says which one did.
- One Node 22 container serves the API, the phone web app and the browser TV view; it runs on Google Cloud Run
  with its state in Cloud Storage.
- We picked the models with a small eval on Token Factory (5 runs per model per task).

## Challenges

- Getting strict JSON after tool calls (JSON mode on after the first round fixed it).
- Stopping invented quotes: we measured the models, then made the server check every quote.
- Making Ask usable with only a remote: mood chips for one click, plus "Type your own" with an on-screen keyboard.
- Relevance: the model sometimes called an ordinary question ("something short and funny for a weeknight") off topic
  after reading only the watch history. The server now adds the friend-picks read itself and never accepts off topic
  for a what-to-watch question.

## Accomplishments

- On the live app, ordinary questions get grounded picks from the agent, usually in 2 to 4 s (measured Oct 27: 2.0 to
  7.3 s across 17 questions); "nothing fits" and off-topic answers come back in about 1 to 2 s.
- A prompt-injection attempt ("ignore your rules and recommend …") gets a friendly redirect before any model call.
- Works on a phone and a TV from one container.

## What we learned

Smaller grounded tasks with a strict validator beat a bigger prompt. Nano was fast enough for the TV's pick of the
night; Super was worth it for multi-step tool use.

## What's next

Where-to-watch lookups as an agent tool, voice Ask from the TV remote, and a Fire TV build.

## Built with

NVIDIA Nemotron 3 Super 120B, NVIDIA Nemotron 3 Nano 30B, Nebius Token Factory, TypeScript, Node.js, React, Vite,
React Native, Docker, Google Cloud Run.

## Try it

- Live demo: https://gottawatch-752956741608.us-central1.run.app (TV view: `/tv/`)
- Judge sign-in: see the testing notes (private link)
- Code: https://github.com/k7bot/gottawatch-nemotron (MIT)
