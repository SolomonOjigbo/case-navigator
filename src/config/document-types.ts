/**
 * Closed catalogue of document types the advisor may suggest.
 *
 * The model does NOT write document names. It picks ids from this list, and
 * every id it returns is checked against the catalogue before anything is
 * stored. That is the whole safety design: a model that can only choose from
 * a fixed set cannot invent "a certificate of persecution", and the wording a
 * person actually reads is templated in code rather than generated.
 *
 * Descriptions say what a document IS. None of them says a document helps, is
 * required, strengthens anything, or affects an outcome — that would be legal
 * advice, which this product does not give.
 */

export type DocumentTypeDef = {
  id: string;
  /** Sentence-case name, for headings. */
  label: string;
  /** Same name with its article, for use inside a sentence. */
  phrase: string;
  /** Plain description of what the document is. Never why it matters. */
  description: string;
  category: DocumentCategory;
};

export type DocumentCategory =
  | "identity"
  | "travel"
  | "detention"
  | "authorities"
  | "medical"
  | "affiliation"
  | "threats"
  | "work_study"
  | "property"
  | "witnesses"
  | "country_conditions"
  | "immigration"
  | "family";

export const DOCUMENT_TYPES: readonly DocumentTypeDef[] = [
  // Identity
  {
    id: "passport",
    label: "Passport",
    phrase: "a passport",
    category: "identity",
    description:
      "The travel document issued by a country's government, including any pages with stamps.",
  },
  {
    id: "national_id",
    label: "National identity card",
    phrase: "a national identity card",
    category: "identity",
    description: "An identity card issued by a national or regional authority.",
  },
  {
    id: "birth_certificate",
    label: "Birth certificate",
    phrase: "a birth certificate",
    category: "identity",
    description: "A record of birth issued by a civil registry.",
  },
  {
    id: "household_register",
    label: "Household or family register",
    phrase: "a household or family register",
    category: "identity",
    description: "A civil record listing the members of a household, used in some countries.",
  },

  // Travel
  {
    id: "visa",
    label: "Visa",
    phrase: "a visa",
    category: "travel",
    description: "A visa or entry permit issued by any country, including expired ones.",
  },
  {
    id: "ticket_boarding_pass",
    label: "Ticket or boarding pass",
    phrase: "a ticket or boarding pass",
    category: "travel",
    description: "A ticket, booking confirmation, or boarding pass for a journey.",
  },
  {
    id: "border_stamp",
    label: "Border stamp or entry record",
    phrase: "a border stamp or entry record",
    category: "travel",
    description: "A stamp or slip showing entry to or exit from a country.",
  },

  // Detention, arrest, courts
  {
    id: "arrest_warrant",
    label: "Arrest warrant",
    phrase: "an arrest warrant",
    category: "detention",
    description: "A document issued by a court or police authority ordering an arrest.",
  },
  {
    id: "court_summons",
    label: "Court summons or notice",
    phrase: "a court summons or notice",
    category: "detention",
    description: "A notice requiring someone to attend a court or tribunal.",
  },
  {
    id: "charge_sheet",
    label: "Charge sheet or indictment",
    phrase: "a charge sheet or indictment",
    category: "detention",
    description: "A document setting out the charges brought against someone.",
  },
  {
    id: "release_paper",
    label: "Release or bail paper",
    phrase: "a release or bail paper",
    category: "detention",
    description: "A document recording release from custody, or the conditions of it.",
  },
  {
    id: "detention_record",
    label: "Detention record",
    phrase: "a detention record",
    category: "detention",
    description: "A record from a prison, police station, or detention facility.",
  },
  {
    id: "court_judgment",
    label: "Court judgment or decision",
    phrase: "a court judgment or decision",
    category: "detention",
    description: "A written decision issued by a court or tribunal.",
  },

  // Authorities
  {
    id: "police_report",
    label: "Police report",
    phrase: "a police report",
    category: "authorities",
    description: "A report made to police, or a copy of a complaint that was filed.",
  },
  {
    id: "complaint_receipt",
    label: "Complaint receipt",
    phrase: "a complaint receipt",
    category: "authorities",
    description: "A receipt or reference number given when a complaint was submitted.",
  },
  {
    id: "official_letter",
    label: "Letter from an authority",
    phrase: "a letter from an authority",
    category: "authorities",
    description: "A letter or notice from a government body, ministry, or local official.",
  },

  // Medical
  {
    id: "medical_report",
    label: "Medical report",
    phrase: "a medical report",
    category: "medical",
    description: "A report or note from a doctor, clinic, or hospital.",
  },
  {
    id: "hospital_discharge",
    label: "Hospital discharge paper",
    phrase: "a hospital discharge paper",
    category: "medical",
    description: "A discharge summary or admission record from a hospital stay.",
  },
  {
    id: "psychological_report",
    label: "Psychological or counselling report",
    phrase: "a psychological or counselling report",
    category: "medical",
    description: "A report or letter from a psychologist, psychiatrist, or counsellor.",
  },
  {
    id: "injury_photos",
    label: "Photographs of injuries",
    phrase: "photographs of injuries",
    category: "medical",
    description: "Photographs taken of injuries, with the date they were taken if known.",
  },

  // Affiliation and membership
  {
    id: "membership_card",
    label: "Membership card or document",
    phrase: "a membership card or document",
    category: "affiliation",
    description: "A card or document showing membership of a party, union, or organisation.",
  },
  {
    id: "organisation_letter",
    label: "Letter from an organisation",
    phrase: "a letter from an organisation",
    category: "affiliation",
    description: "A letter from a religious, community, political, or civil society organisation.",
  },
  {
    id: "publication_or_post",
    label: "Article, publication, or post",
    phrase: "an article, publication, or post",
    category: "affiliation",
    description: "Something written or published by the person, or about them.",
  },

  // Threats and communications
  {
    id: "threatening_message",
    label: "Threatening message or letter",
    phrase: "a threatening message or letter",
    category: "threats",
    description: "A letter, note, text message, or email containing a threat.",
  },
  {
    id: "message_screenshots",
    label: "Screenshots of messages",
    phrase: "screenshots of messages",
    category: "threats",
    description: "Screenshots of messages or calls, showing the sender and date where possible.",
  },

  // Work and study
  {
    id: "employment_letter",
    label: "Employment letter or contract",
    phrase: "an employment letter or contract",
    category: "work_study",
    description: "A letter, contract, or payslip from an employer.",
  },
  {
    id: "education_record",
    label: "School or university record",
    phrase: "a school or university record",
    category: "work_study",
    description: "A diploma, transcript, enrolment letter, or student card.",
  },

  // Property
  {
    id: "property_document",
    label: "Property or tenancy document",
    phrase: "a property or tenancy document",
    category: "property",
    description: "A title deed, lease, rent receipt, or utility bill for a home or land.",
  },

  // Witnesses
  {
    id: "witness_letter",
    label: "Letter from a witness",
    phrase: "a letter from a witness",
    category: "witnesses",
    description: "A written account from someone who saw or knows about what happened.",
  },
  {
    id: "sworn_statement",
    label: "Sworn statement or affidavit",
    phrase: "a sworn statement or affidavit",
    category: "witnesses",
    description: "A statement signed in front of a notary, commissioner, or similar official.",
  },

  // Country conditions
  {
    id: "news_report",
    label: "News report",
    phrase: "a news report",
    category: "country_conditions",
    description: "A newspaper, broadcast, or online report about events described.",
  },
  {
    id: "ngo_report",
    label: "Report from an organisation",
    phrase: "a report from an organisation",
    category: "country_conditions",
    description: "A published report from a human rights or humanitarian organisation.",
  },

  // Immigration history
  {
    id: "prior_application",
    label: "Previous application or decision",
    phrase: "a previous application or decision",
    category: "immigration",
    description:
      "Papers from an earlier application to any country, including any decision received.",
  },
  {
    id: "immigration_correspondence",
    label: "Letter from an immigration authority",
    phrase: "a letter from an immigration authority",
    category: "immigration",
    description: "Correspondence with an immigration or border authority.",
  },

  // Family
  {
    id: "marriage_certificate",
    label: "Marriage certificate",
    phrase: "a marriage certificate",
    category: "family",
    description: "A record of marriage, divorce, or civil partnership.",
  },
  {
    id: "death_certificate",
    label: "Death certificate",
    phrase: "a death certificate",
    category: "family",
    description: "A record of death issued by a civil registry or hospital.",
  },
] as const;

export const DOCUMENT_TYPE_IDS: ReadonlySet<string> = new Set(DOCUMENT_TYPES.map((d) => d.id));

export function documentTypeById(id: string): DocumentTypeDef | undefined {
  return DOCUMENT_TYPES.find((d) => d.id === id);
}
