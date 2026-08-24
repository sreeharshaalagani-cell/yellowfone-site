/* ============================================================
   notify.js — emails a lead to the team, from the browser.

   yellowfone.com is a static site on GitHub Pages: no server, no
   runtime, nowhere to hide a secret. So delivery goes through a form
   service whose access key is PUBLIC BY DESIGN — that is the entire
   product. Putting a SendGrid or Resend key in this file instead would
   let anyone who views source send mail as us.

   NOTIFICATION IS NOT THE RECORD
   ------------------------------
   The demo backend stores every enquiry before this is ever called,
   and /api/demo/leads remains the source of truth. This is the
   convenience layer: it puts the lead in an inbox so nobody has to
   remember to check a dashboard. If it fails, a lead is unannounced —
   never lost.

   That distinction is why nothing here is allowed to surface an error
   to the visitor. Their submission succeeded; a mail-relay problem is
   ours, and showing them a failure would only make them submit again.
   ============================================================ */

// ── CONFIGURATION ───────────────────────────────────────────
//
// Get a key at https://web3forms.com — enter the address that should
// receive the mail (info@kypertech.com) and they send you one. No
// account, no dashboard. The key is safe in public source; it only
// permits sending TO the address it was issued for, so a copy of it
// cannot be used to mail anyone else.
//
// Leave it empty and notification is simply OFF: enquiries still reach
// the backend and still appear in the dashboard. Silent-but-working
// beats broken.
const ACCESS_KEY = window.YELLOWFONE_FORM_KEY || '';

const ENDPOINT = 'https://api.web3forms.com/submit';
const TIMEOUT_MS = 8000;

export function notifyConfigured() {
  return !!ACCESS_KEY;
}

/**
 * Email one lead. Resolves {sent, error} — never rejects, never throws.
 *
 * @param {object} o
 * @param {string} o.subject   what lands in the inbox subject line
 * @param {object} o.fields    label → value; empty values are dropped
 * @param {string} [o.replyTo] so Reply answers the prospect directly
 */
export async function notifyByEmail({ subject, fields, replyTo }) {
  if (!ACCESS_KEY) {
    console.warn('[notify] no form access key configured — the lead is stored but no email was sent.');
    return { sent: false, error: 'not_configured' };
  }

  // Drop empties so the email does not carry a column of blank labels.
  const clean = {};
  for (const [k, v] of Object.entries(fields || {})) {
    const s = String(v ?? '').trim();
    if (s) clean[k] = s;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        access_key: ACCESS_KEY,
        subject,
        from_name: 'Yellowfone website',
        ...(replyTo ? { replyto: replyTo } : {}),
        // Named so the relay's default template renders them in order.
        ...clean,
        // Honeypot. The service drops the submission when this is
        // non-empty; a bot that fills every field it finds trips it,
        // a human never sees it.
        botcheck: '',
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.success === false) {
      console.error('[notify] the mail relay rejected the message:', res.status, body.message || '');
      return { sent: false, error: `http_${res.status}`, detail: body.message };
    }
    return { sent: true };
  } catch (err) {
    const reason = err && err.name === 'AbortError' ? 'timeout' : (err && err.message) || 'unknown';
    console.error('[notify] could not reach the mail relay:', reason);
    return { sent: false, error: reason };
  } finally {
    clearTimeout(timer);
  }
}

// Nice labels for the fields the contact form has today. Anything NOT
// listed still gets forwarded under its raw name — see below.
const CONTACT_LABELS = {
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
  restaurant: 'Restaurant',
  role: 'Role',
  locations: 'Locations',
  pos: 'Current POS',
  pain: 'Biggest phone-related pain',
  message: 'Message',
};

/**
 * A "book a demo" enquiry from the contact page.
 *
 * Forwards EVERY submitted field, not a hardcoded list. The first
 * version mapped `message`, which the form does not have — its
 * textarea is `pain` — so the one thing a prospect actually writes was
 * dropped, along with `locations` and `pos`. Silently: the email still
 * arrived and still looked complete. Unknown keys now ride along under
 * their raw name, so adding a field to the HTML can never quietly stop
 * reaching the inbox again.
 */
export function notifyContact(f) {
  const fields = {};
  for (const [k, v] of Object.entries(f || {})) {
    if (k === 'botcheck') continue;
    fields[CONTACT_LABELS[k] || k] = v;
  }
  fields.Source = 'contact form — yellowfone.com/contact.html';
  return notifyByEmail({
    subject: `Yellowfone enquiry — ${f.name || 'someone'}${f.restaurant ? ` (${f.restaurant})` : ''}`,
    replyTo: f.email,
    fields,
  });
}

/** Someone who just ran the live demo — a warmer lead than the form. */
export function notifyDemoLead(f) {
  return notifyByEmail({
    subject: `Yellowfone DEMO CALL — ${f.name || 'someone'}${f.restaurant ? ` (${f.restaurant})` : ''}`,
    replyTo: f.email,
    fields: {
      Name: f.name, Email: f.email, Phone: f.phone, Restaurant: f.restaurant,
      Note: 'This person just ran the live demo — they have heard it work.',
      Source: 'live demo — yellowfone.com/demo.html',
    },
  });
}
