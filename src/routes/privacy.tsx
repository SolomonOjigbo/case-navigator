// Privacy policy.
//
// Written against what the code actually does, not from a template. Every
// factual claim here was checked against the schema, the RLS policies and the
// deployed configuration before it was written down — including the two that
// were not true when the drafting started:
//
//   * three of the nine AI paths were not checking `ai_processing` consent.
//     Fixed in the same change as this page, so §5 is now accurate.
//   * deletion requests were recorded and nothing executed them. That job now
//     exists (deletion.functions.ts), so §10 describes what happens rather than
//     apologising for what does not.
//
// If you change what the product collects, shares or sends to a third party,
// this page changes in the same commit.
import { createFileRoute } from "@tanstack/react-router";

import { LegalPage, Clause, Points } from "@/components/legal/LegalPage";

export const Route = createFileRoute("/privacy")({
  component: Privacy,
  head: () => ({
    meta: [
      { title: "Privacy — CaseMap" },
      {
        name: "description",
        content:
          "What CaseMap collects, where it is stored, who can see it, and how to have it deleted.",
      },
    ],
  }),
});

function Privacy() {
  return (
    <LegalPage
      title="Privacy"
      intro="What we collect, where it is kept, who can see it, and how to get it back or have it deleted."
    >
      <Clause heading="1. Who this is">
        <p>
          CaseMap is operated from 55 Hallcrown Place, North York, Toronto, Ontario, M2J 4R1,
          Canada. For anything about your data — a copy of it, a correction, or deletion — write to{" "}
          <strong>mail@casemap.app</strong>.
        </p>
      </Clause>

      <Clause heading="2. What we collect">
        <p>Only what the product needs to work. In practice that is:</p>
        <Points
          items={[
            <>
              <strong>Your account.</strong> Your email address, and a password we never see in
              readable form. If you sign in with Google we receive your email address and name from
              Google, and nothing else.
            </>,
            <>
              <strong>Your community profile.</strong> The handle you choose, an optional display
              name and short bio, and your notification settings. This is what other people in the
              community see.
            </>,
            <>
              <strong>What you write in the community.</strong> Your topics, replies, likes and
              direct messages.
            </>,
            <>
              <strong>Your case, if you start one.</strong> What you write in the story sections,
              the documents you upload, the dates and events built from them, and the notes the app
              makes about where something is unclear.
            </>,
            <>
              <strong>Appointments.</strong> Who you booked, when, the short subject line you wrote,
              and the name you chose to show the professional.
            </>,
            <>
              <strong>A record of what happened.</strong> When you signed in, what you shared and
              with whom, and when a share was withdrawn — including the browser you used. This
              exists so you can see who reached your file, and so can we if you ask.
            </>,
            <>
              <strong>If you are a legal professional.</strong> Your licence number, jurisdiction,
              and any document you upload to prove you hold that licence.
            </>,
          ]}
        />
      </Clause>

      <Clause heading="3. What we do not do">
        <Points
          items={[
            "We do not sell your data, and we do not share it for advertising.",
            "We run no analytics, no tracking pixels and no third-party scripts. Nobody is measuring what you read here.",
            "We set one cookie, which remembers whether the menu is open. Your sign-in is kept in your browser's own storage, not in a cookie that follows you around.",
            "We do not build a profile of you, and we do not use your case to train anyone's AI model.",
            "We never send anything about your case to anyone unless you have chosen to share it.",
          ]}
        />
      </Clause>

      <Clause heading="4. Where your data is kept">
        <Points
          items={[
            <>
              <strong>In Canada.</strong> The database and your uploaded documents are stored with
              Supabase in the AWS Canada (Central) region, in Montreal.
            </>,
            <>
              <strong>The website itself</strong> is served by Vercel, which has servers in many
              countries. Pages are delivered from wherever is nearest to you; your data is not
              stored there.
            </>,
            <>
              <strong>Email</strong> is sent through Resend. They handle the message on its way to
              your inbox. We tell them your email address and the text of the message, which never
              contains anything about your case.
            </>,
            <>
              <strong>AI processing</strong> happens at Anthropic, in the United States, and only if
              you have given permission. See the next section.
            </>,
          ]}
        />
      </Clause>

      <Clause heading="5. Artificial intelligence, and your permission">
        <p>
          Some parts of CaseMap send text to an AI service run by Anthropic — for example to pull
          dates out of a document, or to notice where a document and your account do not line up.
        </p>
        <p>
          <strong>None of this happens unless you have turned it on.</strong> You are asked
          separately, you can withdraw permission at any time on the Consent screen, and every one
          of these features checks your permission each time it runs. If permission is off, the
          feature stops and tells you why rather than proceeding.
        </p>
        <p>
          What is sent is the text of the material being examined. Your name, your email address and
          your account identifier are not sent with it. Anthropic processes the request and returns
          a result; under their terms for business customers, they do not use it to train their
          models.
        </p>
        <p>
          Machine translation is a separate permission, asked for separately, and works the same
          way.
        </p>
      </Clause>

      <Clause heading="6. Who can see your case">
        <Points
          items={[
            "You, always.",
            "A legal professional you have chosen to share with — and only the parts you chose, and only until the share expires or you withdraw it.",
            "Nobody else. Not other people in the community, not other professionals at the same firm, and not other CaseMap users under any circumstances.",
          ]}
        />
        <p>
          Every share is written down: what was shared, with whom, when it started and when it
          ended. You can read that list yourself on the Activity screen. Booking an appointment with
          a lawyer does <strong>not</strong> share your case — that is a separate decision you make
          separately.
        </p>
      </Clause>

      <Clause heading="7. The community is kept apart from your case">
        <p>
          You post under a handle you choose. Nobody in the community can see anything about your
          case, and nothing you write in the community is attached to it. Before you post publicly,
          CaseMap checks your draft for things that could identify you — a phone number, an address,
          a full date of birth — and warns you. It warns; it does not stop you.
        </p>
        <p>
          Direct messages are readable by the two people in the conversation and by nobody else. If
          you report a conversation, only the specific messages you tick are shown to a moderator.
        </p>
      </Clause>

      <Clause heading="8. Keeping your data safe">
        <Points
          items={[
            "Everything travels over an encrypted connection, and is encrypted where it is stored.",
            "Access rules are enforced by the database itself, not only by the app, so a fault in the website cannot hand your case to someone else.",
            "Your documents cannot be altered or deleted once uploaded, including by you — a new version is added instead. This protects the record; see the next section for how to have it removed entirely.",
            "Only the people who operate CaseMap can reach the underlying systems, and what they do is logged.",
          ]}
        />
      </Clause>

      <Clause heading="9. How long we keep it">
        <p>
          While your account is open, we keep what you have written so that it is there when you
          come back. Your story is kept as a series of versions rather than overwritten, so you can
          see what you said before and when you changed it.
        </p>
      </Clause>

      <Clause heading="10. Deleting your data">
        <p>
          You can ask for your case to be deleted from the Privacy and Sharing screen. The request
          is recorded with a date thirty days ahead, so you have time to change your mind, and you
          can cancel it during that period.
        </p>
        <p>
          On that date a scheduled job removes the case: everything you wrote, every document you
          uploaded and every file behind it, and everything the app worked out from them. The record
          that you asked for a deletion and that it was carried out is kept — it is the only proof
          the deletion happened, and it no longer refers to anything.
        </p>
        <p>
          Your account and anything you wrote in the community are <strong>not</strong> deleted by
          this. The community was built to be separate from your case, and other people may be
          mid-conversation with you. If you want your account removed as well, write to{" "}
          <strong>mail@casemap.app</strong> and we will do it by hand.
        </p>
      </Clause>

      <Clause heading="11. Your rights">
        <p>
          Canadian privacy law gives you the right to see what we hold about you, to have mistakes
          corrected, and to withdraw a permission you gave earlier. Write to{" "}
          <strong>mail@casemap.app</strong> and we will answer within thirty days.
        </p>
        <p>
          If you are not satisfied with how we have handled it, you may complain to the Office of
          the Privacy Commissioner of Canada. Using CaseMap has nothing to do with your immigration
          or asylum claim, and complaining to us or about us cannot affect it.
        </p>
      </Clause>

      <Clause heading="12. Children">
        <p>
          CaseMap is not built for children and you must be 16 or older to create an account. If you
          believe a child has an account, write to <strong>mail@casemap.app</strong> and we will
          remove it.
        </p>
      </Clause>

      <Clause heading="13. Changes to this page">
        <p>
          If we change what we collect or who we send it to, we will change this page and update the
          date at the top. While CaseMap is in testing, expect this page to change as the product
          does.
        </p>
      </Clause>
    </LegalPage>
  );
}
