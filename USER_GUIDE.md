# JuryPanel — BAUST CSE Fest User Guide

**Complete Step-by-Step Website Manual for Administrators & Invited Judges**

---

## Table of Contents

1. [Introduction & Key Concepts](#1-introduction--key-concepts)
2. [Getting Started & Logging In](#2-getting-started--logging-in)
   - [First-Time Administrator Setup](#21-first-time-administrator-setup)
   - [Signing In (Admin Portal vs. Judge Portal)](#22-signing-in-admin-portal-vs-judge-portal)
   - [Navigation, Sidebar & Mobile Use](#23-navigation-sidebar--mobile-use)
3. [Administrator Guide — Complete Event Workflow](#3-administrator-guide--complete-event-workflow)
   - [Step 1: Overview on the Fest Operations Dashboard](#31-step-1-overview-on-the-fest-operations-dashboard)
   - [Step 2: Adding & Managing Judges](#32-step-2-adding--managing-judges)
   - [Step 3: Bulk Importing Judges via CSV](#33-step-3-bulk-importing-judges-via-csv)
   - [Step 4: Sending & Managing Fest Invitations](#34-step-4-sending--managing-fest-invitations)
   - [Step 5: Creating Competitions & Time Slots](#35-step-5-creating-competitions--time-slots)
   - [Step 6: Allocating Primary & Backup Judges](#36-step-6-allocating-primary--backup-judges)
   - [Step 7: Competition-Day Attendance Tracking](#37-step-7-competition-day-attendance-tracking)
   - [Step 8: Backup Activation, Replacements & Late Arrivals](#38-step-8-backup-activation-replacements--late-arrivals)
   - [Step 9: Reports & CSV Exports](#39-step-9-reports--csv-exports)
   - [Step 10: System Settings & Admin Management](#310-step-10-system-settings--admin-management)
4. [Judge Portal Guide — Complete Judge Workflow](#4-judge-portal-guide--complete-judge-workflow)
   - [Judge Dashboard](#41-judge-dashboard)
   - [Responding to Your Fest Invitation](#42-responding-to-your-fest-invitation)
   - [Accepting, Declining, or Withdrawing from Assignments](#43-accepting-declining-or-withdrawing-from-assignments)
   - [Viewing Timetable & Declaring Slot Availability](#44-viewing-timetable--declaring-slot-availability)
   - [Updating Profile & Changing Password](#45-updating-profile--changing-password)
5. [Status Badge Reference Glossary](#5-status-badge-reference-glossary)
6. [Special Scenarios & Troubleshooting FAQ](#6-special-scenarios--troubleshooting-faq)

---

## 1. Introduction & Key Concepts

**JuryPanel** (`JuryPanel — BAUST CSE Fest Judge Management`) is the official portal for organizing and managing judges across all BAUST CSE Fest competitions. It serves two distinct user roles:

- **Fest Administrators (`ADMIN`)**: Configure competitions and time slots, add judges (individually or via CSV), issue portal login credentials, send official fest invitations, allocate primary and backup judges without time conflicts, track competition-day attendance, activate backup replacements, and export reports.
- **Invited Judges (`JUDGE`)**: Sign in to accept or decline their official fest invitation, declare time-slot availability, accept/decline/withdraw from individual competition slot assignments, inspect their judging timetable, and maintain their profile.

### Important Operational Rules to Know First

1. **Account Creation and Fest Invitations Are Separate Steps**
   - Adding a judge (manually or via CSV bulk import) creates their **Portal Login Account** immediately, but it does **not** automatically send them a fest invitation.
   - A newly added judge starts with Portal Account = `ACCOUNT CREATED` and Invitation Status = `NOT INVITED`.
   - You must explicitly send a fest invitation (from the **Judges Directory** or **Invitations** page) when ready.

2. **Allocation Eligibility**
   - Only **active** judges whose fest invitation status is **`ACCEPTED`** appear as eligible candidates on the **Judge Allocation** page.
   - Judges who are `NOT INVITED`, `PENDING`, `REJECTED`, `EXPIRED`, `CANCELLED`, or `DEACTIVATED` cannot be assigned to competition slots.

3. **External vs. Faculty Judges**
   - **`EXTERNAL`**: Guest judges from other universities, companies, or organizations. They can be assigned as **`PRIMARY`** judges.
   - **`FACULTY`**: BAUST faculty members. They can be assigned as **`PRIMARY`** judges **or** as **`BACKUP`** (standby/replacement) judges. Only `FACULTY` judges are eligible for backup roles.

4. **One Fest Invitation per Judge**
   - Each judge has a single fest invitation record. If an invitation expires (`EXPIRED`) or is cancelled (`CANCELLED`), you can reopen/resend it with a new future deadline without losing history.

5. **Audit-Safe History Preservation**
   - Withdrawn assignments, declined slots, replaced judges, cancelled competitions/slots, and deactivated judge assignments are **never deleted**—they remain archived with their status and reason for full accountability and reporting.

---

## 2. Getting Started & Logging In

### 2.1 First-Time Administrator Setup

When launching a fresh installation with zero administrator accounts in the database, the login screen automatically opens **Initialize Administrator Account**:

1. Enter **Full Name** (e.g., `Dr. Rahman (Convener)`).
2. Enter **Official Email** (e.g., `admin@baust.edu.bd`).
3. Enter **Password** (minimum **8 characters**, maximum 128).
4. Click **Create Administrator & Sign In**.

> **Note:** Once the first administrator account exists, this bootstrap form locks permanently. Additional administrators can only be created later from **Settings → Add Administrator** by an existing administrator.

---

### 2.2 Signing In (Admin Portal vs. Judge Portal)

Public self-registration is disabled. Every user must sign in through the segmented login card:

1. Open the website. You will see two portal tabs at the top of the card:
   - **Admin Portal** (`#/admin/login`) — for organizing committee administrators.
   - **Judge Portal** (`#/judge/login`) — for External and Faculty judges.
2. Select the tab matching your account role.
   > **Role Lock:** Signing in with a Judge account on the **Admin Portal** tab (or an Admin account on the **Judge Portal** tab) will be rejected with a role-restriction error. Switch to the correct tab and try again.
3. Enter your **Email Address** and **Password**.
4. Click **Sign In to Admin Dashboard** (or **Sign In to Judge Portal**).

**Password Security Note:** Passwords generated automatically when creating judges are shown **once** to the administrator and are never stored in plaintext. If a judge forgets their password, an administrator can reset it from **Judges → Reset PW**.

---

### 2.3 Navigation, Sidebar & Mobile Use

- **Sidebar Navigation:** Located on the left side of the workspace, organized into labeled sections (`Overview`, `People & Invitations`, `Event & Allocation`, `Competition Day`, `System` for Admins; `Judge Portal` for Judges).
- **Hamburger Menu Button (`☰`)**: Located at the top-left of the top bar:
  - On **Desktop**: Collapses or expands the sidebar into a compact icon rail.
  - On **Mobile / Tablet (≤ 768px)**: Opens or closes the slide-over navigation drawer.
- **Topbar Quick Action:**
  - **Admin** sees a shortcut button to **Attendance** (`#/admin/attendance`).
  - **Judge** sees a shortcut button to **My Schedule** (`#/judge/schedule`).
- **Sign Out:** Click **Sign Out** at the bottom of the left sidebar to end your session cleanly.

---

## 3. Administrator Guide — Complete Event Workflow

The recommended end-to-end setup order for a new fest is:
**Add Judges → Send Invitations → Create Competitions & Time Slots → Allocate Judges (once invitations are accepted) → Track Attendance & Manage Backups on Event Day → Export Reports.**

---

### 3.1 Step 1: Overview on the Fest Operations Dashboard

**Location:** Sidebar → **Overview → Dashboard** (`#/admin/dashboard`)

The Dashboard provides a live operational snapshot:

- **Top Quick Buttons:**
  - **Manage Invitations** — jumps to `#/admin/invitations`.
  - **Allocate Judges** — jumps to `#/admin/allocation`.
- **6 KPI Summary Cards:**
  1. **Total Judges** — total count plus breakdown of External, Faculty, and active judges.
  2. **Invitations Sent** — total sent plus Accepted, Pending, and Rejected counts.
  3. **Total Competitions** — total count plus Active and Cancelled competitions.
  4. **Judge Assignments** — active primary + activated backup count, plus Primary, Standby, and Activated Backup breakdown.
  5. **Attendance Summary** — Present count plus Absent, Late, and Excused breakdown.
  6. **Vacant Judge Positions** — remaining unfilled primary judge seats across active slots (highlighted in amber when > 0, green when 0), plus Expired Invitations count.
- **Live Charts:**
  - **Invitation Status** bar chart (`Accepted`, `Pending`, `Rejected`, `Expired`).
  - **Judge Attendance** bar chart (`Present`, `Absent`, `Late`, `Excused`).
- **Bottom Tables:**
  - **Competition Slot Coverage:** Lists each active slot with `Primary` (`filled/required`), `Backup` standby count, `Vacant` badge (`N VACANT` or `CONFIRMED`), and a direct **Allocate** button.
  - **Recent System Activity:** Shows the latest system audit events with actor and timestamp, plus a **View Reports** link.

---

### 3.2 Step 2: Adding & Managing Judges

**Location:** Sidebar → **People & Invitations → Judges** (`#/admin/judges`)

#### Searching & Filtering the Judges Directory

Use the filter bar above the table to narrow down judges:
- **Search box:** Live search across judge name, email, institution, and designation.
- **Type filter:** `All Types`, `External`, `Faculty`.
- **Status filter:** `All Statuses`, `Active Only`, `Deactivated`.
- **Invitation filter:** `All Invitations`, `Not Invited`, `Pending`, `Accepted`, `Rejected`, `Expired`, `Cancelled`.

#### Adding a Single Judge

1. Click **Add Judge** (top-right primary button).
2. Fill in the **Add New Judge** form:
   - **Full Name** *(required)*
   - **Email Address** *(required, must be unique across all judges and users)*
   - **Phone Number** *(optional)*
   - **Judge Type** *(required)*: Choose `EXTERNAL` or `FACULTY`.
   - **Designation** *(required, e.g., Associate Professor / Senior Engineer)*
   - **Institution / Organization** *(required, e.g., BAUST / BUET)*
   - **Areas of Expertise** *(optional, e.g., Robotics, Algorithms, Web Systems)*
3. **Initial Password Option:**
   - **Default (Recommended):** Leave *"Specify a custom initial password instead of auto-generating"* unchecked. The system creates a strong 14-character temporary password automatically.
   - **Custom Password:** Check the box and enter a password (minimum **8 characters**).
4. Click **Create Judge & Account**.
5. **Save the One-Time Credentials:**
   - If auto-generated, the **Judge & Portal Account Created** modal displays the login email and **One-Time Temporary Password**.
   - Click **Copy Credentials** and share them securely with the judge. *(This temporary password cannot be viewed again once closed.)*
   - From this modal, you can either click **Done** (invite later) or **Send Fest Invitation** immediately.

#### Editing a Judge Profile

1. Click **Edit** on a judge's row (or **Edit Profile** inside their detail page).
2. Update any profile fields. Updating **Name** or **Email** also syncs their linked login account.
3. **Important Restriction:** You **cannot** change a judge's type from `FACULTY` to `EXTERNAL` while they hold active `BACKUP` assignments. Withdraw or replace those backup assignments first.

#### Resetting a Judge's Password (or Creating a Missing Account)

1. Click **Reset PW** (or **Set Account** if the row shows `NO ACCOUNT`) on the judge's row.
2. Keep **Auto-generate a secure 14-character temporary password** checked, or uncheck it to enter a custom password (min 8 chars).
3. Click **Save Credentials**.
   - Resetting a password **immediately revokes all active login sessions** for that judge.
   - If auto-generated, copy the temporary password from the confirmation modal.

#### Deactivating & Reactivating a Judge

- **Deactivate:** Click **Deactivate** on an active judge's row, review/edit the **Reason**, and click **Confirm Deactivation**.
  - Immediately disables portal login and terminates active sessions (`ACCOUNT DISABLED`).
  - Cancels any `PENDING` fest invitation.
  - Transitions any active/standby assignments (`ASSIGNED`, `CONFIRMED`, `STANDBY`, `ACTIVATED_BACKUP`) to **`CANCELLED DEACTIVATED`**, freeing those seats for replacement while preserving full historical records.
- **Reactivate:** Click **Reactivate** on a deactivated judge's row to re-enable their profile and portal login. *(Previously cancelled assignments stay cancelled; you can invite/re-assign them as needed.)*

#### Viewing a Judge's Full Dossier

Click any judge's **name** or **Details** button (`#/admin/judges/:id`) to inspect:
- Full profile, portal account status, and last login timestamp.
- Fest invitation details (`Sent Date`, `Response Deadline`, `Resend Count`, `Response Date`, `Judge Note`) plus a **Send Invitation** button if eligible.
- **Assignment History** across all competitions and slots (role, response, assignment status, attendance, replacement info).
- **Declared Slot Availability** and **Recent Activity History**.

---

### 3.3 Step 3: Bulk Importing Judges via CSV

**Location:** **Judges Directory** → Click **Import CSV**

Bulk import lets you onboard up to **200 judges** at once from a `.csv` file (up to **500 KB**).

#### Preparing Your CSV File

1. Click **Sample CSV** inside the modal to download `baust-judges-sample.csv` as a ready-to-edit template.
2. Required columns:
   - `name` *(also accepts `full_name`, `fullname`, `judge_name`)*
   - `email` *(also accepts `email_address`, `e_mail`)*
   - `judge_type` *(must be `EXTERNAL` or `FACULTY`; also accepts `judgetype`, `type`, `category`)*
   - `designation` *(also accepts `title`, `position`)*
   - `institution` *(also accepts `organization`, `org`, `affiliation`, `university`)*
3. Optional columns:
   - `phone` *(also accepts `phone_number`, `mobile`, `contact`)*
   - `expertise` *(also accepts `areas_of_expertise`, `specialization`, `skills`)*

> **Tip:** CSV column headers are case-insensitive, and spaces or hyphens are automatically normalized. Quoted fields with commas inside (such as `"Machine Learning, Robotics"`) are fully supported.

#### Running the Import

1. Either choose a `.csv` file using **Upload CSV File** or paste raw CSV lines directly into **CSV Data**.
2. Check the live counter below the upload box confirming how many data rows were detected.
3. Click **Validate & Import Judges**.

#### Reviewing the Import Summary

After processing, the modal displays four summary metrics:
- **Total Rows**
- **Created** — valid rows inserted with linked `JUDGE` portal accounts and unique 14-character temporary passwords.
- **Duplicates Skipped** — rows skipped safely because the email already existed in the database or appeared earlier in the same CSV file.
- **Validation Errors** — rows skipped due to missing required fields, invalid email format, unsupported `judge_type` (must be `EXTERNAL` or `FACULTY`), or exceeding character limits.

**Before closing the summary:**
1. Click **Download Credentials CSV** (`baust-imported-judge-credentials.csv`) or use individual **Copy** buttons to save all one-time temporary passwords—they cannot be retrieved later.
2. Optionally click **Send Invitations to Created (N)** to immediately open the invitation modal pre-selected with all newly imported judges, or click **Done** to invite them later.

---

### 3.4 Step 4: Sending & Managing Fest Invitations

**Location:** Sidebar → **People & Invitations → Invitations** (`#/admin/invitations`) or from **Judges Directory**

#### Which Judges Can Be Invited?

Only **active** judges whose invitation status is **`NOT INVITED`**, **`EXPIRED`**, or **`CANCELLED`** are eligible for a new/reopened invitation.

#### Method A: Selecting Judges from the Judges Directory

1. Go to **Judges** (`#/admin/judges`).
2. Check the boxes next to eligible judges (or use the top header checkbox to select all eligible judges currently listed).
   - *Note:* Checkboxes are disabled for deactivated judges or judges whose invitation is already `PENDING`, `ACCEPTED`, or `REJECTED`.
3. Click **Invite Selected (N)** in the header (or **Send Fest Invitations** on the floating selection bar).
4. Set a **Response Deadline** (must be in the future; defaults to 7 days from now).
5. Click **Send Invitations**.

#### Method B: Sending from the Fest Invitations Page

1. Go to **Invitations** (`#/admin/invitations`).
2. Click **Send Invitations**.
3. Set the **Response Deadline** and check the desired judges (use **Toggle All** to select/deselect everyone).
4. Click **Send Invitations**.

#### Managing Existing Invitations

On `#/admin/invitations`, you can search by judge/institution or filter by **Status** and **Type**, and perform:
- **Expire Overdue:** Click **Expire Overdue** at the top right to immediately transition any `PENDING` invitations past their deadline to `EXPIRED`. *(The system also auto-expires overdue invitations automatically whenever invitation lists or judge portals are loaded.)*
- **Resend:** Available for active judges with `PENDING`, `EXPIRED`, or `CANCELLED` invitations. Click **Resend**, choose a **New Expiration Deadline** in the future, and confirm. This increments the `Resends` counter and resets status to `PENDING`.
- **Cancel:** Available for `PENDING` invitations, or `ACCEPTED` invitations **only if the judge has `0` active assignments**. *(If a judge has active assignments, withdraw or replace their assignments first before cancelling their invitation.)*

---

### 3.5 Step 5: Creating Competitions & Time Slots

#### Managing Competitions

**Location:** Sidebar → **Event & Allocation → Competitions** (`#/admin/competitions`)

1. Click **New Competition**.
2. Enter:
   - **Competition Name** *(required, must be unique)*
   - **Description** *(optional scope, judging criteria, or notes)*
   - **Required Primary Judges per Slot** *(minimum `1`)*
   - **Status:** `DRAFT`, `OPEN`, `ONGOING`, or `COMPLETED`.
3. Click **Create Competition**.

**Table Actions:**
- **Slots:** Opens **Competition Slots** filtered to that competition.
- **Edit:** Update name, description, required primary judges per slot, or status.
- **Cancel:** Cancels the competition, marks all of its slots **`CANCELLED`**, and transitions all active/standby assignments on those slots to **`CANCELLED SLOT`** while preserving historical records.

#### Creating & Rescheduling Time Slots

**Location:** Sidebar → **Event & Allocation → Competition Slots** (`#/admin/slots`)

1. Click **Add Slot**.
2. Select the **Competition**, and enter:
   - **Slot Label** *(e.g., `Round 1 – Morning`)*
   - **Venue** *(e.g., `Main Auditorium`)*
   - **Start Time** and **End Time** *(End Time must be after Start Time)*
3. Click **Create Slot**.

**Rescheduling a Slot & Handling Time Conflicts:**
1. Click **Reschedule** on an active slot and change its Start/End Time, Label, or Venue.
2. Click **Save Slot**.
3. If the new time window causes any already-assigned judge to overlap with another active slot they hold, the system blocks the save and shows a **Scheduling Conflict Detected!** alert listing the affected judge(s) and overlapping slot(s).
4. You then have two choices:
   - Adjust the slot's Start/End Time to avoid the overlap and click **Save Slot** again; **or**
   - Click **Reschedule & Auto-Withdraw Conflicting Assignments** to apply the new schedule and automatically move the conflicting assignments to **`WITHDRAWN`** so they can be reassigned.

**Cancelling a Slot:**
- Click **Cancel** on a slot row to mark the slot `CANCELLED` and release its active/standby assignments as `CANCELLED SLOT` (history preserved).

---

### 3.6 Step 6: Allocating Primary & Backup Judges

**Location:** Sidebar → **Event & Allocation → Judge Allocation** (`#/admin/allocation`)

1. Select a competition time slot from the **Slot Dropdown** at the top right (it shows remaining vacant positions in parentheses).
2. Review the 4 coverage KPIs:
   - **Selected Slot** & venue
   - **Schedule Window** & slot status
   - **Primary Coverage** (`filled / required`)
   - **Standby Faculty Backups** count
3. Look at the **Eligible Accepted Judges** table:
   - Only **active** judges who have **`ACCEPTED`** their fest invitation are listed.
   - **Slot Availability:** Shows what the judge declared in their portal (`AVAILABLE`, `TENTATIVE`, `UNAVAILABLE`, or `UNSPECIFIED`).
   - **Workload:** Displays the judge's current total active assignments across the fest.
   - **Conflict Check:** Shows either `No conflict`, `ASSIGNED` (already on this slot), or a red **Conflict** warning naming the overlapping competition and slot.
4. Assign judges:
   - Click **Primary** to assign a judge as a primary evaluator (disabled if primary seats are already full, the judge is already assigned to this slot, or they have an overlapping schedule conflict).
   - Click **Backup** (shown **only for `FACULTY` judges**) to pre-assign them as a **`STANDBY`** backup for that slot.
5. **Withdrawing an Assignment:**
   - In **Current Slot Assignments**, click **Withdraw** next to any active/standby judge to transition their assignment to `WITHDRAWN` (preserving the record) and free their seat.

> **Note:** Newly assigned `PRIMARY` judges start as `ASSIGNED` with Judge Response `PENDING`; newly assigned `BACKUP` judges start as `STANDBY` with Judge Response `PENDING`. Once the judge accepts in their portal, `ASSIGNED` becomes `CONFIRMED`.

---

### 3.7 Step 7: Competition-Day Attendance Tracking

**Location:** Sidebar → **Competition Day → Attendance** (`#/admin/attendance`) or via the top-right **Attendance** shortcut button.

1. Use the **Slot Attendance & Vacancy Overview** table at the top to monitor every active slot's Primary Filled, Vacant, Standby, Present, Absent, and Activated Backups counts in real time.
2. Filter the assignment list below by **Competition** and/or **Slot**.
3. For each assigned judge (who has not already been replaced), click the appropriate attendance button:
   - **Present** (`PRESENT`)
   - **Absent** (`ABSENT`)
   - **Late** (`LATE`)
   - **Excused** (`EXCUSED`)

#### Automatic Backup Prompt on Absence

- If you mark an active **`PRIMARY`** judge or an **`ACTIVATED BACKUP`** judge as **`ABSENT`**, JuryPanel immediately opens the **Activate Backup / Replace Judge** modal so you can fill the seat right away.
- If you close that modal without replacing them yet, an **Activate Backup** button remains visible on their row (and they also appear on the **Backup Management** page).

---

### 3.8 Step 8: Backup Activation, Replacements & Late Arrivals

**Location:** Sidebar → **Competition Day → Backup Management** (`#/admin/backups`)

This desk centralizes all competition-day exceptions across three sections:

#### 1. Positions Needing Replacement
Lists every active slot position currently uncovered due to:
- A primary or activated-backup judge marked **`ABSENT`** (and not yet replaced), **or**
- A primary judge who **`DECLINED`** or **`WITHDRAWN`** while the slot still has vacant primary positions.

Click **Activate / Assign Backup** on any row to open the replacement modal.

**Inside the Replacement Modal:**
1. Optionally customize the **Replacement Reason**.
2. Choose from two priority tiers:
   - **Tier 1 — Pre-Assigned Standby Backups:** Faculty judges already pre-assigned as `STANDBY` for this slot. Click **Activate Backup**. *(Note: A standby backup marked `ABSENT` is blocked with a disabled `Marked Absent` button.)*
   - **Tier 2 — Dynamic Available Faculty Judges:** Any other active, invitation-accepted, conflict-free `FACULTY` judge across the fest, sorted by declared availability (`AVAILABLE` first) and lowest workload. Click **Assign & Activate**.
3. What happens on activation:
   - The original judge's assignment transitions to **`REPLACED`** (their original attendance record is preserved).
   - The chosen faculty judge becomes **`ACTIVATED BACKUP`**, filling the primary seat.

#### 2. Pre-Assigned Standby Faculty Backups
Displays all `STANDBY` backup assignments across active slots. If a standby backup notifies you beforehand that they cannot attend, click **Mark Unavailable** to withdraw them from standby cleanly.

#### 3. Replacement History & Late Arrival Resolution

If a judge who was marked `ABSENT` and **`REPLACED`** later arrives at the venue:

1. Click **Late Arrival** on their row (available on both **Backup Management** and **Attendance**).
2. Enter an optional **Resolution Note**.
3. Choose one of two resolutions:
   - **Keep Replacement Active & Mark Original LATE (Recommended):** Keeps the activated faculty backup judging the slot, and updates the original judge's attendance record from `ABSENT` to `LATE`.
   - **Restore Original Judge & Return Backup to Standby:** Restores the original judge's assignment to `CONFIRMED`, marks their attendance `LATE`, and returns the replacement backup judge to `STANDBY`.

> **Chained Replacement Support:** If an activated backup judge later becomes `ABSENT`, marking them `ABSENT` lets you activate another standby backup or dynamic faculty judge to replace them, preserving the full replacement chain.

---

### 3.9 Step 9: Reports & CSV Exports

**Location:** Sidebar → **Overview → Reports** (`#/admin/reports`)

Switch between 4 report tabs and click **Export Current CSV** at any time to download the currently viewed tab as a spreadsheet-ready `.csv` file:

| Tab | What It Shows | Exported CSV Filename |
| :--- | :--- | :--- |
| **Competition Summary** | Status, Active Slots, Filled Primary, Standby Backups, Replaced, and Present / Absent / Late counts per competition | `baust-competition-report.csv` |
| **Judge Workload** | Type, Invitation Status, Active Primary slots, Standby Backups, Activated Backups, and Historical Exceptions per judge | `baust-judge-workload.csv` |
| **Replacement History** | Competition & Slot, Original Judge, Original Attendance, Replaced By (Faculty), and Reason | `baust-replacement-history.csv` |
| **Activity Logs** | Chronological audit trail (up to latest 60 events in UI) with Timestamp, Actor, Action, Entity, and JSON Details | `baust-activity-logs.csv` |

---

### 3.10 Step 10: System Settings & Admin Management

**Location:** Sidebar → **System → Settings** (`#/admin/settings`)

- **System Metrics:** Displays `Active User Sessions`, `Audit Log Events`, and `Database Migrations Applied`.
- **Expire Overdue Invitations:** Manual trigger button to mark any overdue `PENDING` invitations as `EXPIRED`.
- **Add Administrator:** Opens **Create Administrator Account** (`Full Name`, `Email Address`, `Initial Password` min 8 chars) to onboard additional committee admins.
- **Administrator Accounts Table:** Lists all admin accounts, active/deactivated status, and last login timestamp.
- **Change My Password:** Update your own administrator password by entering your `Current Password` and `New Password` (min 8 chars).

---

## 4. Judge Portal Guide — Complete Judge Workflow

Judges log in via the **Judge Portal** tab (`#/judge/login`) using the email and initial password provided by the BAUST CSE Fest organizing committee.

---

### 4.1 Judge Dashboard

**Location:** Sidebar → **Dashboard** (`#/judge/dashboard`)

- **Action Callout Banner:** If you have an unanswered fest invitation, a yellow banner prompts you with your response deadline and a **Respond to Invitation** button. Once accepted, if you have pending competition slot assignments, an info banner links directly to **Review Assignments**.
- **4 Summary KPI Cards:**
  1. **Fest Invitation** (status + deadline)
  2. **Pending Confirmation** (slot assignments awaiting your response)
  3. **Confirmed Judging Slots** (plus standby backup slot count)
  4. **Past / Exception Records** (declined, withdrawn, or replaced count)
- **Upcoming Assigned Slots:** Chronological overview of your active competitions, slots, schedules, venues, roles, and statuses.

---

### 4.2 Responding to Your Fest Invitation

**Location:** Sidebar → **My Invitations** (`#/judge/invitations`)

1. Review who sent the invitation (`Invited By`), `Sent Date`, and `Response Deadline`.
2. While status is **`PENDING`**, optionally enter remarks in **Optional Note to Organizing Committee** (e.g., arrival timing or travel notes).
3. Click **Accept Invitation** or **Decline / Reject Invitation**.

> **Important:** You must accept the official fest invitation **before the Response Deadline**. Once expired (`EXPIRED`) or responded to (`ACCEPTED` / `REJECTED`), the decision buttons lock; if your invitation expired, contact the Fest Administrator to resend it with a new deadline.

---

### 4.3 Accepting, Declining, or Withdrawing from Assignments

**Location:** Sidebar → **My Assignments** (`#/judge/assignments`)

Your assignments are split into two tabs:
- **Active & Pending:** Current primary/backup assignments you need to respond to or are scheduled to judge.
- **Historical & Closed:** Archived records of declined, withdrawn, replaced, or cancelled assignments.

#### Responding to a Pending Assignment (`PENDING` response)
- **Accept:** Click **Accept** to confirm your slot (`ASSIGNED` changes to `CONFIRMED`; `STANDBY` stays `STANDBY` with `ACCEPTED` response).
- **Decline:** Click **Decline**, enter a brief **Reason / Note** (required) for the organizing committee, and click **Confirm Decline**.

#### Withdrawing After Confirmation
- If an emergency prevents you from judging a previously confirmed or standby slot, click **Withdraw**, enter a **Reason / Note** (required), and click **Confirm Withdrawal**. Your withdrawal is recorded cleanly so an administrator can assign a backup judge.

---

### 4.4 Viewing Timetable & Declaring Slot Availability

**Location:** Sidebar → **My Schedule** (`#/judge/schedule`)

This page contains two tables:

1. **My Assigned Timetable:** Your active and standby judging schedule in chronological order with exact date, time range, venue, role, and status.
2. **Declare Slot Availability:** Lists all active fest competition slots. For each slot, click one of three buttons to inform the committee of your availability:
   - **Available** (`AVAILABLE`)
   - **Tentative** (`TENTATIVE`)
   - **Unavailable** (`UNAVAILABLE`)

> **Tip:** Updating your availability early helps administrators avoid assigning you to inconvenient times or overlapping commitments.

---

### 4.5 Updating Profile & Changing Password

**Location:** Sidebar → **Profile** (`#/judge/profile`)

- **Judge Information (Editable):** You can update **Designation**, **Institution**, **Phone Number**, and **Areas of Expertise**, then click **Save Profile**.
  - *Note:* **Full Name**, **Email Address**, and **Judge Type** (`EXTERNAL` / `FACULTY`) are managed by administrators and shown as read-only.
- **Change Password:** It is strongly recommended that you change your admin-issued temporary password on first login:
  1. Enter **Current Password**.
  2. Enter **New Password** (minimum 8 characters).
  3. Click **Update Password**.

---

## 5. Status Badge Reference Glossary

### Account & Profile Statuses
| Badge | Meaning |
| :--- | :--- |
| `ACCOUNT CREATED` | Judge has an active portal login account. |
| `ACCOUNT DISABLED` | Judge's portal login is disabled (judge deactivated). |
| `NO ACCOUNT` | Judge profile exists without linked login credentials (Admin can click **Set Account**). |
| `ACTIVE` / `DEACTIVATED` | Whether the judge or admin profile is active in the system. |

### Fest Invitation Statuses
| Badge | Meaning |
| :--- | :--- |
| `NOT INVITED` | Judge account/profile created, but no fest invitation has been sent yet. |
| `PENDING` | Invitation sent and awaiting judge response before the deadline. |
| `ACCEPTED` | Judge accepted the fest invitation and is eligible for slot allocation. |
| `REJECTED` | Judge declined the fest invitation. |
| `EXPIRED` | Response deadline passed before the judge responded. |
| `CANCELLED` | Invitation cancelled by an administrator. |

### Assignment Roles & Statuses
| Badge | Meaning |
| :--- | :--- |
| `PRIMARY` | Main evaluating judge position counting toward slot quota. |
| `BACKUP` | Standby or activated faculty replacement role (`FACULTY` judges only). |
| `ASSIGNED` | Primary judge assigned by admin; awaiting judge confirmation. |
| `CONFIRMED` | Primary judge accepted the slot assignment. |
| `STANDBY` | Pre-assigned faculty backup held in reserve for the slot. |
| `ACTIVATED BACKUP` | Faculty backup promoted to fill an absent/withdrawn/declined primary seat. |
| `DECLINED` | Judge declined the slot assignment before confirming. |
| `WITHDRAWN` | Assignment withdrawn by judge or admin (record preserved). |
| `REPLACED` | Original judge replaced by a faculty backup (history and attendance preserved). |
| `CANCELLED SLOT` | Released automatically because the competition or slot was cancelled. |
| `CANCELLED DEACTIVATED` | Released automatically because the judge's account was deactivated. |

### Attendance, Availability & Event Statuses
| Badge | Meaning |
| :--- | :--- |
| `PRESENT` / `ABSENT` / `LATE` / `EXCUSED` | Competition-day attendance statuses marked by Admin. |
| `AVAILABLE` / `TENTATIVE` / `UNAVAILABLE` / `UNSPECIFIED` | Judge's declared availability for a time slot. |
| `DRAFT` / `OPEN` / `ONGOING` / `COMPLETED` / `CANCELLED` | Competition lifecycle statuses. |
| `SCHEDULED` / `RESCHEDULED` / `COMPLETED` / `CANCELLED` | Competition time slot statuses. |

---

## 6. Special Scenarios & Troubleshooting FAQ

**Q: I created a judge, why aren't they showing up on the Judge Allocation page?**
- Adding a judge only creates their profile and login account (`NOT INVITED`). You must send them a fest invitation **and** the judge must log into the Judge Portal and click **Accept Invitation** (`ACCEPTED`) before they become eligible for slot allocation.

**Q: I closed the One-Time Temporary Password modal before copying the password. How do I get it back?**
- Temporary passwords are hashed immediately with `bcrypt` and are never stored in plaintext, so the old password cannot be retrieved. Go to **Judges**, click **Reset PW** on that judge's row, generate a new temporary password (or set a custom one), and share it with the judge.

**Q: Why is the "Backup" button missing for an External judge in Judge Allocation?**
- Only **`FACULTY`** judges (internal BAUST faculty) can serve as standby or replacement backups. **`EXTERNAL`** judges can only be assigned as `PRIMARY` judges.

**Q: Why does login fail with "This login portal is restricted to..."?**
- Ensure you selected the matching tab at the top of the login card: Judges must sign in under **Judge Portal**, and Administrators must sign in under **Admin Portal**.

**Q: A judge's fest invitation expired before they responded. What should I do?**
- Go to **Invitations** (`#/admin/invitations`), locate the `EXPIRED` row, click **Resend**, choose a future **New Expiration Deadline**, and submit. The judge can then log in and accept.

**Q: Why can't I cancel a judge's `ACCEPTED` invitation?**
- An `ACCEPTED` invitation cannot be cancelled while the judge holds any active or standby slot assignments (`ASSIGNED`, `CONFIRMED`, `STANDBY`, or `ACTIVATED BACKUP`). Withdraw those assignments in **Judge Allocation** first, then cancel the invitation.

**Q: When I try to reschedule a slot, I get a Scheduling Conflict error. What are my options?**
- The error modal lists the exact judges whose existing assignments overlap the proposed new time. Either adjust the slot's start/end time to avoid the overlap, or click **Reschedule & Auto-Withdraw Conflicting Assignments** to apply the new schedule and release the conflicting seats.

**Q: What happens if a pre-assigned standby backup is also marked `ABSENT` on competition day?**
- JuryPanel blocks activating an absent standby backup (`Marked Absent` disabled button) and lets you pick another standby backup or any conflict-free, invitation-accepted faculty judge from **2. Dynamic Available Faculty Judges** in the same modal.

**Q: A CSV bulk import skipped some rows. Did it cancel the whole upload?**
- No. Valid non-duplicate rows are imported and given portal accounts, while duplicate emails and invalid rows are skipped and itemized cleanly in the **Skipped Duplicate Emails** and **Validation Errors** tables inside the import summary. Fix only the failed rows and re-import them.
