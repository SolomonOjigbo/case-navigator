// The forums (S6-1 to S6-4).
//
// Two things are worth holding in a test. The wall between the community and
// the case, because the community is now the front door and the case material
// behind it is the most sensitive thing this product holds. And the copy on
// the composer, because that notice is the only thing standing between a
// frightened person and publishing the name of their village.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import en from "@/i18n/locales/en.json";
import ar from "@/i18n/locales/ar.json";
import { findForbiddenWord } from "./clarify-language";
import { hitsForbiddenVocabulary, hitsProbabilityClaim } from "./guardrails";
import { topicHeading, TITLE_MAX, TITLE_MIN } from "./forum-service";

const forum = (en as unknown as { forum: Record<string, string> }).forum;
const src = (file: string) => readFileSync(join(process.cwd(), "src", file), "utf8");

describe("topic headings", () => {
  it("uses the title when there is one", () => {
    expect(topicHeading({ title: "Biometrics appointment", body: "anything" })).toBe(
      "Biometrics appointment",
    );
  });

  it("falls back to the first line for posts written before titles existed", () => {
    // The flat feed had no titles. Those rows are still there, and an empty
    // heading in the list would read as a deleted post.
    expect(topicHeading({ title: null, body: "Does anyone know\nhow long this takes?" })).toBe(
      "Does anyone know",
    );
  });

  it("truncates a long first line rather than filling the row", () => {
    const heading = topicHeading({ title: null, body: "x".repeat(200) });
    expect(heading.length).toBeLessThanOrEqual(80);
    expect(heading.endsWith("…")).toBe(true);
  });

  it("never returns an empty heading for a post with a body", () => {
    expect(topicHeading({ title: "   ", body: "Something happened." })).toBe("Something happened.");
  });

  it("keeps the title bounds in step with the database constraint", () => {
    // community_posts_title_len is 3..140.
    expect(TITLE_MIN).toBeGreaterThanOrEqual(3);
    expect(TITLE_MAX).toBeLessThanOrEqual(140);
  });
});

describe("the wall between the community and the case", () => {
  it("keeps case data out of the forum service entirely", () => {
    // The forum reads posts, comments, likes, categories and community
    // profiles. If a case-scoped table ever appears in this file, someone has
    // started joining a person's claim to their public posts.
    const code = src("lib/forum-service.ts");
    for (const table of [
      "cases",
      "story_responses",
      "documents",
      "events",
      "extracted_facts",
      "clarification_items",
      "consultations",
      "sharing_grants",
      "profiles", // as distinct from community_profiles
    ]) {
      expect(
        new RegExp(`from\\(["']${table}["']\\)`).test(code),
        `forum-service reads the case-scoped table "${table}"`,
      ).toBe(false);
    }
  });

  it("identifies people by community handle, never by their real name", () => {
    // `profiles.display_name` is the real name someone gave at signup.
    // `community_profiles` is the handle. The forum must only ever read the
    // second, and it does that through one shared lookup.
    const code = src("lib/forum-service.ts");
    expect(code).toContain("fetchAuthors");
    expect(/from\(["']profiles["']\)/.test(code)).toBe(false);
  });

  it("applies both the moderator filter and the personal block filter", () => {
    // hidden_at applies to everyone; blocks apply to one reader. Every listing
    // function needs both, and forgetting either is silent.
    const code = src("lib/forum-service.ts");
    // slice(1) drops the file header, which mentions the table in prose.
    // Only functions that *read* posts need the filters; createTopic inserts.
    const readers = code
      .split("export async function")
      .slice(1)
      // `.select()` also follows an insert, so exclude writers explicitly.
      .filter(
        (fn) =>
          /\.from\("community_posts"\)/.test(fn) && /\.select\(/.test(fn) && !/\.insert\(/.test(fn),
      );

    expect(readers.length, "no forum read functions found — has the file moved?").toBeGreaterThan(
      2,
    );

    for (const fn of readers) {
      const name = fn.slice(0, fn.indexOf("(")).trim();
      expect(fn.includes('is("hidden_at", null)'), `${name} does not hide moderated posts`).toBe(
        true,
      );
      // getTopic reads one row by id and is decorated afterwards; the block
      // filter for it lives in the RLS read policy on community_posts.
      expect(
        fn.includes("withoutBlocked") || name.startsWith("getTopic"),
        `${name} does not apply the block filter`,
      ).toBe(true);
    }
  });
});

describe("the notice shown before someone posts", () => {
  const notice = [
    forum.safety_heading,
    forum.safety_identifying,
    forum.safety_others,
    forum.safety_case,
    forum.safety_private,
  ];

  it("says plainly that the forum is public to signed-in members", () => {
    expect(forum.safety_heading.toLowerCase()).toContain("public");
    expect(forum.safety_heading.toLowerCase()).toContain("read");
  });

  it("names the specific things that identify a person", () => {
    // Generic advice ("be careful what you share") is not actionable to
    // someone who has never thought about it. Naming the categories is.
    const text = forum.safety_identifying.toLowerCase();
    for (const specific of ["name", "address", "date", "number"]) {
      expect(text, `the notice does not mention ${specific}`).toContain(specific);
    }
  });

  it("covers other people, not only the person posting", () => {
    expect(forum.safety_others.toLowerCase()).toContain("other people");
  });

  it("states the wall in both directions", () => {
    const text = forum.safety_case.toLowerCase();
    expect(text).toContain("nothing you write here");
    expect(text).toContain("nothing from your case");
  });

  it("offers somewhere else to say it rather than only forbidding", () => {
    expect(forum.safety_private.toLowerCase()).toContain("direct message");
  });

  it("makes no claim about anyone's case or its outcome", () => {
    for (const line of notice) {
      expect(hitsForbiddenVocabulary(line), line).toBeNull();
      expect(hitsProbabilityClaim(line), line).toBeNull();
      expect(findForbiddenWord(line), line).toBeNull();
    }
  });

  it("does not tell a frightened person they are doing something wrong", () => {
    const all = notice.join(" ").toLowerCase();
    for (const scolding of ["you must not", "never post", "you should not", "forbidden"]) {
      expect(all.includes(scolding), `the notice scolds: "${scolding}"`).toBe(false);
    }
  });

  it("exists in Arabic too", () => {
    const arForum = (ar as unknown as { forum: Record<string, string> }).forum;
    for (const key of [
      "safety_heading",
      "safety_identifying",
      "safety_others",
      "safety_case",
      "safety_private",
    ]) {
      expect(arForum[key], `ar.forum.${key} is missing`).toBeTruthy();
      expect(arForum[key]).not.toBe(forum[key]);
    }
  });
});

describe("forum copy", () => {
  it("promises no legal outcome anywhere", () => {
    for (const [key, value] of Object.entries(forum)) {
      expect(hitsForbiddenVocabulary(value), `${key}: ${value}`).toBeNull();
      expect(hitsProbabilityClaim(value), `${key}: ${value}`).toBeNull();
    }
  });

  it("invites a question rather than demanding a story", () => {
    // Someone arriving on day one is not ready to write an account of what
    // happened to them, and the empty state should not imply they must.
    expect(forum.empty_help.toLowerCase()).toContain("question");
  });
});
