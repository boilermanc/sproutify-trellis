import { test } from "node:test";
import assert from "node:assert/strict";
import { assessmentDocx } from "../services/companyAssessmentDocx.mjs";
import { assessmentFixture } from "./fixtures/company-assessment.mjs";
import { unzipSync, strFromU8 } from "fflate";

test("styled Word export preserves editable evidence, links, questions and decisions", async () => {
  const room = assessmentFixture();
  room.state.decisions = [{ status: "proposed", text: "Confirm scope <before> starting & pricing." }];
  const blob = await assessmentDocx(room);
  const zip = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const xml = strFromU8(zip["word/document.xml"]);
  assert.match(xml, /Clarify the existing enquiry journey first/);
  assert.match(xml, /Which enquiry path matters most/);
  assert.match(xml, /Confirm scope &lt;before&gt; starting &amp; pricing/);
  assert.match(xml, /w:tblHeader/);
  assert.match(xml, /w:hyperlink/);
  assert.match(xml, /w:keepNext/);
  const rels = strFromU8(zip["word/_rels/document.xml.rels"]);
  assert.match(rels, /https:\/\/example.com/);
  const footer = strFromU8(zip["word/footer1.xml"]);
  assert.match(footer, /NUMPAGES/);
  assert.match(footer, /PAGE/);
  assert.equal(Object.keys(zip).filter(name => name.startsWith("word/media/")).length, 0);
});

test("Word export handles long titles, Unicode and missing optional collections", async () => {
  const room = assessmentFixture();
  room.title = "A very long client name — Café & Partners ".repeat(4);
  delete room.state.questions;
  delete room.state.decisions;
  const zip = unzipSync(new Uint8Array(await (await assessmentDocx(room)).arrayBuffer()));
  const xml = strFromU8(zip["word/document.xml"]);
  assert.match(xml, /Café &amp; Partners/);
  assert.match(xml, /No open questions recorded/);
  assert.match(xml, /No decisions recorded/);
});
