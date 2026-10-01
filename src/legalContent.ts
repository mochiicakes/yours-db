export const LEGAL_VERSION = '2026-08-12'

export interface LegalDoc {
  id: 'privacy' | 'terms' | 'cookies'
  title: string
  /** Simple paragraphs and headings. Lines starting with "## " render as headings. */
  body: string
}

export const LEGAL_DOCS: Record<LegalDoc['id'], LegalDoc> = {
  terms: {
    id: 'terms',
    title: 'Terms of Service',
    body: `Last updated: ${'2026-08-12'}. Contact: [YOUR_EMAIL].

yours.db is a free tool for building your own small databases. By creating an account or using it, you agree to these Terms. If you do not agree, do not use the Service.

## The service
yours.db lets you create sheets, define columns, add rows, and optionally share a read-only view through a link. It is free. Features may change over time.

## Your account
You need an account to use the Service. Provide a valid email, keep your password secure, and take responsibility for activity under your account. You must be at least 13 (or your country's minimum age of digital consent, if higher).

## Your content
You own your content — the database name, workspaces, sheets, columns and rows you create. You grant us only the permission needed to store, process and display it back to you, and to make it viewable through any share link you create. You are responsible for your content and must not use the Service to store or share anything unlawful, infringing, or harmful.

## Sharing
A share link makes content viewable by anyone who has it, without sign-in. You are solely responsible for what you choose to share. You can revoke a link at any time.

## Acceptable use
Do not attempt to break, overload or gain unauthorised access to the Service or other users' data, send spam, or resell the Service without permission.

## As is
The Service is provided "as is" and "as available", without warranties of any kind. We do not promise it will be uninterrupted or that data will never be lost. Keep your own backups of anything important.

## Limitation of liability
To the fullest extent permitted by law, we are not liable for indirect or consequential damages or loss of data. As the Service is free, our total liability for any claim is limited to what you paid us — zero.

## Termination
You may request account deletion any time by emailing [YOUR_EMAIL]. We may suspend accounts that materially violate these Terms or the law.

## Changes & governing law
We may update these Terms; material changes update the date above. These Terms are governed by the laws of the Republic of the Philippines, without removing mandatory protections you have where you live.

Questions: [YOUR_EMAIL].

This is provided in good faith and is not legal advice.`,
  },

  privacy: {
    id: 'privacy',
    title: 'Privacy Policy',
    body: `Last updated: ${'2026-08-12'}. Contact: [YOUR_EMAIL].

This explains how yours.db handles personal data, written to be accurate to how the Service actually works.

## What we collect
Account data: your email and an encrypted form of your password (handled by Supabase). Your content: the database name, workspaces, sheets, columns and rows you create — this is yours and we do not analyse it. Sharing metadata: a link's token, what it points to, expiry/revoked status, and a simple open-count. We do not record who opens a link. Basic analytics: Vercel Web Analytics gives us anonymous, aggregate traffic — it uses no cookies and does not profile or track you across sites.

We do not collect payment info (the Service is free), advertising identifiers, or precise location.

## Why, and legal basis
We process data to provide the Service you signed up for (performance of a contract) and to understand basic traffic (legitimate interests). No automated decision-making or profiling.

## Sharing links
A share link is public to anyone who has it — they can view only, without signing in. A link is unguessable but not secret; you can revoke or expire it. You are responsible for what you choose to share.

## Who we share data with
We do not sell your data. We rely on Supabase (database + authentication) and Vercel (hosting + anonymous analytics), who process data on our behalf under their own terms and may process it outside your country under their own safeguards. We may disclose data only if legally compelled.

## Retention
We keep your account and content while your account exists. Deleting your account permanently removes your profile, workspaces, sheets, columns, rows and share links — it cascades and cannot be undone.

## Your rights
Depending on where you live (GDPR, CCPA, PH Data Privacy Act), you may access, correct, delete, export, or object to processing of your data. Email [YOUR_EMAIL] to exercise these. Account deletion is currently handled manually on request, within 30 days of a verified request; we may confirm your identity first. You may also complain to your local data protection authority.

## Security
Database-level Row Level Security means each account reaches only its own data, enforced by the database on every request. Passwords are stored hashed; we never see your plaintext password. Connections use HTTPS. No system is perfectly secure; we will notify affected users of any breach as required by law.

## Children
Not directed at children under 13 (or your country's minimum, if higher). Contact [YOUR_EMAIL] if you believe a child created an account.

## Changes
We may update this policy; material changes update the date above.

Questions: [YOUR_EMAIL]. This is not legal advice.`,
  },

  cookies: {
    id: 'cookies',
    title: 'Cookie & Local Storage Notice',
    body: `Last updated: ${'2026-08-12'}. Contact: [YOUR_EMAIL].

yours.db uses very little. This complements the Privacy Policy.

## What we store in your browser
Your sign-in session: to keep you signed in, Supabase stores a session token in your browser's local storage (technically not a cookie, but essential — without it you'd be signed out on every refresh). It stays on your device and is cleared when you sign out.

Your appearance preferences: your theme and accent colour are saved in local storage so the Service looks right immediately and you don't re-pick them. Per-device, no personal information.

Neither is used for tracking or advertising.

## Analytics
We use Vercel Web Analytics for anonymous, aggregate traffic (page views, approximate country, general device type). It uses no cookies and does not track you across sites or profile you, so it needs no consent banner.

## What we do not use
No advertising cookies. No third-party tracking cookies. No social media pixels. Because we use no advertising or cross-site tracking, there is no cookie-consent pop-up.

## Managing storage
Clearing your browser's site data signs you out and resets your theme; nothing else is affected, since your data lives in your account, not your browser. Signing out clears your session token. If we ever add anything that uses cookies or cross-site tracking, we will update this notice and ask consent where required.

Questions: [YOUR_EMAIL]. This is not legal advice.`,
  },
}

export const LEGAL_ORDER: LegalDoc['id'][] = ['privacy', 'terms', 'cookies']