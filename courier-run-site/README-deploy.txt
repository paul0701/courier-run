COURIER RUN: putting it online, with the shared leaderboard

WHAT IS IN THIS FOLDER
  index.html            the game
  admin.html            your private moderation page (hide names from the board)
  netlify.toml          tells Netlify where the functions are
  package.json          tells Netlify to install the storage add-on
  sw.js, manifest.webmanifest, icon-*.png    offline play and install to home screen
  netlify (a folder)    inside it, a folder called functions, with SIX files:
                        admin.js, claim-username.js, get-leaderboard.js,
                        login-username.js, start-run.js, submit-score.js

STEP 1: GITHUB  (this is where it went wrong last time, so go slowly)
  a. On github.com make a new repository called courier-run.
  b. Choose Add file, then Upload files.
  c. Open the unzipped folder on your computer, press Select All, and drag
     EVERYTHING into the GitHub page in one go. Drag the netlify FOLDER itself.
     Do not drag the six function files on their own.
  d. Commit the changes.
  e. CHECK: in the repository, click netlify, then functions. You must see the
     six .js files there. If the six files are sitting at the top level of the
     repository instead, they are in the wrong place and will not work.

STEP 2: NETLIFY
  a. Add a new site from GitHub and pick courier-run.
  b. Base directory: leave empty. Build command: leave empty.
     Publish directory: a single full stop (.)
     Functions directory: netlify/functions (it usually fills itself in).
  c. Deploy.

STEP 3: CHECK THE SERVER IS ALIVE
  In your browser open:  your-site-address/.netlify/functions/get-leaderboard
  You should see:  {"top":[],"me":null}
  If you see an error page instead, the functions are not in the right folder
  (go back to step 1e). If you see a red error mentioning Blobs, send me a
  screenshot of the function's log page in Netlify.

STEP 4: TURN ON MODERATION
  a. In Netlify open the site's settings and find Environment variables.
  b. Add one called ADMIN_KEY. For the value, make up a long password of at
     least 12 characters (20 or more is better, mixing words and numbers).
     Keep it private.
  c. Trigger a new deploy so the site notices it.
  d. Open your-site-address/admin.html, type the key, and you can hide any name
     from the board, and bring it back later. Nobody else can use that page
     without the key.

STEP 5: TRY IT
  Play a run on your phone. When it ends, the join screen appears. Claim a name
  and a PIN, and your score should show a leaderboard position. Then open the
  game on a laptop, choose Leaderboard, then Claim a name, and use Log in with
  the same name and PIN to check it follows you between devices.

YOUR OWN WEB ADDRESS
  Add the domain in Netlify's domain settings and point it from Ionos, the same
  way you did for slashanddash.online.

UPDATING LATER
  Replace index.html on GitHub. Netlify redeploys by itself and players get the
  new version next time they are online. If you change a server function, replace
  that file inside netlify/functions on GitHub the same way.

GOOD TO KNOW
  - This is a NEW site, so its names and scores are separate from Slash & Dash.
  - Wrong PINs: five wrong tries lock that name for 15 minutes. PINs are stored
    scrambled with a slow hash, never as the digits.
  - A run's score is checked against how long the run lasted, and each run can
    only be sent once. That stops casual cheating and obviously impossible
    scores. It cannot stop someone determined who plays perfectly with a script.
  - The name filter is a simple starting list. It will miss things, so look at
    the board now and then and use the admin page.
  - The leaderboard is built for a hobby-sized crowd (hundreds or a few thousand
    players). If it grows well beyond that, it will want a proper database.
  - The free Netlify plan comfortably covers tens of thousands of runs a month.
    Each run uses two server calls, plus one whenever someone looks at the board.
