# Auto-Class Bot

This project schedules classes automatically using Playwright.

## Setup

Install dependencies and run locally. You can place your credentials in a `.env` file (see the included example) so the script picks them up automatically:

```bash
npm install
node index.cjs
```

The repository ships with a sample `.env` file containing the credentials used by the scheduled workflow. Edit it if you need to update your own values.

## GitHub Actions

A workflow is included to run the script daily at 23:00 UTC. Configure the variables `USER_ID`, `USER_PASS`, and `WEBHOOK_URL` as repository secrets for the workflow to work.
