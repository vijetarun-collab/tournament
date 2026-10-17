# Buzzer Round

Six teams, one phone each. The first team to tap gets to answer. Teams open a public link with no sign-in. You run the round from a PIN-protected host page.

- `/` is the team page. Each phone picks a team once, then taps the big button.
- `/host` is your console. It opens and closes buzzers, judges answers, and keeps score.

## How "first" is decided

Every tap goes to a small server function, which asks Redis to record the winner only if nobody has been recorded yet. Redis handles one request at a time, so two taps can never both win. The order is the order in which taps reach the server, so a team with a weak connection can lose to a team that tapped slightly later but connected faster. Use the practice round below to check everyone's signal.

## Deploy (about 10 minutes)

You need a free GitHub account, a free Vercel account and a free Upstash account.

1. **Put the code on GitHub.** Create a new repository, then upload every file in this folder. Keep the folders as they are: `api`, `lib` and `public`.
2. **Create the database.** In Upstash, create a Redis database and pick the region closest to your players (Mumbai, `ap-south-1`, for players in India). Open the database page and find the REST section, which shows a URL and a token.
3. **Import the repo into Vercel.** Choose "Add New Project", pick your repository, and leave the framework preset as "Other". Do not change the build settings.
4. **Add environment variables** before the first deploy, under Settings, Environment Variables:
   - `UPSTASH_REDIS_REST_URL`: the URL from Upstash
   - `UPSTASH_REDIS_REST_TOKEN`: the token from Upstash
   - `HOST_PIN`: a passphrase you choose. Use something long, such as three random words. Anyone who knows it can run your quiz.
   
   If you add Upstash from the Vercel Marketplace instead, Vercel fills in the Redis variables for you under slightly different names (`KV_REST_API_URL` and `KV_REST_API_TOKEN`). The code accepts both.
5. **Deploy.** Vercel gives you an address like `your-project.vercel.app`.

Changing an environment variable later only takes effect after you redeploy.

## Before the real round

1. Open `/host` on your laptop and enter the PIN.
2. Open `/` on two or three phones and pick different teams.
3. Tap "Open buzzers for a new question", then tap buzz on two phones as close together as you can. One phone should show the answer prompt and the other should show who buzzed first.
4. Try "Wrong, reopen for others". The wrong team should be locked out and the rest can buzz again.

The first tap after the site has been idle can be a little slower while the server wakes up. A practice tap or two before you start avoids this.

## Running a round

1. Tap "Open buzzers for a new question". Every phone switches to BUZZ.
2. When a team buzzes, their phone shows ANSWER NOW and every other phone shows who got in first.
3. Judge the answer:
   - **Correct** adds the points you typed and closes buzzers.
   - **Wrong, reopen for others** locks that team out of this question and opens buzzers for the remaining teams.
   - **No answer, close** closes buzzers without scoring.
4. Rename teams or fix scores in the Teams panel. Names show up on every phone.

## Good to know

- Anyone who has the team link can pick any team. If you need to stop teams buzzing for each other, run the round in a room where you can see the phones.
- The host PIN is checked on the server. After 20 wrong guesses from one address, that address is blocked for 15 minutes.
- Phones check for updates about twice a second, so the free Upstash plan handles a long quiz night. If you expect many hours of use, check your daily command limit in Upstash.
- Nothing is stored about players. The only data is the question number, lock-outs, team names and scores.
