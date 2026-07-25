/**
 * Story intake configuration — versioned, reviewable by a lawyer.
 *
 * WORDING RULES (do not break):
 * - Plain language, CEFR B1. Short sentences. Everyday words. Active voice.
 * - Second person to the applicant.
 * - Never pressure, praise, alarm, or suggest one answer is better than another.
 * - Every question is skippable with no penalty and no warning.
 * - "I don't remember" and "I'd rather discuss with a lawyer" are always valid.
 *
 * When editing this file:
 * 1. Bump `version` on any changed question so prior answers stay attributed
 *    to the wording the user actually saw.
 * 2. Keep helper text neutral. Do not ask leading questions.
 * 3. Do not add fields for credibility, strength, likelihood, or outcome.
 */

export type StoryInputType =
  | "short_text"
  | "long_text"
  | "date_certainty"
  | "narrative_with_provenance";

export type StoryQuestion = {
  /** Stable identifier stored in story_responses.prompt_code. Never rename. */
  key: string;
  /** Bump when the wording changes so old answers keep their original prompt version. */
  version: string;
  label: string;
  helper?: string;
  input: StoryInputType;
  /** Only shown for date-carrying questions. Never required. */
  captureDate?: boolean;
  /** Placeholder shown in the input, kept neutral. */
  placeholder?: string;
};

export type StorySection = {
  key: string;
  title: string;
  intro: string;
  /** Narrative sections capture experiential_provenance. */
  narrative?: boolean;
  questions: StoryQuestion[];
};

/**
 * Sections are shown in this order. The list at /app/story shows visited /
 * not visited only — never a percentage, score, or "strength" indicator.
 */
export const STORY_SECTIONS: StorySection[] = [
  {
    key: "personal_information",
    title: "About you",
    intro: "A few basics about you. Skip anything you are not ready to answer.",
    questions: [
      { key: "pi_full_name", version: "v1", label: "Your full name, the way you write it.", input: "short_text" },
      { key: "pi_other_names", version: "v1", label: "Any other names you have been known by.", helper: "Nicknames, married names, transliterations.", input: "long_text" },
      { key: "pi_date_of_birth", version: "v1", label: "Your date of birth.", helper: "If you don't know the exact day, that is fine.", input: "date_certainty", captureDate: true },
      { key: "pi_place_of_birth", version: "v1", label: "The town or city where you were born.", input: "short_text" },
      { key: "pi_nationality", version: "v1", label: "The country or countries that consider you a citizen.", input: "long_text" },
      { key: "pi_ethnicity", version: "v1", label: "Your ethnicity, if you want to share it.", helper: "You can leave this blank.", input: "long_text" },
      { key: "pi_religion", version: "v1", label: "Your religion, if you want to share it.", helper: "You can leave this blank.", input: "long_text" },
      { key: "pi_languages", version: "v1", label: "The languages you speak, and how well.", input: "long_text" },
    ],
  },
  {
    key: "family_household",
    title: "Family and household",
    intro: "The people close to you. Only what you want to share.",
    questions: [
      { key: "fh_parents", version: "v1", label: "Your parents — names, where they live, and how they are today.", input: "long_text" },
      { key: "fh_siblings", version: "v1", label: "Your brothers and sisters, if any.", input: "long_text" },
      { key: "fh_partner", version: "v1", label: "Your partner or spouse, if you have one.", input: "long_text" },
      { key: "fh_children", version: "v1", label: "Your children, if you have any.", input: "long_text" },
      { key: "fh_other", version: "v1", label: "Anyone else who lived in your household.", input: "long_text" },
    ],
  },
  {
    key: "places_of_residence",
    title: "Places you have lived",
    intro: "Add each place you have lived. You can add more later.",
    questions: [
      { key: "pr_places", version: "v1", label: "List the towns, cities, or countries you have lived in.", helper: "You can write them in any order you remember.", input: "long_text" },
      { key: "pr_most_recent_home", version: "v1", label: "The address or area where you lived before you left.", input: "long_text" },
      { key: "pr_when_left", version: "v1", label: "When did you leave that home?", input: "date_certainty", captureDate: true },
    ],
  },
  {
    key: "important_dates",
    title: "Important dates",
    intro: "Dates that matter for your story. Approximate is fine.",
    questions: [
      { key: "id_left_country", version: "v1", label: "The date you left your country.", input: "date_certainty", captureDate: true },
      { key: "id_arrived_here", version: "v1", label: "The date you arrived in Canada.", input: "date_certainty", captureDate: true },
      { key: "id_other", version: "v1", label: "Other dates you want to record.", helper: "Anniversaries, court dates, releases from detention — anything that helps you place events in time.", input: "long_text" },
    ],
  },
  {
    key: "organizations_groups",
    title: "Groups you belong to",
    intro: "Organizations, parties, unions, religious or community groups. Only what you want to share.",
    questions: [
      { key: "og_memberships", version: "v1", label: "Groups you were part of, and what you did there.", input: "long_text" },
      { key: "og_activities", version: "v1", label: "Any activism, volunteering, or public roles.", input: "long_text" },
    ],
  },
  {
    key: "significant_incidents",
    title: "Events that happened to you",
    intro: "Describe events in your own words. Take your time. You can pause and come back.",
    narrative: true,
    questions: [
      { key: "si_first", version: "v1", label: "An event that shaped your decision to leave.", helper: "What happened, when it happened, and where.", input: "narrative_with_provenance", captureDate: true },
      { key: "si_others", version: "v1", label: "Other events you want to record.", helper: "You can add one at a time. There is no limit.", input: "narrative_with_provenance", captureDate: true },
    ],
  },
  {
    key: "threats_and_fears",
    title: "Threats and what you fear",
    intro: "What has been said or done to you, and what you fear may happen. Your own words.",
    narrative: true,
    questions: [
      { key: "tf_past_threats", version: "v1", label: "Threats or harm you have experienced.", input: "narrative_with_provenance", captureDate: true },
      { key: "tf_who", version: "v1", label: "Who you believe is behind the harm or threats.", input: "narrative_with_provenance" },
      { key: "tf_future_fear", version: "v1", label: "What you are afraid may happen if you return.", input: "long_text" },
    ],
  },
  {
    key: "authorities_contacted",
    title: "Authorities you contacted",
    intro: "Police, courts, hospitals, or other officials. Only if it is relevant.",
    questions: [
      { key: "ac_police", version: "v1", label: "Any contact with police.", helper: "What happened, and when.", input: "long_text", captureDate: true },
      { key: "ac_courts", version: "v1", label: "Any court, tribunal, or legal case.", input: "long_text", captureDate: true },
      { key: "ac_medical", version: "v1", label: "Any medical treatment related to what happened.", input: "long_text", captureDate: true },
      { key: "ac_other", version: "v1", label: "Any other authority you spoke to.", input: "long_text" },
    ],
  },
  {
    key: "travel_history",
    title: "How you travelled",
    intro: "The route you took to get here. Approximate is fine.",
    questions: [
      { key: "th_route", version: "v1", label: "The countries or places you passed through.", input: "long_text" },
      { key: "th_method", version: "v1", label: "How you travelled — plane, bus, on foot, boat.", input: "long_text" },
      { key: "th_documents", version: "v1", label: "The documents you used to travel, if any.", helper: "Passport, visa, ID card. It is safe to say if you had none.", input: "long_text" },
      { key: "th_help", version: "v1", label: "Anyone who helped you travel.", helper: "You do not have to name them if you would rather not.", input: "long_text" },
    ],
  },
  {
    key: "previous_applications",
    title: "Any previous applications",
    intro: "Any refugee, asylum, or immigration application you have made before — in Canada or elsewhere.",
    questions: [
      { key: "pa_where", version: "v1", label: "Where you applied.", input: "long_text" },
      { key: "pa_when", version: "v1", label: "When you applied.", input: "date_certainty", captureDate: true },
      { key: "pa_outcome", version: "v1", label: "What the outcome was, if you know.", input: "long_text" },
    ],
  },
  {
    key: "witnesses",
    title: "People who can support what you say",
    intro: "People who saw what happened, or who know your situation. Only if it is safe to share.",
    questions: [
      { key: "wi_who", version: "v1", label: "Who they are and how they know what happened.", input: "long_text" },
      { key: "wi_contact", version: "v1", label: "How they can be reached, if you know.", helper: "You can leave this blank.", input: "long_text" },
      { key: "wi_safety", version: "v1", label: "Anything a lawyer should know about their safety.", input: "long_text" },
    ],
  },
  {
    key: "documents_available",
    title: "Documents you have",
    intro: "Documents you already have with you. You can upload them later.",
    questions: [
      { key: "da_list", version: "v1", label: "List the documents you have.", helper: "Passport, ID card, birth certificate, medical papers, letters, photos — anything.", input: "long_text" },
    ],
  },
  {
    key: "documents_unavailable",
    title: "Documents you do not have",
    intro: "Documents you cannot get, or that were lost or taken.",
    questions: [
      { key: "du_list", version: "v1", label: "What is missing, and what happened to it.", input: "long_text" },
    ],
  },
  {
    key: "cannot_remember",
    title: "Things you cannot remember clearly",
    intro: "It is normal not to remember every detail. Write what you can.",
    questions: [
      { key: "cr_notes", version: "v1", label: "Anything you know is true but cannot place clearly in time or detail.", input: "long_text" },
    ],
  },
  {
    key: "not_ready_to_discuss",
    title: "Things you are not ready to discuss",
    intro: "You can list topics without describing them. A lawyer will decide with you when to come back to them.",
    questions: [
      { key: "nr_topics", version: "v1", label: "Topics you would rather come back to later.", input: "long_text" },
    ],
  },
];

export const SECTION_MAP: Record<string, StorySection> = Object.fromEntries(
  STORY_SECTIONS.map((s) => [s.key, s]),
);

export function findQuestion(sectionKey: string, questionKey: string): StoryQuestion | undefined {
  return SECTION_MAP[sectionKey]?.questions.find((q) => q.key === questionKey);
}
