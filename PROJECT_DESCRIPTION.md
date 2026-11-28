# JuryPanel — Project Description & Core Features

**BAUST CSE Fest · Judge Invitation & Allocation Management System**

---

## 1. About the Project

**JuryPanel** is a web-based management platform built for the **Department of Computer Science & Engineering at BAUST** to organize and coordinate judges during **BAUST CSE Fest**.

During a university tech fest, multiple competitions run side by side—such as Competitive Programming, Hackathons, Project Showcasing, Robotics, UI/UX Design, and Gaming. Coordinating dozens of external industry guests and internal university faculty members using spreadsheets, phone calls, and chat messages often leads to scheduling clashes, missed invitations, unclear availability, and last-minute confusion if a judge is delayed or unable to attend.

**JuryPanel** solves this by putting everything in one organized place:
- **Organizers (Admins)** get a single control center to add judges, send invitations, set up competition schedules, assign judges without double-booking, manage backups, mark event-day attendance, and view reports.
- **Judges** get their own simple portal to accept or decline their fest invitation, mark which time slots fit their schedule, confirm their judging assignments, and view their personal timetable.

---

## 2. How the System Is Built (Architecture)

JuryPanel uses a clean three-part web architecture so everything stays fast, reliable, and synchronized for everyone using it at the same time:

```text
  [ Organizer / Judge Web Browser ]
       │   Uses the website on laptop, tablet, or phone
       ▼
  [ Application Server (Node.js + Express) ]
       │   Checks logins, prevents double-booking, updates invitations
       ▼
  [ Cloud Database (PostgreSQL on Supabase) ]
           Safely stores judges, invitations, slots, attendance & history
```

1. **Two Separate Portals Behind One Login Screen**: Anyone visiting JuryPanel sees a single sign-in screen with an **Admin Portal** tab and a **Judge Portal** tab (plus 1-click demo login buttons for quick testing). Once signed in, administrators and judges only see the tools meant for their role.
2. **Smart Rules at Every Step**: The server automatically checks schedules before saving any change—for example, making sure the same judge is never placed in two competitions at the same time, and automatically expiring invitations once their deadline passes.
3. **Permanent Record Keeping**: Nothing important is quietly erased. Even if a judge declines an assignment, withdraws, or is replaced on event day, the full history stays safely saved for reports.

---

## 3. Technology Stack

| Part of the System | Tools Used | Why It Is Used (In Plain Terms) |
| --- | --- | --- |
| **Website Interface** | **HTML, CSS, and JavaScript** | Keeps pages fast, clean, and responsive across desktop, tablet, and mobile screens without extra bloat. |
| **Charts & Icons** | **Chart.js** and **Lucide Icons** | Turns live numbers into clear visual charts on the dashboard and provides clean, recognizable icons across menus. |
| **Backend Server** | **Node.js, Express, and TypeScript** | Handles all business rules—checking schedules, preventing clashes, updating statuses, and running automatic deadline checks every minute. |
| **Database** | **PostgreSQL (hosted on Supabase)** | Safely stores all judges, competitions, time slots, assignments, attendance records, and activity logs in an organized cloud database. |
| **Security & Login** | **Encrypted Passwords (`bcrypt`) & Secure Login Cookies** | Keeps passwords scrambled (never stored in plain text), protects sessions against unauthorized access, and blocks deactivated accounts immediately. |

---

## 4. Database Design (How Data Is Organized)

JuryPanel's PostgreSQL database organizes all fest information into **10 connected tables** (plus 1 internal setup tracker) grouped into four simple areas:

1. **Accounts & Active Logins (`users`, `user_sessions`)**
   Stores encrypted login credentials, user roles (*Admin* or *Judge*), and active sign-in sessions so deactivated accounts are locked out right away.
2. **Judge Profiles & Invitations (`judges`, `judge_invitations`)**
   Keeps each judge's profile (contact details, organization, External vs. Faculty type) separate from their fest invitation. This lets organizers build the judge list first and send invitations later when ready.
3. **Competitions, Time Slots & Availability (`competitions`, `competition_slots`, `judge_availability`)**
   Each competition links to one or more scheduled venue time slots, and judges mark whether they are *Available*, *Tentative*, or *Unavailable* for each slot.
4. **Assignments, Attendance & Activity History (`judge_assignments`, `judge_attendance`, `activity_logs`)**
   Connects judges to specific time slots as *Primary* or *Backup* judges, tracks replacement chains (recording which backup stepped in for whom), stores event-day check-ins, and keeps a permanent log of every important change.

**Built-In Database Protections:**
- **Automatic Safety Checks**: Even at the database level, built-in rules prevent overlapping time assignments, block unaccepted judges from being scheduled, and ensure only BAUST faculty can take backup seats.
- **No Lost History**: Instead of deleting rows when someone withdraws, declines, or gets replaced, the database keeps the original record with an updated status so reports and audits stay 100% accurate.

---

## 5. Core Features

### 5.1 Live Overview Dashboard & Visual Charts
- **At-a-Glance Numbers**: Shows total judges, accepted and pending invitations, total competition slots, open judge seats, confirmed assignments, backup coverage, and event-day attendance.
- **Visual Charts**: Displays easy-to-read charts for invitation responses, how many judge seats are filled in each competition, and check-in attendance progress.
- **Action Reminders**: Highlights what needs attention right away—such as newly added judges who have not been invited yet, empty judge seats, or absent judges needing a backup.

### 5.2 Judge Directory & Bulk Spreadsheet Upload
- **Organized Roster**: Keeps every judge's name, email, phone number, job title, organization, areas of expertise, and type (**External Guest** or **BAUST Faculty**).
- **Automatic Login Setup**: Adding a judge automatically creates their personal Judge Portal login with a one-time temporary password.
- **Bulk CSV Upload**: Organizers can upload a spreadsheet of up to 200 judges at once. The system checks for missing details or duplicate emails, shows a clear summary, and provides a downloadable list of the temporary passwords to share with judges.
- **Profile & Account Controls**: Admins can update judge details, generate a new temporary password if someone forgets theirs, or deactivate/reactivate an account at any time.

### 5.3 Separate Invitation Control
- **Add First, Invite When Ready**: Creating a judge account does not send a fest invitation right away—organizers choose when to invite individual judges or groups and set a response deadline.
- **Clear Status Tracking**: Shows whether each judge is *Not Invited*, *Pending*, *Accepted*, *Rejected*, *Expired*, or *Cancelled*, completely separate from whether their login account is active.
- **Automatic Expiry & Resending**: Overdue invitations expire automatically after their deadline, and organizers can resend or reopen invitations whenever needed.

### 5.4 Competitions & Flexible Time Slots
- **Competition Setup**: Tracks each event's name, description, required number of judges, and status (*Draft*, *Open*, *Ongoing*, *Completed*, or *Cancelled*).
- **Venue & Time Slots**: Breaks competitions into scheduled time blocks with room or venue details.
- **Safe Rescheduling**: If a slot's time changes, the system warns the organizer if any assigned judge now has a time clash with another slot and helps resolve it cleanly.

### 5.5 Conflict-Free Judge Assignment & Backup System
- **Only Ready Judges Can Be Assigned**: Only active judges who have accepted their fest invitation appear for assignment.
- **No Double-Booking**: The system blocks assigning a judge to two overlapping time slots—even if one is a main seat and the other is a backup seat.
- **Built-In Backup Safety Net**: Each slot can have standby **Faculty Backup** judges ready. If a main judge declines, withdraws, or does not show up on event day, an organizer can promote a standby faculty backup or assign another free faculty member in one step.
- **Late-Arrival Handling**: If an absent judge arrives later after a backup has already stepped in, the organizer can choose to either keep the replacement or restore the original judge.

### 5.6 Event-Day Attendance & Reports
- **Quick Check-In**: Coordinators mark judges as *Present*, *Late*, *Absent*, or *Excused*. Marking a judge *Absent* immediately highlights the seat so a backup can be activated right away.
- **Downloadable Reports**: Shows competition summaries, each judge's workload, replacement history, and a complete activity log that can be exported as a spreadsheet (CSV).

### 5.7 Self-Service Judge Portal
- **Respond to Invitations**: Judges view their fest invitation, see the deadline, and accept or decline with an optional note.
- **Share Availability**: Judges mark whether they are *Available*, *Tentative*, or *Unavailable* for different fest time slots.
- **Manage Assignments & Schedule**: Judges confirm or decline assigned competitions, submit a withdrawal reason if an emergency comes up, and view a clean chronological schedule of their duties.

---

## 6. How Everything Works Together (Step by Step)

1. **Add Judges**: The organizer adds external and faculty judges manually or by uploading a CSV file.
2. **Send Invitations**: The organizer selects judges and sends fest invitations with a deadline. Judges sign in and accept.
3. **Set Competitions & Availability**: Competitions and time slots are created, and accepted judges mark when they are available.
4. **Assign Panels Without Clashes**: The organizer assigns main judges and standby faculty backups using conflict-free suggestions, and judges confirm their seats.
5. **Run Event Day Smoothly**: Coordinators check judges in as they arrive, activate backups immediately if anyone is absent, and export final reports after the fest ends.
