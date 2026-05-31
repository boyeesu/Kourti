> **DRAFT — FOR INTERNAL USE ONLY**
> This document has not been reviewed by qualified legal counsel or a certified Data Protection Officer.
> **Do not treat as legal advice. Review and approve with a qualified DPO and Nigerian/EU privacy counsel before operationalising.**

---

# Data Breach Incident Response Runbook

**Document owner:** [DPO / Legal Lead — name TBD]
**Version:** 0.1-DRAFT
**Last reviewed:** 2026-05-31
**Next review due:** 2027-05-31

**Cross-references:**

- [`docs/compliance/DSAR_PROCEDURE.md`](./DSAR_PROCEDURE.md) — affected data subjects may subsequently exercise DSAR rights
- [`docs/compliance/RETENTION_POLICY.md`](./RETENTION_POLICY.md) — retention periods determine scope and severity of exposed data
- [`docs/compliance/ROPA.md`](./ROPA.md) — Record of Processing Activities; use to identify processing categories affected by a breach

---

## 1. Purpose & Scope

This runbook documents Kourti Legal's procedures for detecting, assessing, containing, notifying, and learning from personal data breaches. It applies to:

- All personal data processed on Kourti's platform (registered users, law-firm employees, and — in Kourti's role as **processor** — personal data belonging to law-firm clients uploaded or generated within the platform).
- All Kourti staff, contractors, and third-party sub-processors.

**Kourti's dual role:**

| Role           | When                                                            | Implication                                                                                                                                        |
| -------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Controller** | Data about Kourti's own registered users (lawyers, firm admins) | Kourti bears direct notification duties to supervisory authorities and affected individuals                                                        |
| **Processor**  | Data about law-firm clients processed on behalf of the firm     | Kourti must notify the **law firm (controller)** without undue delay (target ≤ 48 hours) so the firm can discharge _its_ Art. 33/34 or NDPR duties |

---

## 2. Definitions

### 2.1 Personal Data Breach

Any accidental or unlawful **destruction, loss, alteration, unauthorised disclosure of, or access to**, personal data transmitted, stored, or otherwise processed (GDPR Art. 4(12); NDPR Framework §1.3(xix)).

### 2.2 Breach Types

| Type                       | Description                                     | Example                                                                            |
| -------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Confidentiality breach** | Unauthorised or accidental disclosure or access | API bug exposes contract documents to wrong firm; employee exfiltrates user list   |
| **Integrity breach**       | Unauthorised or accidental alteration of data   | Ransomware corrupts case records; injection attack modifies uploaded documents     |
| **Availability breach**    | Accidental or unauthorised loss of access       | Database deletion without backup; DDoS taking platform offline for extended period |

A single incident may involve multiple types.

### 2.3 Special Categories

Data warranting elevated sensitivity under GDPR Art. 9 / NDPR: data revealing racial or ethnic origin, health, biometric, political, religious data. Legal professional privilege data (client matters, legal advice) should be treated with equivalent sensitivity even if not strictly a special category.

---

## 3. Roles & Responsibilities

| Role                              | Placeholder                                 | Primary Responsibilities                                                                                             |
| --------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Incident Lead (IL)**            | [Engineering Lead — name TBD]               | Overall incident coordination; declares severity; owns 72-hour clock; escalates                                      |
| **Data Protection Officer (DPO)** | [DPO — name TBD; email: dpo@kourti.com]     | Legal assessment; decides notification thresholds; drafts authority/individual notices; signs off on breach register |
| **Engineering On-call**           | [Eng on-call — paged via Railway/PagerDuty] | Technical containment, forensics, evidence preservation, recovery                                                    |
| **Legal Counsel**                 | [External counsel — name TBD]               | Advises on notification obligations; reviews notice drafts; coordinates with regulatory authorities                  |
| **Comms / Customer Success**      | [CS Lead — name TBD]                        | Customer (law-firm) notification; public-facing communication if required; coordinates with Legal                    |
| **CEO / Executive Sponsor**       | [CEO — name TBD]                            | Notified for all Severity 1 incidents; authorises external disclosures; liaison with board/investors                 |

**Escalation matrix:**

```
Detector (any staff/system alert)
  └─▶ Incident Lead (immediate, 24/7)
        └─▶ DPO (within 1 hour of detection)
              └─▶ Legal Counsel (within 2 hours for Sev 1–2)
                    └─▶ CEO (Sev 1 only, within 2 hours)
```

---

## 4. Breach Classification: Severity Matrix

Severity is determined by combining **Likelihood of Harm** and **Severity of Harm** to affected individuals.

### 4.1 Harm Severity Factors

- Volume of records affected (higher = worse)
- Sensitivity of data categories (special categories, legal privilege, authentication credentials = highest)
- Nature of affected individuals (law-firm clients vs. platform users)
- Whether data can be weaponised (identity theft, fraud, extortion, discrimination)
- Reversibility of harm

### 4.2 Severity Matrix

|                       | **Low Severity of Harm**                                                 | **Medium Severity of Harm**                                                      | **High Severity of Harm**                                                        |
| --------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Low Likelihood**    | **SEV 4** — Monitor; record internally; no notification likely required  | **SEV 3** — Internal review; notify DPO; assess 72h clock                        | **SEV 2** — Notify supervisory authority; assess individual notification         |
| **Medium Likelihood** | **SEV 3** — Internal review; notify DPO; assess 72h clock                | **SEV 2** — Notify supervisory authority; assess individual notification         | **SEV 1** — Notify authority + affected individuals + customers; escalate to CEO |
| **High Likelihood**   | **SEV 2** — Notify supervisory authority; assess individual notification | **SEV 1** — Notify authority + affected individuals + customers; escalate to CEO | **SEV 1** — Notify authority + affected individuals + customers; escalate to CEO |

### 4.3 Severity Definitions

| Level                | Description                                                                                                             | Notification Required?                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **SEV 1 — Critical** | Large-scale exposure; special category / legal-privilege data; authentication credentials; data enabling identity theft | YES — supervisory authority + data subjects + customer-controllers; escalate to CEO                      |
| **SEV 2 — High**     | Significant exposure of personal data with moderate-to-high harm potential; affects >50 individuals                     | YES — supervisory authority (72h); assess individual notification                                        |
| **SEV 3 — Medium**   | Limited exposure; low harm potential; quickly contained; ≤50 individuals                                                | POSSIBLE — DPO decides; record in breach register; notify customer-controllers if their data is affected |
| **SEV 4 — Low**      | Negligible harm risk; no sensitive data; immediately contained; no evidence of exfiltration                             | NO formal notification — record internally; monitor for recurrence                                       |

> **Default assumption:** When in doubt, escalate severity upward and presume notification is required until assessed otherwise. The cost of over-notifying is lower than the cost of under-notifying.

---

## 5. The 72-Hour Clock

> **The clock starts the moment Kourti (in any role) becomes "aware" of a breach — meaning there is a reasonable degree of certainty that an incident involving personal data has occurred.**

```
T+0h   ─ Awareness / Detection
T+1h   ─ DPO and Incident Lead briefed; severity assessment begins
T+4h   ─ Initial containment actions in place; breach register entry created
T+24h  ─ Interim incident report to DPO; preliminary notification to customer-controllers (target)
T+48h  ─ Customer-controllers notified (HARD TARGET)
T+72h  ─ Supervisory authority notification filed (GDPR Art. 33 / NDPR deadline)
T+72h+ ─ Individual data subject notification (if warranted) — "without undue delay" (no hard deadline but act promptly)
```

### 5.1 Phased / Partial Notification

If full information is not available within 72 hours, file an **initial notification** to the supervisory authority with the information known at the time. Supplement with further information **as it becomes available** (GDPR Art. 33(4)). Clearly flag this in the notification form.

**Never delay notification past 72 hours solely to gather complete information.**

Reasons for any delay beyond 72 hours must be documented.

---

## 6. Response Phases

### Phase 1 — DETECT

**Trigger:** Any of the following:

- Automated alert from Railway infrastructure / application monitoring / Sentry
- Staff member observes anomaly
- Customer or data subject report
- Third-party security researcher disclosure
- Law enforcement notification

**Actions:**

1. Any staff member discovering a potential breach **must immediately report** to the Incident Lead via [incident reporting channel — e.g., Slack `#security-incidents` or email: incidents@kourti.com].
2. Do **not** attempt to investigate or contain independently without notifying the IL first.
3. Preserve all evidence (logs, screenshots, error messages) before taking containment action.
4. Incident Lead creates the initial breach register entry in the `breach_incidents` database table (see §9).

**Detection timestamp = T+0h**

---

### Phase 2 — TRIAGE & ASSESS

**Owner:** Incident Lead + DPO (within 1 hour of detection)

**Actions:**

1. Confirm whether a personal data breach has actually occurred (vs. false alarm).
2. Identify: what data is affected? how many individuals? which customer-controllers are affected?
3. Assign severity level using the matrix in §4.
4. Brief Legal Counsel (Sev 1–2) and CEO (Sev 1).
5. Identify whether affected data belongs to:
   - Kourti's own users (Kourti = **controller** → direct notification duties)
   - Law-firm client data (Kourti = **processor** → notify the law firm)
6. Start the 72-hour notification tracker.

**Output:** Completed initial severity assessment; breach register updated.

---

### Phase 3 — CONTAIN

**Owner:** Engineering On-call + Incident Lead

**Actions:**

1. **Immediately isolate** affected systems, accounts, or data stores without destroying evidence.
2. Revoke compromised credentials, API keys, tokens.
3. Block unauthorised access vectors (firewall rules, account lockouts).
4. If third-party sub-processor is the source: notify sub-processor; instruct them to contain; engage contractual DPA obligations.
5. Preserve: server logs, access logs, database audit logs, Railway deployment logs, application error logs. **Do not wipe or overwrite** until forensics are complete.
6. Document all containment actions with timestamps in the breach register.

---

### Phase 4 — ERADICATE

**Owner:** Engineering On-call

**Actions:**

1. Identify and eliminate root cause (vulnerability, misconfiguration, compromised account).
2. Patch, reconfigure, or redeploy as required.
3. Verify root cause is eliminated before proceeding.
4. Conduct internal code/config review to identify similar vulnerabilities.

---

### Phase 5 — RECOVER

**Owner:** Incident Lead + Engineering

**Actions:**

1. Restore affected systems/data from verified clean backups.
2. Validate data integrity post-restoration.
3. Implement enhanced monitoring on restored systems.
4. Confirm platform is functioning correctly before declaring incident closed.
5. Keep customer-controllers informed of recovery progress.

---

### Phase 6 — NOTIFY

**Owner:** DPO (authority notifications) + Comms/CS (customer notifications) + Legal (review all drafts)

See §7 for WHO to notify, §8 for templates.

---

### Phase 7 — POST-INCIDENT REVIEW

**Owner:** Incident Lead; all relevant parties

**Timing:** Within 14 days of incident closure.

**Actions:**

1. Conduct a full root-cause analysis (RCA).
2. Review the timeline: was the 72-hour obligation met? Were customer-controllers notified within 48h? Were individual notifications timely?
3. Identify systemic weaknesses; produce a remediation action plan with owners and deadlines.
4. Update this runbook, the ROPA, DSAR Procedure, and Retention Policy if impacted processes are revealed.
5. Present findings to CEO/board (Sev 1–2).
6. Document lessons learned in the breach register.

---

## 7. Notification Obligations

### 7.1 Customer-Controllers (Law Firms) — PROCESSOR DUTY

**Deadline: Without undue delay; TARGET ≤ 48 hours from Kourti becoming aware**

As a data processor, Kourti is contractually and legally required to notify affected law-firm customers promptly so they can discharge their own obligations.

**Contact method:** Primary account holder email on file + Comms team direct contact where available. For Sev 1 incidents: phone call to firm's designated contact, followed by written notice.

**Content (see Template C in §8):**

- Nature of the breach
- Categories and approximate number of individuals and records affected
- Contact point for further information (Kourti DPO)
- What Kourti has done / is doing to contain and remediate
- Confirmation of what information Kourti can provide to assist the firm's own notification

---

### 7.2 Supervisory Authorities — 72-HOUR DUTY

#### Nigeria Data Protection Commission (NDPC)

**Applicable law:** Nigeria Data Protection Act 2023 (NDPA) / NDPR Framework
**Contact:**

- Website: [https://ndpc.gov.ng](https://ndpc.gov.ng)
- Notification portal: [https://ndpc.gov.ng — check portal for current breach notification form]
- Email: info@ndpc.gov.ng _(confirm current notification email with NDPC directly before use)_
- Postal: [NDPC address — TBD; confirm with NDPC]\*
- **Deadline:** "Without undue delay" — align with GDPR 72-hour standard for operational consistency

#### Relevant EU Supervisory Authority (for EU data subjects)

**Applicable law:** GDPR Art. 33
**Lead DPA:** Determined by the establishment or, for non-EU processors, the lead supervisory authority in the member state of the main establishment of the EU controller (the law firm). Kourti should coordinate with the affected law firm.

**Common EU DPAs:**

- **Irish DPC** (Data Protection Commission): [https://www.dataprotection.ie](https://www.dataprotection.ie) | +353 57 8684800
- **UK ICO** (post-Brexit, if UK data subjects): [https://ico.org.uk](https://ico.org.uk) | 0303 123 1113

**Content (see Template A in §8):**

- Nature of the breach and approximate number of affected persons/records
- Likely consequences
- Measures taken / proposed
- DPO contact details

---

### 7.3 Affected Data Subjects

**Applicable law:** GDPR Art. 34 (when breach likely results in high risk); NDPA equivalent
**Deadline:** "Without undue delay" — as soon as practicable after authority notification

**When required:** When the breach is "likely to result in a high risk to the rights and freedoms of natural persons" (GDPR Art. 34). This generally aligns with SEV 1 and some SEV 2 incidents.

**Exceptions (notification not required to individuals):**

- Appropriate technical protection measures were applied (e.g., encryption with keys not compromised)
- Subsequent measures have ensured high risk is no longer likely to materialise
- Notifying individuals would involve disproportionate effort — in this case, a public communication instead

**Method:** Email to affected registered users (via platform); if law-firm clients, coordinate with the law firm as they hold the direct relationship.

**Content (see Template B in §8):**

- Plain language description of the breach
- DPO contact details
- Likely consequences
- Measures taken

---

## 8. Notification Templates

### Template A — Notification to Supervisory Authority (NDPC / DPA)

```
PERSONAL DATA BREACH NOTIFICATION

To: [Authority name]
From: Kourti Technologies Ltd
Date: [DATE]
Reference (internal): [BREACH-YYYY-NNN]

1. ORGANISATION DETAILS
   Name: Kourti Technologies Ltd
   Address: [Registered address]
   DPO: [DPO name], dpo@kourti.com
   Phone: [DPO phone]

2. NATURE OF THE BREACH
   [Describe the type of breach: confidentiality/integrity/availability. State
   approximate date/time of breach and when Kourti became aware.]

3. CATEGORIES AND APPROXIMATE NUMBER OF DATA SUBJECTS AFFECTED
   Categories: [e.g., law firm users, law firm clients]
   Approximate number of individuals: [N]
   Approximate number of records: [N]
   Data categories: [e.g., names, email addresses, legal documents, ...]

4. LIKELY CONSEQUENCES
   [Describe potential harm to affected individuals.]

5. MEASURES TAKEN OR PROPOSED
   [Describe containment, remediation, and any measures to mitigate harm.]

6. IS THIS AN INITIAL OR SUPPLEMENTARY NOTIFICATION?
   [ ] Initial notification — further information to follow
   [ ] Supplementary to notification filed [DATE]

7. ADDITIONAL INFORMATION
   [Anything else relevant, including whether Kourti is acting as controller
   or processor in relation to the affected data.]

Signed: [Incident Lead / DPO name]
Date: [DATE]
```

---

### Template B — Notification to Affected Data Subjects

**Subject:** Important notice about the security of your Kourti Legal account

```
Dear [Name / "Kourti Legal User"],

We are writing to inform you of a data security incident that may have
affected your personal information on the Kourti Legal platform.

WHAT HAPPENED
[Plain-language description of the breach, avoiding technical jargon. State
approximate dates.]

WHAT INFORMATION WAS INVOLVED
[List the categories of data affected, e.g., name, email address, documents
uploaded. Do NOT overstate what was affected.]

WHAT WE ARE DOING
[Describe steps already taken: containment, remediation, additional security
measures.]

WHAT YOU CAN DO
- [Change your password immediately at: https://app.kourti.com/settings]
- [Enable two-factor authentication]
- [Contact us if you notice any suspicious activity]
- [Monitor your accounts for unusual activity]

FOR MORE INFORMATION
Please contact our Data Protection Officer:
Email: dpo@kourti.com
Phone: [DPO phone]

We sincerely apologise for any concern this may cause.

[Signed — CEO or DPO name]
Kourti Technologies Ltd
```

---

### Template C — Notification to Customer-Controller (Law Firm)

**Method:** Email to account holder + CS direct contact; phone call for Sev 1
**Subject:** [URGENT] Personal Data Breach Notification — Your Kourti Legal Account

```
Dear [Firm contact name],

We are writing to notify you, as a controller of personal data processed
by Kourti Legal, that we have become aware of a personal data breach that
may affect data processed on your behalf.

INTERNAL REFERENCE: [BREACH-YYYY-NNN]
DATE KOURTI BECAME AWARE: [DATE/TIME UTC]

NATURE OF THE BREACH
[Description of the breach type and how it occurred.]

DATA AFFECTED
Approximate number of your clients/individuals whose data may be affected: [N]
Categories of data: [e.g., names, contact details, legal documents, ...]

CONTAINMENT & REMEDIATION
[What Kourti has done or is doing to contain and remediate the breach.]

YOUR OBLIGATIONS
As the data controller for this personal data, you may have notification
obligations to your supervisory authority and/or the affected individuals
under GDPR and/or the NDPA/NDPR. We recommend you seek legal advice
immediately.

HOW KOURTI CAN ASSIST
We will provide you with:
- Full technical details of the breach on request
- Logs and evidence necessary for your own investigation
- A written incident report within [5 business days]
- A designated point of contact for your DPO: dpo@kourti.com

CONTACT
DPO: dpo@kourti.com | [Phone]
Incident Lead: [Contact for technical queries]

Please confirm receipt of this notice. We will provide updates as further
information becomes available.

[DPO / CS Lead name]
Kourti Technologies Ltd
```

---

## 9. Breach Register

All incidents — regardless of whether notification is required — must be recorded in the `breach_incidents` database table (implemented in `backend-node/src/db/bootstrap.ts`).

**Minimum required fields:**

| Field                           | Description                                           |
| ------------------------------- | ----------------------------------------------------- |
| `id`                            | Unique incident reference (format: BREACH-YYYY-NNN)   |
| `detected_at`                   | Timestamp of detection (= T+0h)                       |
| `reported_by`                   | Who reported the breach                               |
| `breach_type`                   | Confidentiality / Integrity / Availability / Multiple |
| `description`                   | Factual description of what occurred                  |
| `data_categories`               | Categories of personal data affected                  |
| `approx_subjects`               | Approximate number of affected individuals            |
| `severity`                      | SEV 1–4                                               |
| `controller_or_processor`       | Kourti's role in relation to affected data            |
| `affected_customers`            | List of law-firm customers whose data is affected     |
| `containment_actions`           | Steps taken, with timestamps                          |
| `authority_notified_at`         | Timestamp of supervisory authority notification       |
| `authority_notified_to`         | Which authority(ies)                                  |
| `customers_notified_at`         | Timestamp of customer-controller notifications        |
| `subjects_notified_at`          | Timestamp of individual notifications (if applicable) |
| `notification_exemption_reason` | If notification was not made, documented reason       |
| `dpo_sign_off`                  | DPO name + date of sign-off                           |
| `rca_completed_at`              | Date root-cause analysis was completed                |
| `lessons_learned`               | Summary of post-incident review findings              |

**Retention:** Breach register entries must be retained for a minimum of **5 years** from the date of the incident (see `RETENTION_POLICY.md`).

---

## 10. Evidence Preservation

**Do not delete, overwrite, or modify any system logs, access logs, or data stores until forensic preservation is complete.**

Evidence to preserve immediately:

- [ ] Application logs (Sentry, Railway deployment logs)
- [ ] Database audit logs (PostgreSQL logs, audit trail table)
- [ ] Authentication / session logs
- [ ] API access logs (request logs for affected endpoints)
- [ ] Infrastructure logs (Railway networking, ingress logs)
- [ ] Any emails, messages, or communications related to the incident
- [ ] Screenshots of anomalous system states

Store evidence in a dedicated, access-controlled location with integrity hashing (SHA-256 checksums). Document chain of custody.

---

## 11. Sub-Processor Breaches

If a **Kourti sub-processor** (e.g., Resend, Brevo, Railway, file storage provider) notifies Kourti of a breach affecting Kourti-processed data:

1. Treat as an incoming breach report at T+0h.
2. Obtain from the sub-processor: their incident report, scope of affected data, and containment actions.
3. Apply this runbook from Phase 2 (Triage) onward.
4. The 72-hour clock runs from the moment Kourti receives notification from the sub-processor (or becomes aware by any other means).

---

## 12. Quick-Reference Checklist

Use this checklist for every incident. Tick items as completed and record timestamps.

### Immediately (T+0–1h)

- [ ] Incident detected and reported to Incident Lead
- [ ] **72-HOUR CLOCK STARTED** — record start time: ****\_\_\_****
- [ ] DPO notified
- [ ] Initial breach register entry created in `breach_incidents` table
- [ ] Legal Counsel notified (Sev 1–2)
- [ ] CEO notified (Sev 1)

### T+1–4h

- [ ] Severity assessment completed (SEV **\_**)
- [ ] Kourti's role confirmed: Controller / Processor / Both
- [ ] Affected customer-controllers identified
- [ ] Containment actions initiated
- [ ] Evidence preservation in place — logs secured

### T+4–24h

- [ ] Root cause hypothesis identified
- [ ] Eradication steps underway
- [ ] Interim update sent to DPO
- [ ] Draft customer-controller notifications prepared

### T+24–48h

- [ ] **Customer-controller notifications sent** — record timestamp: ****\_\_\_****
- [ ] Recovery plan confirmed

### T+48–72h

- [ ] **Supervisory authority notification filed** (if required) — record timestamp: ****\_\_\_****
- [ ] Authority notified: NDPC / [EU DPA name]: ****\_\_\_****

### Post-72h

- [ ] Individual data subject notifications sent (if required) — record timestamp: ****\_\_\_****
- [ ] Breach register entry updated with all notification timestamps
- [ ] DPO sign-off on breach register obtained
- [ ] Post-incident review scheduled (within 14 days)

### Post-Incident (within 14 days)

- [ ] Root-cause analysis completed
- [ ] Lessons learned documented in breach register
- [ ] Remediation action plan issued with owners and deadlines
- [ ] This runbook, ROPA.md, RETENTION_POLICY.md updated if required
- [ ] Board/investor briefing (Sev 1)

---

_Last updated: 2026-05-31 | Next review: 2027-05-31_
_Maintained by: [DPO — name TBD]_
