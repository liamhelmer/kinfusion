# Payment Review Contract

Use one row per Gmail candidate:

| Message | Provider/state | Payment facts | Proposed allocation | Evidence | Decision needed |
|---|---|---|---|---|---|
| Gmail message ID and received date | Interac/Wise; deposited, pending, cancelled, expired, declined, or refunded | Amount/currency, payer, provider reference, memo | RefCode(s), attendee(s), cents, proposed notes | Exact RefCode/email/name/balance/prior-payment evidence | Exact question for the organizer |

State confidence in words, but never use confidence as authorization. Quote only the minimum short email fragment needed to establish payment facts.

## Approval payload

Show the exact payload in a JSON code block before asking for approval:

```json
{
  "messageId": "GMAIL_MESSAGE_ID",
  "receivedAt": "2026-08-20T15:00:00.000Z",
  "allocations": [
    {
      "refCode": "KF-ABCDE",
      "amountCents": 25000,
      "notes": "Organizer-approved reconciliation note"
    }
  ]
}
```

Rules:

- `messageId` and `receivedAt` must come from the scanned candidate.
- `amountCents` is a positive integer. The sum must equal the organizer-approved allocation of the notification amount; flag currency conversions or fees instead of inferring them.
- Use one allocation per attendee RefCode. A combined transfer has several allocations.
- Notes contain only organizer-approved reconciliation context, never copied mailbox content beyond what is necessary.
- The payload has no status, label, query, spreadsheet range, or arbitrary mutation fields.

## Applied report

After approval, report:

- Gmail message ID and `kinfusion-etransfer` label result.
- `Pmts Received` row numbers and whether they were new, duplicate, or recovered.
- Each affected RefCode and resulting `unpaid`, `partial`, or `paid` status.
- Every skipped status with its returned reason, especially `manual_status_preserved` or `organizer_instruction_required`.
