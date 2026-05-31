> **DRAFT — FOR INTERNAL USE ONLY**
> This document has not been reviewed by qualified legal counsel or a certified Data Protection Officer.
> **Do not treat as legal advice. Review and approve with a qualified DPO and Nigerian/EU privacy counsel before operationalising.**

---

# Data Subject Rights Procedure (DSAR Handling)

**Document owner:** [DPO / Legal Lead — name TBD]
**Version:** 0.1-DRAFT
**Last reviewed:** 2026-05-31
**Next review due:** 2027-05-31

**Cross-references:**

- [`docs/compliance/BREACH_RESPONSE_RUNBOOK.md`](./BREACH_RESPONSE_RUNBOOK.md) — breach events may trigger follow-on DSARs from affected individuals; follow both procedures in parallel
- [`docs/compliance/RETENTION_POLICY.md`](./RETENTION_POLICY.md) — governs what data exists and for how long; informs erasure and access responses
- [`docs/compliance/ROPA.md`](./ROPA.md) — Record of Processing Activities; used to scope access and portability responses

---

## 1. Purpose & Scope

This procedure documents how Kourti Legal handles requests from data subjects exercising their rights under:

- **GDPR** (Regulation 2016/679) — Articles 15–22 (Rights of access, rectification, erasure, restriction, portability, objection, and rights related to automated decision-making)
- **Nigeria Data Protection Act 2023 (NDPA) / NDPR Framework** — equivalent rights provisions

It applies to:

- All personal data for which Kourti acts as **controller** (Kourti's own registered users — lawyers, firm admins, platform users)
- All personal data for which Kourti acts as **processor** (law-firm client data uploaded/generated within the platform on behalf of law firms)

---

## 2. Kourti's Dual Role — Critical Distinction

> **Read this section before handling any request.**

| Scenario                                                                                                  | Kourti's Role   | How to Handle                                                                     |
| --------------------------------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------- |
| Data subject **is a Kourti platform user** (e.g., a lawyer or firm admin with an account)                 | **Controller**  | Kourti fulfils the request directly using this procedure                          |
| Data subject **is a law firm's client** whose data was uploaded/processed in Kourti on behalf of the firm | **Processor**   | Kourti must **route the request to the controlling law firm** and assist (see §6) |
| Ambiguous / both apply                                                                                    | Escalate to DPO | DPO determines scope and routing                                                  |

**Why this matters:** As a processor, Kourti has no authority to independently fulfil data subject rights over data it processes for the law firm. The law firm is the controller and must make the decision. Kourti's obligation is to forward the request promptly and provide the firm with the technical assistance it needs (GDPR Art. 28(3)(e)).

---

## 3. How Requests Arrive

| Channel                                                                | Description                                                                                                                                                           | Primary Handler                                                               |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **In-app self-service**                                                | Platform settings provide "Export my data" (access + portability), "Delete my account" (erasure), profile edit (rectification), and marketing unsubscribe (objection) | System-triggered; logged automatically; DPO notified for non-trivial requests |
| **Email — privacy@kourti.com**                                         | Written requests to the privacy inbox                                                                                                                                 | DPO / designated privacy team member                                          |
| **In-app contact/support form**                                        | General enquiry routed to privacy inbox                                                                                                                               | Customer Success → DPO                                                        |
| **Post / formal letter**                                               | Written requests by post to registered office                                                                                                                         | DPO; scan and log within 2 business days of receipt                           |
| **Via third-party (e.g., a law firm routing a client DSAR to Kourti)** | Processor routing scenario (§6)                                                                                                                                       | Comms / CS → DPO                                                              |
| **Via supervisory authority**                                          | NDPC or EU DPA forwarding a complaint                                                                                                                                 | Legal Counsel + DPO immediately                                               |

**All requests**, however received, must be logged in the audit trail (see §9).

---

## 4. Identity Verification

Kourti must verify the identity of the requestor before disclosing or acting on personal data. The level of verification should be proportionate to the sensitivity of the data and the request type.

### 4.1 Verification Steps

**For requests received via the authenticated platform UI:**

- User is already authenticated (session token). No additional verification required for standard requests (export, profile edit, marketing unsubscribe).
- For erasure requests, require explicit in-app confirmation (typed confirmation, e.g., "DELETE MY ACCOUNT") and re-authentication / password confirmation.

**For requests received by email or other channels:**

- Confirm the requestor's identity by:
  1. Sending a verification email to the address on file and requesting a reply confirmation, **or**
  2. Asking the requestor to log in to the platform and submit the request from the authenticated session.
- For high-sensitivity requests (full data export, erasure): consider requesting a government-issued ID if the email verification is insufficient or if the account holds sensitive professional data.
- Document verification method in the request log.

### 4.2 Third-Party Requests (Made on Behalf of a Data Subject)

- Require written authorisation (signed letter of authority or power of attorney) from the data subject.
- Verify authorisation is genuine before proceeding.

### 4.3 Cannot Verify

- If identity cannot be reasonably verified: inform the requestor of what is needed; do not fulfil the request until verified.
- If the requestor refuses to provide verification: document and decline, noting the reason.

---

## 5. Deadline & Extensions

|                       | Deadline                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| **Standard response** | **1 calendar month** from receipt of request (or from identity verification, if later)                |
| **Extension**         | Up to **2 additional months** (total 3 months) for complex or numerous requests                       |
| **Extension notice**  | Must inform the data subject **within the initial 1-month period** of the extension and the reason(s) |
| **Refusal**           | Inform within 1 month; state reason; inform of right to complain to supervisory authority             |

**Receipt date** = the day the request is received (or the day identity is confirmed, if later).

**Monthly calculation:** "One calendar month" means the same date in the next month. If no equivalent date exists, the last day of that month applies.

Track all deadlines in the audit log / DSAR tracker.

---

## 6. Processor Routing — Law-Firm Client DSARs

When a data subject's request relates to data processed by Kourti on behalf of a law firm (i.e., Kourti is a **processor**):

### 6.1 Routing Procedure

1. **Do not fulfil the request directly.** Kourti has no authority to disclose, erase, or otherwise act on this data without the controller's instruction.
2. **Immediately notify the relevant law firm** (within 3 business days of receiving the request):
   - Forward the request in writing to the firm's designated data contact.
   - Include: the request content, the date received, the requestor's identity (if verified), and the deadline the firm must meet.
   - Use Template E (§8).
3. **Confirm to the requestor** that their request has been routed to the responsible party (the law firm), and provide the firm's contact details if known. Do not disclose which firm if this is itself sensitive or privileged.
4. **Stand ready to assist the law firm** with technical extraction, deletion, or restriction — act promptly on the firm's instructions.
5. **Do not apply the 1-month DSAR clock to Kourti directly** in the processor scenario; however, the firm's 1-month clock runs from when they (or Kourti as their agent) received the request. Facilitate a swift handover.

### 6.2 Where It Is Unclear Which Firm Is the Controller

Escalate to DPO immediately. The DPO will identify the controlling firm from platform records and coordinate routing.

---

## 7. Rights — Workflow Table

### 7.1 Right of Access (Art. 15 GDPR / NDPA equivalent)

**What the right covers:** Confirmation of whether Kourti processes the data subject's personal data; a copy of that data; supplementary information (purposes, categories, recipients, retention periods, rights).

| Step | Action                                               | Technical Mechanism                                                                                                                                        |
| ---- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Identity verified                                    | Auth session or email verification                                                                                                                         |
| 2    | Scope data subject's data across all relevant tables | Query against user ID: `users`, `profiles`, `audit_logs`, `documents`, `case_events`, `billing`, `marketing_consent`, and all related tables per `ROPA.md` |
| 3    | Compile response                                     | **"Export my data"** endpoint generates a structured JSON summary + ZIP of uploaded documents owned by the user                                            |
| 4    | Deliver                                              | Secure download link via email / in-app notification; expires after 7 days                                                                                 |
| 5    | Log                                                  | Record in audit log: request received, verification method, data delivered, date                                                                           |

**Self-service:** In-app "Export my data" button at Settings → Privacy covers standard access + portability in one flow.

---

### 7.2 Right to Rectification (Art. 16)

**What the right covers:** Correction of inaccurate personal data; completion of incomplete data.

| Step | Action                       | Technical Mechanism                                                                                                                              |
| ---- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Identity verified            | Auth session                                                                                                                                     |
| 2    | Identify inaccurate fields   | User specifies which data is incorrect                                                                                                           |
| 3    | Self-service corrections     | Profile fields editable directly in Settings → Profile (name, email, job title, firm, contact details)                                           |
| 4    | Non-self-service corrections | For data not exposed in UI (e.g., billing records, audit log metadata): DPO reviews request and instructs Engineering to perform targeted update |
| 5    | Notify                       | Confirm correction in writing (email)                                                                                                            |
| 6    | Propagate                    | If data has been shared with sub-processors (Resend, Brevo), update data at source; Brevo contact record must be updated for CRM consistency     |
| 7    | Log                          | Audit log entry                                                                                                                                  |

---

### 7.3 Right to Erasure / "Right to be Forgotten" (Art. 17)

**What the right covers:** Deletion of personal data where: consent is withdrawn; data is no longer necessary; data subject objects and no overriding legitimate interest exists; data was unlawfully processed.

**Exceptions (erasure NOT required):** Legal obligation to retain data (e.g., financial records — see `RETENTION_POLICY.md`); establishment, exercise, or defence of legal claims; public interest.

| Step | Action                                    | Technical Mechanism                                                                                                                                                                                                                                                    |
| ---- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Identity verified + explicit confirmation | In-app: re-authentication + typed confirmation "DELETE MY ACCOUNT"; email: signed written request + identity verification                                                                                                                                              |
| 2    | Check for retention exceptions            | DPO / Legal reviews against `RETENTION_POLICY.md`; identifies any data that must be retained (e.g., billing records for 7 years)                                                                                                                                       |
| 3    | Erasure execution                         | **"Delete my account" flow** triggers `erasure_service`: hard-deletes or anonymises PII across all applicable tables                                                                                                                                                   |
| 4    | Scope of erasure                          | Full account: hard-delete user record, profile, session data, uploaded documents, case event data owned by user, marketing consent, Brevo contact record; anonymise audit log entries (replace PII with `[DELETED]` token retaining event metadata for legal purposes) |
| 5    | Sub-processor notification                | Instruct Resend to suppress email; instruct Brevo to delete contact; check and request deletion from any other sub-processors holding a copy                                                                                                                           |
| 6    | Confirmation                              | Send erasure confirmation email before deleting the email address                                                                                                                                                                                                      |
| 7    | Log                                       | Record in audit log before deletion: timestamp, scope, reason, any retained data and legal basis for retention                                                                                                                                                         |

> **Processor scenario:** Kourti cannot erase law-firm client data without instruction from the controlling law firm. Route to firm (§6); upon firm's instruction, execute erasure.

---

### 7.4 Right to Restriction of Processing (Art. 18)

**What the right covers:** Suspending processing (not deletion) where: accuracy is contested; processing is unlawful but erasure is refused; data is no longer needed but required for legal claims; pending objection assessment.

| Step | Action                 | Technical Mechanism                                                                                                                |
| ---- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Identity verified      | Auth session or email verification                                                                                                 |
| 2    | Apply restriction flag | Set `processing_restricted = true` on user/data record; this flag is checked by all processing services                            |
| 3    | Effect of flag         | Data is stored but not used for any active processing (AI analysis, marketing, aggregation). Platform access may be limited.       |
| 4    | Notify                 | Confirm restriction applied                                                                                                        |
| 5    | Lift restriction       | Only upon: data subject consent; establishment/exercise/defence of legal claims; protection of third-party rights; DPO instruction |
| 6    | Log                    | Audit log entry with reason and duration                                                                                           |

---

### 7.5 Right to Data Portability (Art. 20)

**What the right covers:** Personal data provided by the data subject, processed by automated means under consent or contract, in a structured, commonly used, machine-readable format. Applies to Kourti-controlled user data only.

| Step | Action            | Technical Mechanism                                                                                                                                                                                                |
| ---- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Identity verified | Auth session                                                                                                                                                                                                       |
| 2    | Data export       | **"Export my data"** endpoint generates: (a) a JSON file containing profile data, account settings, usage history, and documents metadata; (b) a ZIP containing original uploaded document files owned by the user |
| 3    | Delivery          | Secure download link via email/in-app; expires 7 days; download event logged                                                                                                                                       |
| 4    | Direct transfer   | If data subject requests direct transfer to another controller, assess feasibility; if technically feasible via API, provide. Otherwise, the ZIP/JSON export fulfils the obligation.                               |
| 5    | Log               | Audit log entry                                                                                                                                                                                                    |

**Note:** Portability and access (Art. 15) are served by the same self-service export flow.

---

### 7.6 Right to Object (Art. 21)

**What the right covers:** Objecting to processing based on legitimate interests or for direct marketing purposes. For direct marketing, the objection is absolute.

| Scenario                                                  | Action                                                                                             | Technical Mechanism                                                                                                                                                                              |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Objection to direct marketing**                         | Honour immediately; no balancing test                                                              | Marketing unsubscribe in Settings → Notifications or via unsubscribe link in every Brevo marketing email; sets `marketing_consent = false`; removes from Brevo lists; stops all marketing emails |
| **Objection to processing based on legitimate interests** | DPO reviews; balancing test; cease processing unless compelling legitimate grounds or legal claims | Set `processing_objection_flag = true`; DPO reviews within 14 days; instructs Engineering on scope of cessation                                                                                  |
| **Objection to profiling / AI-based processing**          | Assess whether Kourti uses data for profiling; apply restriction if so                             | Same restriction flag mechanism as Art. 18                                                                                                                                                       |

---

### 7.7 Rights Related to Automated Decision-Making (Art. 22)

**What the right covers:** Not being subject to solely automated decisions producing legal or similarly significant effects, unless consent, contract necessity, or law permits.

**Kourti's current position:** [DPO to assess and document whether Kourti's AI features (contract analysis, negotiation agents, intelligence features) constitute automated decision-making with legal/significant effects — or whether they produce recommendations reviewed by human lawyers before action is taken.]

If Kourti's AI features are used in a way that falls under Art. 22:

- Disclose in privacy notice
- Allow data subjects to request human review of the AI output
- Document the safeguards

---

## 8. Request Response Templates

### Template D — Acknowledgement of DSAR (all rights)

**Subject:** Your Data Subject Request — Reference [DSAR-YYYY-NNN]

```
Dear [Name],

Thank you for contacting Kourti Legal regarding your personal data.

We have received your request to exercise your right to [access /
rectification / erasure / restriction / portability / object to processing]
on [DATE].

YOUR REFERENCE: [DSAR-YYYY-NNN]

NEXT STEPS
[If identity verification is needed:]
  To process your request, we need to verify your identity. Please
  [log in to your account and submit the request from Settings → Privacy /
  reply to this email from your registered address / provide the
  following information: ...]

[If identity already verified:]
  We will respond to your request by [DATE — 1 month from receipt].

  If your request is complex or we receive numerous requests at once,
  we may need up to 2 additional months. We will inform you if this
  applies.

If you have any questions, please contact:
Email: privacy@kourti.com
DPO: dpo@kourti.com

[Name — DPO or designated privacy team member]
Kourti Technologies Ltd
```

---

### Template D2 — Completion of DSAR (successful fulfilment)

**Subject:** Your Data Subject Request — Completed [DSAR-YYYY-NNN]

```
Dear [Name],

We have completed your data subject request (Ref: [DSAR-YYYY-NNN]).

RIGHT EXERCISED: [Access / Rectification / Erasure / etc.]
DATE COMPLETED: [DATE]

[TAILORED SECTION PER RIGHT TYPE:]

For ACCESS / PORTABILITY:
  Your data export is ready. You can download it here: [LINK]
  This link will expire on [DATE — 7 days from now].
  The export includes: [brief description of what is included].

For ERASURE:
  We have deleted your personal data from our systems as requested.
  The following data has been retained because we are legally required
  to do so: [description and legal basis, e.g., "billing records for 7
  years under Nigerian tax law"].

For RECTIFICATION:
  We have updated your personal data as follows: [description of changes].

For RESTRICTION:
  We have restricted processing of your personal data. We will notify
  you before lifting this restriction.

For OBJECTION (marketing):
  We have removed you from all marketing communications immediately.

YOUR RIGHT TO COMPLAIN
If you are not satisfied with how we have handled your request, you
have the right to lodge a complaint with the supervisory authority:
  Nigeria Data Protection Commission (NDPC): ndpc.gov.ng
  [EU DPA if applicable]

[Name — DPO or designated privacy team member]
Kourti Technologies Ltd
```

---

### Template E — Routing a Law-Firm Client DSAR to the Controller

**Subject:** Data Subject Request — Routing to Your Organisation [DSAR-YYYY-NNN]

```
Dear [Law Firm Contact Name],

We are writing to notify you that we have received a data subject request
that relates to personal data processed by Kourti Legal on your behalf,
for which your firm is the data controller.

DSAR REFERENCE: [DSAR-YYYY-NNN]
DATE RECEIVED BY KOURTI: [DATE]
YOUR RESPONSE DEADLINE: [DATE — 1 month from date received]

NATURE OF REQUEST: [Access / Rectification / Erasure / Restriction /
                    Portability / Objection]
REQUESTOR: [Name, if disclosed and verified] | [Contact: email/address]

We are forwarding this request to you as the controller of this data.
As your processor, Kourti is not authorised to fulfil this request
independently. You are responsible for assessing and responding to
this request directly to the data subject.

HOW KOURTI CAN ASSIST
We are ready to:
  - Extract or export the relevant data from our platform on your instruction
  - Apply deletion or restriction on your instruction
  - Provide you with technical details needed for your response
  - Act within [X business days] of your instruction

Please confirm receipt and let us know how you would like to proceed.

CONTACT
Privacy team: privacy@kourti.com
DPO: dpo@kourti.com
Phone: [phone]

[Name — DPO or CS Lead]
Kourti Technologies Ltd
```

---

## 9. Request Logging & Tracking

All DSARs must be logged in the platform audit log, which serves as the DSAR register. Minimum fields to record:

| Field                     | Description                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------ |
| `dsar_reference`          | Unique reference (format: DSAR-YYYY-NNN)                                             |
| `received_at`             | Date and time request received                                                       |
| `channel`                 | How received (in-app, email, post, other)                                            |
| `requestor_name`          | Name of data subject                                                                 |
| `requestor_email`         | Contact email                                                                        |
| `right_exercised`         | Access / Rectification / Erasure / Restriction / Portability / Objection / Automated |
| `identity_verified_at`    | Timestamp of identity verification                                                   |
| `verification_method`     | Method used                                                                          |
| `kourti_role`             | Controller / Processor                                                               |
| `routed_to_controller_at` | If processor: timestamp of routing to law firm                                       |
| `deadline`                | 1-month (or extended) deadline                                                       |
| `extension_notified_at`   | If extended: timestamp of notice to data subject                                     |
| `completed_at`            | Timestamp of fulfilment or refusal                                                   |
| `outcome`                 | Fulfilled / Partially fulfilled / Refused / Routed                                   |
| `refusal_reason`          | If refused: documented reason                                                        |
| `dpo_reviewed`            | Boolean; DPO sign-off for complex requests                                           |

**Retention:** DSAR log entries must be retained for a minimum of **3 years** from the date of the request (see `RETENTION_POLICY.md`).

---

## 10. Fees & Manifestly Unfounded / Excessive Requests

### 10.1 Standard Rule: Free of Charge

All DSARs must be handled **free of charge** as the default position.

### 10.2 Exceptions

Kourti may charge a **reasonable fee** or **refuse to act** if requests are **manifestly unfounded or excessive**, in particular where they are repetitive in character. Criteria:

| Indicator                | Explanation                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| **Manifestly unfounded** | Clear lack of good-faith purpose; submitted to harass or disrupt; data subject has acknowledged no legitimate purpose         |
| **Excessive**            | Repeated requests for the same data without new grounds; requests clearly disproportionate to any legitimate privacy interest |

**Process for manifestly unfounded / excessive requests:**

1. DPO must make the determination — **never unilaterally decide without DPO sign-off.**
2. Inform the data subject within 1 month of receipt.
3. Either: charge a reasonable fee (calculated as cost of providing the response); or decline to act.
4. Document the determination fully in the request log.
5. Inform the data subject of their right to complain to a supervisory authority and seek judicial remedy.

**Caution:** The bar for refusing a request is high. Default to fulfilling requests when in doubt.

---

## 11. NDPR-Specific Notes

The Nigeria Data Protection Act 2023 and the NDPR Framework establish equivalent rights to GDPR for Nigerian data subjects. Key operational points:

- Rights of access, rectification, erasure, restriction, portability, and objection all apply.
- The NDPC is the supervisory authority; data subjects may escalate complaints to the NDPC.
- Kourti, as a data controller/processor for Nigerian users, must comply with NDPA requirements including designating a Data Protection Compliance Organisation (DPCO) or DPO as applicable.
- [DPO to confirm DPCO registration status and ensure DPO designation is in compliance with NDPA §32.]

---

## 12. Staff Training & Awareness

- All Kourti staff must be trained to **recognise a DSAR** when received by any channel and route it to the DPO or privacy team immediately.
- Staff must not attempt to fulfil or refuse DSARs independently.
- Training records to be maintained by DPO.
- This procedure to be reviewed and re-communicated annually, or upon material platform changes affecting personal data processing.

---

## 13. Quick-Reference Decision Guide

```
REQUEST RECEIVED
│
├─ Is the requestor a Kourti platform user (controller scenario)?
│     └─ YES → Proceed with this procedure; DPO handles
│
├─ Is the requestor a law firm's client (processor scenario)?
│     └─ YES → Route to controlling law firm (Template E); assist firm
│
└─ Unclear?
      └─ Escalate to DPO immediately

IDENTITY VERIFIED?
├─ Via authenticated session → proceed
├─ Via email verification → proceed
├─ Cannot verify → request verification; do not proceed until verified
└─ Third party? → require written authorisation

DEADLINE TRACKING
├─ Start clock from receipt (or verification if later)
├─ Standard: 1 month
├─ Complex: up to 3 months — notify requestor within month 1
└─ Log all dates in audit log

RIGHT EXERCISED → SELF-SERVICE?
├─ Access / Portability → "Export my data" (Settings → Privacy)
├─ Erasure → "Delete my account" (Settings → Privacy) + DPO oversight
├─ Rectification → Profile edit (Settings → Profile) or DPO for non-UI fields
├─ Objection (marketing) → Marketing unsubscribe (Settings → Notifications)
└─ All others → DPO coordinates manual fulfilment
```

---

_Last updated: 2026-05-31 | Next review: 2027-05-31_
_Maintained by: [DPO — name TBD]_
