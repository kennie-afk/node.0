# The five-minute demo

Run it on the sample data so nothing depends on a customer's till. Practise it once with the stack up
(`docker compose up -d`, then the URL on port 3300 or wherever it is deployed). Keep your phone in hand:
the attendant screen is the part owners remember.

**0:00 The question.** "How do you know, tonight, that the money in your M-Pesa and your cash box is
everything the day's washes should have brought in?" Let them answer. Do not argue with "I trust my staff".

**0:30 Sign up live.** `/signup`: business name, their name, their phone. The code step says
text messages are not switched on here; read them the code (`npm run admin -- messages`). Have them choose
their own six-digit PIN: they now own the account. Say it took under a minute and nobody provisioned
anything.

**1:30 Sample data.** On Get started press **Load sample data**. Say what it is: one sample car wash,
two weeks of jobs, payments and water readings, checked by the same engine that will check theirs.
Point at the banner: it says sample, everywhere, and is not billed.

**2:00 What it found.** On **Found**: days checked, expected, received, the gap. Read two of the
"things to look at" in plain words (for example jobs finished with no payment). Say the line on the screen
out loud: *leads to check, not proof that anyone took anything.* Press **Copy summary**; that is what
they can send to a partner or a manager.

**3:00 The attendant.** Open the owner's phone, sign in as an attendant (create one under Team first).
One screen: plate, services, **Record job**, **Start washing**, **Finished washing**, **Cash received**.
"This is the record your money is checked against. It takes about ten seconds a car." Then show that the
same attendant cannot open Payments or Overview.

**4:00 Price and trial.** Billing: 14 days free, KES 3,500 for one site, 3,000 each for two to five,
no card, nothing deleted if they stop. All provisional: say so.

**4:30 The honest part.** "Two things need a short session with me: connecting your till so M-Pesa
payments arrive on their own, and, if you want the water and camera checks, a flow meter or camera. Without
them it still catches unpaid jobs, payments with no job, underquoting and cash patterns." Do not promise
what you have not connected.

**4:50 The ask.** "Fourteen days, one site, I sit with you the first morning. Tomorrow at what time?"

## Before you walk in

- [ ] The sample loads (a fresh account, not one with real records).
- [ ] You know the code-relay command and have it open.
- [ ] You know whether the customer's till is connected; if not, you do not say it is.
- [ ] Phone charged, a second phone number ready for the attendant sign-in.
