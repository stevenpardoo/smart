# Auto-Class Bot

This project schedules classes automatically using Playwright.

## Setup

Install dependencies and run locally:

```bash
npm install
USER_ID=your_user \
USER_PASS=your_pass \
WEBHOOK_URL=https://discordapp.com/api/webhooks/... \
node index.cjs
```

## GitHub Actions

A workflow is included to run the script daily at 23:00 UTC. Configure the variables `USER_ID`, `USER_PASS`, and `WEBHOOK_URL` as repository secrets for the workflow to work.
