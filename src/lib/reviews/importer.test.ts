import { describe, expect, it } from "vitest";
import { cleanReviews } from "./cleaner";
import { collectImportedReviews } from "./importer";

describe("review import", () => {
  it("imports JSON reviews", () => {
    const collection = collectImportedReviews({
      type: "json-file",
      fileName: "reviews.json",
      content: JSON.stringify([
        {
          id: "json-1",
          rating: 1,
          title: "Locked plan",
          content: "I paid but cannot open the workout.",
          author: "tester",
          date: "2026-07-01",
          version: "1.2.0"
        }
      ])
    });

    expect(collection.reviews).toHaveLength(1);
    expect(collection.reviews[0]).toMatchObject({
      id: "json-1",
      rating: 1,
      body: "I paid but cannot open the workout.",
      version: "1.2.0"
    });
  });

  it("imports CSV reviews", () => {
    const collection = collectImportedReviews({
      type: "csv-file",
      fileName: "reviews.csv",
      content:
        "id,rating,title,content,author,date,version\ncsv-1,5,Great app,Helpful workouts,Olivia,2026-07-01,1.3.0"
    });

    expect(collection.reviews).toHaveLength(1);
    expect(collection.reviews[0]).toMatchObject({
      id: "csv-1",
      rating: 5,
      title: "Great app",
      body: "Helpful workouts"
    });
  });

  it("marks illegal ratings for cleaning", () => {
    const collection = collectImportedReviews({
      type: "json-file",
      content: JSON.stringify([{ id: "bad-rating", rating: 7, title: "Bad", content: "Rating is invalid." }])
    });
    const cleaned = cleanReviews(collection.reviews);

    expect(collection.warnings.some((warning) => warning.includes("rating 必须为 1-5"))).toBe(true);
    expect(cleaned.report.malformedCount).toBe(1);
    expect(cleaned.reviews).toHaveLength(0);
  });

  it("marks empty content for cleaning", () => {
    const collection = collectImportedReviews({
      type: "json-file",
      content: JSON.stringify([{ id: "empty", rating: 1, title: "", content: "  " }])
    });
    const cleaned = cleanReviews(collection.reviews);

    expect(collection.warnings.some((warning) => warning.includes("content 为空"))).toBe(true);
    expect(cleaned.report.emptyCount).toBe(1);
  });

  it("allows existing duplicate detection to remove duplicate imported reviews", () => {
    const collection = collectImportedReviews({
      type: "json-file",
      content: JSON.stringify([
        { id: "dup-1", rating: 1, title: "Same", content: "Same complaint", author: "A" },
        { id: "dup-2", rating: 1, title: "Same", content: "Same complaint", author: "A" }
      ])
    });
    const cleaned = cleanReviews(collection.reviews);

    expect(cleaned.report.duplicateCount).toBe(1);
    expect(cleaned.reviews).toHaveLength(1);
  });
});
