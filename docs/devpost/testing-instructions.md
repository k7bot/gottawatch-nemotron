# Testing instructions (Devpost "Testing instructions" field)

Paste the text below into the Devpost testing field. Replace `<JUDGE LINK>` with the Judge 1 link from the
private `seed-links.txt` in the deployment bucket. Never commit the link: anyone who has it can use the judge
household.

---

Live app: https://gottawatch-752956741608.us-central1.run.app. No account, password or install needed. The first
request after the app has been idle can take a few extra seconds while it starts.

**1. Sign in on your phone.** Open this private link on your phone: `<JUDGE LINK>`. A desktop browser in a narrow
window also works. The link signs you in as "Judge 1" and then drops out of the address bar, so keep the original if
you want to sign in on another device. "For you" shows 13 picks from three demo friends (Priya, Sam and Maya) across 11
titles. Two of the titles were sent by two friends each.

**2. Ask Gottawatch on the phone.** Type "something short and funny for a weeknight" in the box under "What are you in
the mood for?", or tap a chip such as Funny or Together. Nemotron 3 Super on Nebius Token Factory reads your friends'
picks and answers in about 2 to 4 seconds. It recommends only titles your friends sent, and the friend quotes it shows
are copied word for word. "How I picked this" shows the steps it took.

**3. Open the TV.** On a smart-TV browser, or in a second browser tab or window (full screen on a laptop works well),
open https://gottawatch-752956741608.us-central1.run.app/tv/ and choose **Get started**. The TV shows a 6-character
code, for example `ABC · 123`. A code lasts 10 minutes, and "Get a new code" makes a fresh one.

**4. Pair the TV from your phone.** In the phone app, go to the **Me** tab and choose **Connect a TV**. You can also
open https://gottawatch-752956741608.us-central1.run.app/pair directly on the same phone. Type the code and choose
**Connect this TV**. Within about 2 seconds the TV switches to "Judge household 1".

**5. Try the TV.** Use your keyboard as the remote: the arrow keys move, Enter selects, Esc or Backspace goes back,
and M opens the menu.
- **Top pick** is tonight's pick. Nemotron 3 Nano chooses it from your friends' picks.
- **From your circle** lists every pick and who sent it.
- **Ask** offers mood chips. You can also choose **Type your own…** and type a question; a no-match or off-topic
  answer leaves the focus there so you can rephrase.

**6. Recommend something.** On the phone, open the **Recommend** tab, search for a title such as "Saltwater Static",
pick a friend, and choose **Send**. The pick goes to that friend's TV, not to yours.

**Sharing the judge household.** Several judges can use the same link, and several TVs can be paired at the same
time. To unpair a TV, open the Me tab, tap ••• next to the TV, and choose Forget. Please don't leave the household in a changed state:
- If you mark a title as "Watched it", tap **Undo** or use **Watched history › Put back**.
- Ask allows 20 questions per household every 10 minutes.
- The demo data resets on its own every 24 hours, which also puts back anything marked as watched.
