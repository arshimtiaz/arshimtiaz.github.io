---
title: "Breaking Access Control Safely: Building a Transaction System Attack Lab"
date: 2026-02-14T02:05:32+00:00
desc: Modelling broken access control and IDOR in a small multi-service transaction lab
author: Arsh Imtiaz
tags:
  - cybersecurity
  - red teaming
  - web security
  - labs
  - fintech
comment: true
---

{{< image src="./transaction_lab_header.svg" alt="Transaction System Attack Lab" caption="Modelling broken access control in a small transaction system" >}}

# Why build another lab?

Broken access control (especially IDOR-style issues) keeps showing up in real systems – often in places that look "boring" on the surface: balance checks, transaction history, admin tools, internal APIs.

I wanted a small, opinionated lab that behaves more like the systems I see in the real world than a typical CTF challenge. Something I could:

- use to explain attack paths to engineers,
- talk through in interviews without referencing client work,
- and extend over time with new scenarios.

So I built a **Transaction System Attack Lab** – a tiny, multi-service platform that exposes a very real class of bug: object-level authorization failures on account data.

---

## High-level idea

Instead of a single monolith, the lab is split into three FastAPI services:

- **auth-service** – issues JWTs with `sub = user_id` and a simple `role`.
- **accounts-service** – exposes `GET /accounts/{id}/balance` and `POST /accounts/transfer`.
- **audit-service** – receives security/audit events (designed to talk about logging and detection).

{{< image src="/images/architecture.png" alt="Transaction System Attack Lab architecture" >}}

The interesting bit is not the framework – it's the **trust boundaries**:

- Client ↔ auth-service (where identity is established)
- auth-service ↔ accounts-service (where identity is consumed)
- accounts-service ↔ audit-service (where we decide what to log and how).

---

## The vulnerable pattern (IDOR / broken access control)

The core bug I wanted to model is very simple:

> The API lets you reference an account by ID, but never checks whether that account actually belongs to you.

In the lab, accounts are stored like this:

```python
ACCOUNTS = {
    2001: Account(id=2001, owner_user_id=1001, balance=1000.0),
    2002: Account(id=2002, owner_user_id=1002, balance=500.0),
    2003: Account(id=2003, owner_user_id=1002, balance=2500.0),
}
```

The vulnerable endpoint looks up the account by ID and returns it:

```python
@app.get("/accounts/{account_id}/balance")
async def get_balance(account_id: int, token: dict = Depends(decode_token)):
    acct = ACCOUNTS.get(account_id)
    if not acct:
        raise HTTPException(status_code=404, detail="Account not found")

    # Deliberately missing ownership check
    return {
        "account_id": acct.id,
        "owner_user_id": acct.owner_user_id,
        "balance": acct.balance,
    }
```

The token already tells us who the caller is (`token["sub"]`), but the handler never uses it.

This is the essence of an IDOR-style bug: **the application trusts an object identifier without enforcing object-level authorization**.

---

## Walking Attack Path 01

The first documented scenario is in the repo as:

- `docs/attack-path-01-idor-broken-access-control.md`

The flow is intentionally close to how a real test would look:

1. **Login as a normal user**

   ```bash
   curl -s -X POST http://localhost:8001/login \
     -H "Content-Type: application/json" \
     -d '{"username": "alice", "password": "password123"}' | jq
   ```

2. **Confirm your own account works**

   ```bash
   TOKEN="<paste the access_token>"

   curl -s http://localhost:8002/accounts/2001/balance \
     -H "Authorization: Bearer $TOKEN" | jq
   ```

3. **Probe other IDs**

   ```bash
   curl -s http://localhost:8002/accounts/2002/balance \
     -H "Authorization: Bearer $TOKEN" | jq
   ```

   Even though Alice owns account `2001`, she can read balances for `2002` and `2003`, which belong to a different user.

4. **Automate the search**

   To make it feel more like a real engagement, I wired a small helper script:

   ```bash
   ./scripts/exploit/idor_enumeration.py --start 2000 --end 2010
   ```

   Under the hood it:

   - logs in to auth-service to get a JWT,
   - loops over account IDs,
   - prints `[HIT]` when the API leaks data.

{{< image src="/images/attack-path-01.png" alt="Attack Path 01 – Broken access control on accounts" >}}

---

## Fixing it (and why it matters)

The fix is deliberately boring, because that's what most real security fixes look like:

```python
caller_user_id = int(token["sub"])
if acct.owner_user_id != caller_user_id and token.get("role") != "admin":
    raise HTTPException(status_code=403, detail="Forbidden")
```

The important part is the **thinking** around it:

- Where does identity come from (auth-service)?
- Where is it consumed (accounts-service)?
- Do we enforce ownership every time we touch something user-specific?
- Do we log enough context to spot weird access patterns later?

In `docs/detection-and-mitigation.md` I sketched out logging fields and detection ideas, e.g.:

- a single `user_id` touching lots of different `account_id` values in a short window,
- repeated access to non-existent accounts,
- correlating access patterns with other events from the same user/session.

---

## Why this helps me as a practitioner

I built this lab for three reasons:

1. **Storytelling** – It's much easier to talk about broken access control when you can point to a tiny system and say: _"here is the exact place it went wrong, here is the exploit, and here is the fix"_.

2. **Interview signal** – This repo is public, so I can:
   - walk hiring managers through the architecture and attack path,
   - show that I think about both offense (finding the bug) and defense (logging, detection, and mitigations).

3. **Extensibility** – The roadmap includes future scenarios like webhook issues, race conditions on transfers, and misuse of internal tooling. I can grow this over time as I see more real-world patterns.

If you want to read the code or run the lab yourself, it's here:

- GitHub: https://github.com/c0ncatenate/transaction-system-attack-lab

As always, everything is for educational use only – **only test systems you have explicit permission to attack**.
