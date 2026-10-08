# Manase Village Bank

A village savings and loan (VSLA) system for the Manase group: weekly savings, loans, monthly wrappers, welfare fund, fines, meetings, new-member voting, share-out, analytics, and text-message confirmations. Works in Chichewa and English.

- **Frontend:** React (Vite) in `frontend/`
- **Backend:** Node.js + Express + Postgres (Neon) in `backend/`

## The group's rules (built in)

| Rule | How the system applies it |
|---|---|
| Borrow up to **2 × savings** | Checked when a loan is requested. Set in Settings (`loan_multiplier`). |
| Interest | A percentage of the loan, charged once. A member may choose to borrow without interest. |
| **Interest is not shared** | At share-out each borrower gets back **only the interest she paid herself**. |
| **Fines and welfare are not shared** | They stay with the group. |
| **Monthly wrappers: MWK 3,000** | Every member, every month. Not savings, not borrowable against, not shared. Set in Settings (`monthly_levy`). |
| **Secretary and Treasurer record everything** | Only these two roles can record savings, repayments, fines, welfare, wrappers, meetings and run the share-out. The chairperson (admin) manages members, cycles and settings, decides loans with the committee, and can delete mistaken entries. |

Share-out per member = her savings in the cycle + the interest she paid − what she still owes (open loan, unpaid fines). If she owes more than she is due, the rest is shown as *unrecovered* and is never silently erased. The rule is in `backend/utils/shareout.js` and is tested: run `npm test` inside `backend/`.

> The label "Wrappers" for the monthly MWK 3,000 contribution can be renamed in `frontend/src/i18n/en.extra.js` and `ny.extra.js` (search for `wrappers`).

## First-time setup

You need Node.js 18 or newer and a Neon (Postgres) database.

1. **Backend settings.** In `backend/`, copy `.env.example` to `.env` and fill in `DATABASE_URL` and `JWT_SECRET`.
   *If you already have a working `.env` from before, copy that file into `backend/` instead.*
2. **Create or upgrade the tables** (safe to run again; it never deletes data):
   ```
   cd backend
   npm install
   npm run db:setup
   ```
3. **Demo data (only on a brand-new database):** `npm run db:seed`
4. **Start it.** On Windows double-click `start-windows.bat`. Otherwise run `npm start` in `backend/` and `npm run dev` in `frontend/`.
5. Open **http://localhost:5173**

Demo log-ins from the seed (change them straight away): `admin / admin123`, `treasurer / treasurer123`, `secretary / secretary123`, members `agnesb`, `maryk`, `ellenm`, `tionges` / `member123`.

### Upgrading a database that already has your real data

Just run `npm run db:setup` in `backend/`. It adds the new tables and columns, changes the loan multiplier from 3 to 2 (only if it was still 3) and removes the old share-out switches. **Do not run `db:reset`**: that deletes everything.

## Text messages

Set `SMS_DRY_RUN=true` to try everything without sending. For real texts fill in `TEXTBEE_API_KEY` and `TEXTBEE_DEVICE_ID`.

## Putting it online

Set `NODE_ENV=production` and `FRONTEND_URL` (the website address) in the backend environment, build the site with `npm run build` in `frontend/`, and set `VITE_API_URL` to the API address before building.

## Keep it safe

- Never commit `.env` files or API keys. `.gitignore` already blocks them.
- Change every demo password.
- If a key was ever shared or committed, delete it in the provider's dashboard and make a new one.
