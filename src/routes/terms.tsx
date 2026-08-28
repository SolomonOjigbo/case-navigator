// Terms of service.
//
// Interim terms for the testing period. Two things carry more weight here than
// anything else, and both are stated early rather than buried: that CaseMap is
// not a law firm and gives no legal advice, and that verifying a professional's
// licence is a check on a document, not a recommendation of that person.
//
// Written in short sentences on purpose. A large share of the people agreeing
// to this read English as a second language, and terms nobody can read are not
// terms anyone has agreed to.
import { createFileRoute } from "@tanstack/react-router";

import { LegalPage, Clause, Points } from "@/components/legal/LegalPage";

export const Route = createFileRoute("/terms")({
  component: Terms,
  head: () => ({
    meta: [
      { title: "Terms — CaseMap" },
      {
        name: "description",
        content:
          "The rules for using CaseMap during testing, including what it is not and what we do not promise.",
      },
    ],
  }),
});

function Terms() {
  return (
    <LegalPage
      title="Terms of use"
      intro="The rules for using CaseMap, in plain language. Please read section 2 even if you read nothing else."
    >
      <Clause heading="1. Agreeing to these terms">
        <p>
          By creating an account you agree to these terms. If you do not agree, please do not use
          CaseMap. These are interim terms for the testing period and will be replaced before the
          product opens to the public.
        </p>
      </Clause>

      <Clause heading="2. CaseMap does not give legal advice">
        <p>
          <strong>
            CaseMap is not a law firm. We are not your lawyer. Nothing on this website is legal
            advice.
          </strong>
        </p>
        <p>
          CaseMap helps you organise your own information and put you in touch with people who are
          qualified. What the app tells you about your documents or your timeline is a suggestion to
          look at something — never a judgement about your claim, your credibility, or what will
          happen.
        </p>
        <p>
          What other people write in the community is their personal experience. It is not advice,
          and their situation is not yours. Decisions about your claim should be made with a
          qualified legal professional.
        </p>
        <p>
          Using CaseMap does not create a lawyer–client relationship with us. Booking a consultation
          creates a relationship with <em>that professional</em>, on their terms, not ours.
        </p>
      </Clause>

      <Clause heading="3. Who may use CaseMap">
        <Points
          items={[
            "You must be 16 or older.",
            "One account per person. Do not share your account with anyone.",
            "Give us an email address you can actually reach, because that is how we contact you.",
            "Do not pretend to be someone else, and do not claim to be a lawyer if you are not.",
          ]}
        />
      </Clause>

      <Clause heading="4. What you write stays yours">
        <p>
          Your story, your documents and your posts belong to you. We do not claim ownership of
          them.
        </p>
        <p>
          You give us permission to store and display them for the purpose of running the service —
          showing your post to other people in the community, showing your case to a professional
          you chose to share it with, and keeping it safe in between. That permission exists only so
          the product can work, and it ends when you delete the material.
        </p>
      </Clause>

      <Clause heading="5. Using the community">
        <p>The community only works if it is safe. So:</p>
        <Points
          items={[
            "Be decent to people. No harassment, threats, or abuse.",
            "Do not post anything that identifies someone else — their name, their photograph, where they live, or details of their case. They cannot consent on your behalf.",
            "Do not present yourself as qualified to advise, and do not tell someone what will happen in their case.",
            "No advertising, no recruiting clients, and no asking people for money.",
            "Do not post anything unlawful.",
          ]}
        />
        <p>
          You can report a post or a person, and you can block someone. We can hide content and
          suspend accounts. We will not always explain a decision in detail, because doing so can
          identify whoever reported it.
        </p>
      </Clause>

      <Clause heading="6. Legal professionals listed on CaseMap">
        <p>
          Before a professional appears in the directory, a person here checks the licence details
          they submitted.
        </p>
        <p>
          <strong>
            That check confirms a licence. It is not a recommendation, an endorsement, or an opinion
            about how good they are.
          </strong>{" "}
          We do not supervise their work and we are not responsible for the advice they give you.
        </p>
        <p>
          Any fee is arranged directly between you and the professional. CaseMap takes no payment
          and no commission. If something goes wrong in that relationship, it is between you and
          them, and their professional regulator.
        </p>
      </Clause>

      <Clause heading="7. What we do not promise while we are testing">
        <p>
          CaseMap is being tested. It may be unavailable, it may behave incorrectly, and features
          may change or disappear.
        </p>
        <p>
          <strong>
            Do not rely on CaseMap as the only place your information exists. Keep your own copies
            of anything that matters.
          </strong>{" "}
          During testing we may need to reset data. We will warn you before doing that if we
          possibly can.
        </p>
      </Clause>

      <Clause heading="8. Deadlines are yours to keep">
        <p>
          CaseMap does not track your legal deadlines and does not remind you about them. Missing a
          date in an immigration or asylum process can have serious consequences, and keeping track
          of those dates remains your responsibility and your lawyer's.
        </p>
      </Clause>

      <Clause heading="9. If something goes wrong">
        <p>
          We will do our best to run this carefully. But CaseMap is provided as it is, without
          guarantees, and we are not liable for loss that follows from using it — including a
          decision you made based on something in the app, or on something another user wrote.
        </p>
        <p>
          Nothing in these terms removes a right you have under Canadian consumer law, and nothing
          here limits our responsibility for something we did deliberately or with gross negligence.
        </p>
      </Clause>

      <Clause heading="10. Ending your use">
        <p>
          You can stop at any time and ask us to delete your data — see the Privacy page for how
          that works today.
        </p>
        <p>
          We can suspend or close an account that breaks these terms, particularly one that puts
          another person at risk. Where it is safe and fair to do so, we will tell you why.
        </p>
      </Clause>

      <Clause heading="11. Which law applies">
        <p>
          These terms are governed by the laws of the Province of Ontario and the laws of Canada
          that apply there. Disputes go to the courts of Ontario.
        </p>
      </Clause>

      <Clause heading="12. Changes">
        <p>
          We will update this page when the product changes, and change the date at the top. If we
          change something significant, we will tell you in the app rather than expecting you to
          notice.
        </p>
      </Clause>

      <Clause heading="13. In an emergency">
        <p>
          If you are in immediate danger, contact your local emergency services. CaseMap cannot help
          in an emergency and nothing here should delay you getting help.
        </p>
      </Clause>
    </LegalPage>
  );
}
