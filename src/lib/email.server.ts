// Sending email. Server-only.
//
// CaseMap emails people about appointments and nothing else. That constraint
// is the whole design here:
//
//   * No case material, ever. A message says who, when, and how to reach the
//     appointment. Someone's inbox is not somewhere their asylum claim should
//     end up, and mail passes through servers this product does not control.
//   * Plain text. No tracking pixels, no remote images, no click wrapping —
//     all three tell a third party when a refugee opened their mail.
//   * Off unless configured. With no provider key the send is recorded as
//     "skipped" rather than attempted, so a deployment without email is a
//     deployment without email, not a stream of silent failures.
//
// The provider is behind one function so swapping Resend for anything else
// touches this file only.

export type EmailMessage = {
  to: string;
  subject: string;
  /** Plain text. Kept short enough to read on a phone notification. */
  text: string;
};

export type SendResult =
  | { status: "sent"; provider: string; ref: string | null }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string };

/** Where mail appears to come from. Overridable per deployment. */
function fromAddress(): string {
  return process.env.EMAIL_FROM ?? "CaseMap <notifications@casemap.app>";
}

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { status: "skipped", reason: "no_provider_configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { status: "failed", error: `${res.status} ${body}`.slice(0, 500) };
    }
    const json = (await res.json()) as { id?: string };
    return { status: "sent", provider: "resend", ref: json.id ?? null };
  } catch (e) {
    return { status: "failed", error: (e instanceof Error ? e.message : String(e)).slice(0, 500) };
  }
}

// -------------------------------------------------------------------------
// The messages themselves.
//
// Written to be read by someone who is frightened and may not read English
// well. Short sentences, the time first, and no instruction that sounds like
// a summons.
// -------------------------------------------------------------------------

export type AppointmentFacts = {
  when: string;
  mode: string;
  /** The other person's name, as they chose to give it. */
  otherName: string;
  topic: string | null;
  appUrl: string;
};

export function bookedMessage(f: AppointmentFacts, forRole: "applicant" | "professional") {
  return forRole === "applicant"
    ? {
        subject: `Appointment booked — ${f.when}`,
        text: [
          `Your appointment with ${f.otherName} is booked.`,
          ``,
          `When: ${f.when}`,
          `How: ${f.mode}`,
          f.topic ? `What you wrote: ${f.topic}` : null,
          ``,
          `You can cancel it at any time here: ${f.appUrl}`,
          ``,
          `This appointment does not give the lawyer access to your case.`,
          `Legal advice happens in the appointment itself.`,
        ]
          .filter((l) => l !== null)
          .join("\n"),
      }
    : {
        subject: `New consultation booked — ${f.when}`,
        text: [
          `${f.otherName} has booked a consultation with you.`,
          ``,
          `When: ${f.when}`,
          `How: ${f.mode}`,
          f.topic ? `Subject: ${f.topic}` : null,
          ``,
          `Your bookings: ${f.appUrl}`,
        ]
          .filter((l) => l !== null)
          .join("\n"),
      };
}

export function cancelledMessage(f: AppointmentFacts, forRole: "applicant" | "professional") {
  return {
    subject: `Appointment cancelled — ${f.when}`,
    text: [
      forRole === "applicant"
        ? `Your appointment with ${f.otherName} on ${f.when} has been cancelled.`
        : `The consultation with ${f.otherName} on ${f.when} has been cancelled.`,
      ``,
      forRole === "applicant"
        ? `Nothing else has changed, and you can book another time here: ${f.appUrl}`
        : `That time is free again: ${f.appUrl}`,
    ].join("\n"),
  };
}

export function reminderMessage(f: AppointmentFacts, forRole: "applicant" | "professional") {
  return {
    subject: `Reminder — appointment ${f.when}`,
    text: [
      forRole === "applicant"
        ? `A reminder that your appointment with ${f.otherName} is coming up.`
        : `A reminder of your consultation with ${f.otherName}.`,
      ``,
      `When: ${f.when}`,
      `How: ${f.mode}`,
      ``,
      forRole === "applicant"
        ? `If you cannot make it, you can cancel here: ${f.appUrl}`
        : `Your bookings: ${f.appUrl}`,
    ].join("\n"),
  };
}
