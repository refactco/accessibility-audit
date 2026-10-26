# Form tests without real submissions

Plan of 2026-10-26. Part 1, the dry submit, is in version 1.1.0. Parts 2 and 3 are setup tasks for each site.

This plan uses Simplified Technical English. Code, file names, and the names of WCAG criteria stay in their usual form.

## 1. The problem

The engine audits production. On production, it does not type text and does not submit a form. A submission sends real data to the site, its email, and its CRM. Thus these tests do not run on production:

- The error messages after a submission with errors (3.3.1, 3.3.3).
- The announcement of an error message to a screen reader (4.1.3).
- The success message after a correct submission (4.1.3).
- The sign-in steps (3.3.8).

The audits of refact.co, fioredesigns.com, and credaily.com show the gap. All three settings files have `tests_that_send_data: false`. The contact process of refact.co runs on staging only, so each production audit reports it as "not tested". The report says: "The form tests (3.3.1, 3.3.3) run in the processes only."

## 2. The decision

The form test has three parts. Each part tests what it can test safely.

| Part | Where | What it tests | Data sent | Status |
|---|---|---|---|---|
| 1. Dry submit | All environments, also production | The errors that the page shows before it sends | No. The engine stops the data in the browser | Built in 1.1.0 |
| 2. Real submit | Staging or local | The errors of the server, and the success message | Yes, to staging only | The processes exist. Each site needs a safe staging |
| 3. Test account | Production | The sign-in and the pages behind it | Only to an account and an inbox that the team owns | The storage state exists. Each site needs an account |

Two other methods are not in this plan:

- **A fake answer.** The engine answers the request in place of the server. This works only when the page reads a JSON answer, for example the newsletter of fioredesigns.com. It does not work for a Next.js server action (the contact form of refact.co, the login of fioredesigns.com) or for a classic Gravity Forms page (credaily.com). Also, when the server changes, the fake answer becomes incorrect and nothing shows it.
- **An audit marker.** The site discards each submission that carries a marker. This gives the best result on production, but it puts audit code into each client site. Use it only for a site that has no staging.

## 3. Part 1: the dry submit

### 3.1 What the engine does

1. On each page of the sample, at the first width, the engine finds the forms that are visible after the load.
2. A form is a `form` element with at least one text field and a submit control. The engine skips a search form, a form with only a select or checkboxes, and a form with no submit control.
3. The engine tests a maximum of three forms on each page. A form that has the same action, the same fields, and the same submit control as a tested form is the same form. The engine tests it one time in each audit, on the first page in a fixed order.
4. Each form gets one or two submissions. Each submission is a state of the page, in its own render and in a new browser context.
   - Submission A: the form empty. The engine clicks the submit control.
   - Submission B: each text field filled with `a11y-dry-submit`, which is not a correct email, date, phone, or address. The engine clicks the submit control. Submission B runs only when submission A showed errors on the page.
5. Before the first action, the guard starts (section 3.2). It stays on until the context closes.
6. The engine compares the form before and after the submission, with the form tests of the processes:
   - `error-not-in-text` (3.3.1): fields become invalid, and no text identifies the error.
   - `error-not-linked` (3.3.1): an invalid field has no error text near it or connected to it.
   - `error-without-suggestion` (3.3.3): the error text does not say how to correct the input.
   - `error-not-announced` (4.1.3), new: error text appears, the focus stays on the submit control, and no live region holds the text.
7. Then the engine runs the tests of a state on the error state: the rule engine, the page tests, and a focus pass. These find, for example, error text with low contrast.

### 3.2 The guard

The guard makes sure that no submission data leaves the browser. After the guard starts, the browser blocks each request that agrees with one or more of these rules:

- The method is not GET or HEAD. This blocks a POST of a form, a fetch, a server action, and a beacon.
- The request is a page, a frame, a fetch, an XHR, a beacon, an event stream, or of an unknown type. This blocks a GET form and a form that opens in a new window or a frame.
- The request is a script whose path does not end in `.js` or `.mjs`. This blocks a JSONP request, for example a Mailchimp form that subscribes with GET.
- The host is not the site or a permitted domain of the settings. This blocks a pixel or a script of a CRM or of an analytics service.
- The address contains a value that the engine typed.

Also:

- The context blocks service workers. Otherwise a service worker can send a request that the guard does not see.
- A WebSocket that the page opens after the guard starts does not connect. A WebSocket that was open before cannot send messages to the server.
- The engine closes each new window. The guard applies to its requests too.
- The engine dismisses each dialog.

The guard records each blocked request. The load of the page before the guard is the same as for each other page of the audit.

### 3.3 The result of a submission

| What the engine sees | What it means | What the engine does |
|---|---|---|
| Fields become invalid, or error text appears | The page checks the fields in the browser | The form tests, and the tests of the state |
| No change, and the browser marks a field as invalid | The browser shows its own message | No finding. The criteria count as tested |
| No change, and the guard blocked a request after the click | The site checks the fields on the server only | No finding. The page gets "not tested" for 3.3.1 and 3.3.3. The coverage lists the form: its errors need part 2 |
| No change, and no blocked request | The form needs more than one action, or does nothing | No finding. The coverage lists the form |

### 3.4 The settings

`interaction.dry_submit` is `true` by default on each environment. The value `false` stops the dry submit. The deny-list does not apply to the submit control of a dry submit, because the guard blocks the data. The deny-list continues to apply to all other tests.

### 3.5 The results

- Each submission is a state of the page, for example "dry submit of the form 'Send', empty". Thus the issues of a dry submit have their own fingerprints.
- A sample page counts as tested for 3.3.1 and 3.3.3 at the first width. A page with a form that checks on the server only does not count.
- `coverage.forms_tested` gives the number of forms with a dry submit.
- `coverage.tests_not_run` lists each form that checks on the server only, and each form that did not change.
- The processes run after the dry submits. A process does not repeat an outcome that a dry submit found on the same page.

### 3.6 What the dry submit does not test

- The errors of the server and the success message. Part 2 tests them.
- A form that shows only after an action, for example in a dialog or a tab.
- A form in a frame from another domain, for example an older HubSpot embed.
- The steps after the first step of a form with more than one step.

### 3.7 The proof

1. `tests/dry-submit.mjs` serves a local site whose forms send data in eleven ways. The ways are: a fetch POST, a POST form, a GET form, and a fetch GET. Also a JSONP request to the site and to another host, a beacon, and a WebSocket message. Also a form in a new window, a form in a frame, and a pixel to another host. Each page has a form with no check and a form that checks only that the fields are not empty. The server records each request. The test passes when the server gets no submission and no typed value, and when the coverage lists the forms with no check.
2. The same test audits the seeded faults F59 (3.3.1) and F61 (3.3.3) with production settings and no process. The engine must find both. The base site must give no form finding.
3. `npm test` runs the test. The seeded detection runs again for all faults.
4. One short audit of the contact page of refact.co, the site of the company, shows the dry submit on a real form.

The results of 2026-10-26:

| Proof | Result |
|---|---|
| Control run with no guard | Each of the eleven ways reached the server |
| Audit with production settings | The server got no submission, no WebSocket message, and no typed value. The guard blocked each way, also for the 11 forms that tried to send with values |
| Error not announced (4.1.3) | Found for the form with no live region. Not found for the form with `role=alert` |
| Seeded faults F59 and F61, no process | Both found. The base site gives no form finding |
| All 74 seeded faults | 74 found |
| refact.co, the contact page | The form uses the check of the browser on purpose (`noValidate={false}` in `ContactForm.tsx`). The dry submit reported "native", and the guard blocked no request after the click |

The first full detection found two false questions. On two seeded pages with no labels, the engine asked if "Enter name." gives a suggestion. For an empty field, a message that asks for a value is the correction, so the form tests now accept it.

## 4. Part 2: the real submit on staging

A process with real data runs on staging or local only. The settings for staging have `"environment": "staging"` and `"tests_that_send_data": true`. A staging is safe for a real submission when it agrees with these rules:

- The notification emails go to a team inbox or to a mail catcher, not to the client.
- The connections to a CRM, Slack, or a newsletter service are off, or they use a test list.
- The CAPTCHA is off on staging, or it uses the test keys of its provider.
- The values of a process say that they are a test, for example "This is a test message from the accessibility audit."

The status of each site:

| Site | Staging | To do |
|---|---|---|
| refact.co | Safe since 2026-10-13. The Gravity Forms connections are off | Run the contact process with `pilots/refact.co.staging.config.json` |
| credaily.com | Exists. reCAPTCHA v3 blocks the engine | Turn off the CAPTCHA on staging. Send the notifications to a team inbox. The HubSpot form on /advertise/ is never sent |
| fioredesigns.com | Not checked | Find the staging front end. Point the newsletter to a test list in Klaviyo, or remove the key on staging |

## 5. Part 3: the test account

- Each site with a sign-in needs an account that the team owns, with a team inbox.
- A person signs in one time and saves a storage state file. The settings name it in `login.roles`. The secret stays out of the repository.
- credaily.com already has this plan: a reader account. fioredesigns.com has a login and a register page, so it needs an account too.
- Later: one sign-in with an incorrect password or code in each audit, to test the error message. This is a real request to production, so it needs a process with `environment: "production"`, the account, and `tests_that_send_data: true`. It must try only one time, so that the site does not lock the account.

## 6. Changes to the other documents

- `PLAN.md` section 4.5: the protected mode permits the dry submit with the guard.
- `PLAN.md` sections 5.2 and 12: the form error state and the guard.
- `README.md`: the limits.
- `plugin/skills/a11y/SKILL.md`: the audit on production is read-only, and the dry submit sends nothing.
- `formats/config.schema.json`: `interaction.dry_submit`. `formats/summary.schema.json`: `coverage.forms_tested`.
- `CHANGELOG.md`, `package.json`, `plugin/.claude-plugin/plugin.json`: version 1.1.0.
