// Fixed refusal responses for the Help/Ask panel.
// These strings are shown VERBATIM. No model is ever called for these intents.
// A lawyer should be able to read and edit this file directly.
//
// Every response follows the same shape:
//   - decline WITHOUT moralising or suggesting the person meant harm
//   - name ONE concrete thing the app can do next
//   - offer to route the question to a professional
//
// If you add a new category here, add the matching detector in
// src/lib/refusal-classifier.ts and cover it in the tests.

export type RefusalCategory =
  | "outcome_prediction"
  | "coaching"
  | "evidence_fabrication"
  | "document_alteration"
  | "authenticity"
  | "credibility"
  | "legal_advice";

export type RefusalResponse = {
  category: RefusalCategory;
  message: string;
  nextAction: { label: string; href?: string };
  offerProfessional: string;
};

const PRO = "Would you like to send this question to a professional to look at?";

export const REFUSAL_RESPONSES: Record<RefusalCategory, RefusalResponse> = {
  outcome_prediction: {
    category: "outcome_prediction",
    message:
      "This tool cannot say whether a claim will be approved, and it will not give a percentage or a chance. Only a decision-maker can decide a case.",
    nextAction: {
      label: "Open the things to check list",
      href: "/app/clarify",
    },
    offerProfessional: PRO,
  },
  coaching: {
    category: "coaching",
    message:
      "This tool will not tell you what to say or which wording is stronger. Your own words are what matter here.",
    nextAction: {
      label: "Go back to your story",
      href: "/app/story",
    },
    offerProfessional: PRO,
  },
  evidence_fabrication: {
    category: "evidence_fabrication",
    message:
      "This tool will not write letters, reports, or other documents for you to submit as evidence. It only organises material you already have.",
    nextAction: {
      label: "Upload a document you already have",
      href: "/app/documents",
    },
    offerProfessional: PRO,
  },
  document_alteration: {
    category: "document_alteration",
    message:
      "This tool never changes the content of an uploaded document. Your original file is kept exactly as you sent it.",
    nextAction: {
      label: "Open your documents",
      href: "/app/documents",
    },
    offerProfessional: PRO,
  },
  authenticity: {
    category: "authenticity",
    message:
      "This tool cannot say whether a document is real or not. That is not something it is allowed to decide.",
    nextAction: {
      label: "Add a note about how you obtained this document",
      href: "/app/documents",
    },
    offerProfessional: PRO,
  },
  credibility: {
    category: "credibility",
    message:
      "This tool does not judge whether a story sounds believable. That is not its role.",
    nextAction: {
      label: "Go back to your story",
      href: "/app/story",
    },
    offerProfessional: PRO,
  },
  legal_advice: {
    category: "legal_advice",
    message:
      "This tool cannot give legal advice about your case, tell you if you qualify, or tell you what deadline applies to you. Only a qualified professional can do that.",
    nextAction: {
      label: "See questions for your lawyer",
      href: "/app/questions",
    },
    offerProfessional: PRO,
  },
};