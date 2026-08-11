# Email Reporting — What's New & What the Numbers Mean

Hi Sheree — we made a bunch of improvements to email tracking and unsubscribes this week. Here's the plain-English rundown.

## What's new that you'll see

**1. "Resend to non-openers" button** (Campaigns page)
On any campaign that's finished sending, there's a new button to re-send the *same* email to only the people who **didn't open** it the first time. Great for giving a good email a second chance a few days later. It suggests a fresh subject line (like "Reminder: …") — keep that, don't reuse the original subject.

**2. Unsubscribes now show up everywhere**
Previously unsubscribes were basically invisible. Now you'll see them in three places:

- The **Recipients popup** (a new "Unsubscribed" filter tab)
- The **campaign summary** (a new "Unsubscribed" box next to Bounced/Complained)
- The **Reports** page (Email Performance)

**3. The ATL website's subscriber list is now correct**
This was the big one. When someone unsubscribed, the ATL database sometimes still showed them as "Subscribed." That's fixed — unsubscribes now flow through to ATL, and ATL also now shows engagement (who opened, who clicked) matching what Trellis shows.

## Understanding the numbers

Every email goes through stages. Here's what each label means:

| Label | What it means |
|---|---|
| **Sent** | We handed the email to our mail service to send. |
| **Delivered** | It reached the person's mailbox provider (Gmail, etc.). |
| **Opened** | They opened the email. |
| **Clicked** | They clicked a **link inside** the email (a product, a page). |
| **Bounced** | The recipient's mail server **refused** it — usually a dead/wrong address. |
| **Complained** | They hit **"Report Spam"** in their inbox. (Stronger than unsubscribe — hurts our sending reputation.) |
| **Unsubscribed** | They clicked the **Unsubscribe** link. |
| **Failed** *(in the Delivery box)* | The send **never went out** — e.g., we skipped them because they'd already unsubscribed or bounced before. |
| **Pending** *(in the Delivery box)* | Still in line to be sent. |

**Quick way to remember the tricky ones:**

- **Bounced** = the other end refused it. **Failed** = it never left our building.
- **Complained** = "this is spam." **Unsubscribed** = "please stop emailing me." Both stop future emails; complaint is the more serious one.

## Why the click number changed (230 → 200)

You may notice the "Clicked" count on the ATL newsletter went **from 230 to 200**. That's a **fix, not a loss**. It turned out 30 of those "clicks" were people clicking the **Unsubscribe** link — which was being counted as engagement. Unsubscribing isn't really "engaging with the email," so we stopped counting it as a click. Those 30 now correctly show up under **Unsubscribed** instead. So 200 is the true number of people who clicked something *in* the email.

## Two things worth knowing when you read reports

1. **Some opens/clicks are robots, not people.** Corporate email systems (especially at schools, law firms, hospitals) automatically open and click every link to scan it for safety, *before* the human ever sees it. So a slice of the opens/clicks are automated. Don't treat every number as a real person — the trend matters more than the exact count.
2. **Wait a few days before resending or judging results.** Opens and clicks trickle in for a day or two after a send. Give it **2–4 days** before you resend to non-openers or read the final numbers.

If anything looks off, flag it — a lot of this is now traceable down to the individual person, so we can usually explain any number you see.
