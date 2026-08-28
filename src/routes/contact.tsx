// Contact.
//
// Three addresses were supplied, so each one is given a job. An undifferentiated
// list of inboxes makes a person guess, and a person with a privacy request who
// guesses wrong waits a week for an answer.
//
// No contact form. A form would mean collecting a message body from someone who
// may be describing their situation, storing it, and emailing it onward — three
// handling steps for something a mail client already does. Email addresses are
// also reachable from a device that is not this one, which matters if someone
// has lost access to their account.
import { createFileRoute } from "@tanstack/react-router";
import { Mail, MapPin, ShieldQuestion, Building2, AlertTriangle } from "lucide-react";

import { LegalPage } from "@/components/legal/LegalPage";

export const Route = createFileRoute("/contact")({
  component: Contact,
  head: () => ({
    meta: [
      { title: "Contact — CaseMap" },
      {
        name: "description",
        content: "How to reach CaseMap: postal address in Toronto, and who to email about what.",
      },
    ],
  }),
});

const INBOXES = [
  {
    icon: Mail,
    address: "info@casemap.app",
    label: "General questions",
    body: "Anything about how the app works, or something you cannot get to work. This is the one to use if you are not sure.",
  },
  {
    icon: ShieldQuestion,
    address: "mail@casemap.app",
    label: "Your data and privacy",
    body: "A copy of what we hold about you, a correction, withdrawing a permission, or deleting your account. We answer these within thirty days, usually sooner.",
  },
  {
    icon: Building2,
    address: "contact@casemap.app",
    label: "Organisations and legal professionals",
    body: "Legal professionals who want to be listed, settlement agencies and clinics, partnerships, and press.",
  },
];

function Contact() {
  return (
    <LegalPage
      title="Contact us"
      intro="Where we are, and who to write to about what."
      interim={false}
    >
      <section className="grid gap-3">
        <h2 className="text-section-title m-0 text-foreground">Email</h2>
        <ul className="m-0 grid list-none gap-3 p-0">
          {INBOXES.map(({ icon: Icon, address, label, body }) => (
            <li key={address} className="surface-card p-4 md:p-5">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-primary"
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-section-title m-0 text-foreground">{label}</h3>
                  <a
                    href={`mailto:${address}`}
                    className="mt-0.5 inline-block font-medium text-primary"
                  >
                    {address}
                  </a>
                  <p className="m-0 mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-3">
        <h2 className="text-section-title m-0 text-foreground">Post</h2>
        <div className="surface-card p-4 md:p-5">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-primary"
            >
              <MapPin className="h-4 w-4" />
            </span>
            <address className="m-0 text-[0.9375rem] leading-relaxed text-foreground not-italic">
              CaseMap
              <br />
              55 Hallcrown Place
              <br />
              North York, Toronto
              <br />
              Ontario M2J 4R1
              <br />
              Canada
            </address>
          </div>
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-section-title m-0 text-foreground">What to expect</h2>
        <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
          CaseMap is a small team and is currently in testing. We usually reply within a few working
          days, and always within thirty days for anything about your data. Please write in English
          or Arabic if you can; we will do our best with other languages.
        </p>
        <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
          Please do not send us documents or details of your claim by email. Email is not a secure
          way to send them, and we are not able to advise you on your case. If you want a
          professional to see your file, share it inside the app, where you control exactly what is
          shared and can withdraw it.
        </p>
      </section>

      {/* Deliberately the last thing on the page, and the only alarming thing
          on it. Someone scanning for a phone number in a crisis should hit
          this rather than an inbox that answers in three days. */}
      <div role="note" className="banner-attention flex items-start gap-3 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="m-0">
          <strong>We cannot help in an emergency.</strong> If you are in immediate danger, contact
          your local emergency services. In Canada that is 911. Nothing here should delay you
          getting help.
        </p>
      </div>
    </LegalPage>
  );
}
