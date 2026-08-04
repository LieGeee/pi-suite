import assert from "node:assert/strict";
import { applyTranscriptDelta, mergeTranscriptRecordIntoView, orderedMessagesFromView, transcriptViewFromRecord } from "./transcript-view";
import type { SelectedTranscriptRecord, TranscriptMessage } from "./desktop-state";

function message(id: string, text: string): Extract<TranscriptMessage, { kind: "message" }> {
  return {
    id,
    kind: "message",
    role: "assistant",
    text,
    createdAt: new Date(0).toISOString(),
  };
}

function runTests() {
  const first = message("m1", "hello");
  const second = message("m2", "world");
  const record: SelectedTranscriptRecord = {
    workspaceId: "w1",
    sessionId: "s1",
    transcript: [first, second],
    startIndex: 8,
    totalCount: 10,
  };

  const view = transcriptViewFromRecord(record);
  assert.deepEqual(view.messageIds, ["m1", "m2"]);
  assert.equal(view.startIndex, 8);
  assert.equal(view.totalCount, 10);
  assert.equal(view.messagesById.m1, first);
  assert.equal(view.messagesById.m2, second);
  assert.deepEqual(orderedMessagesFromView(view), [first, second]);

  const replaced = message("m2", "replaced");
  const afterReplace = applyTranscriptDelta(view, {
    workspaceId: "w1",
    sessionId: "s1",
    messageId: "m2",
    replaceMessage: replaced,
  });
  assert.equal(afterReplace.messageIds, view.messageIds);
  assert.equal(afterReplace.messagesById.m1, first);
  assert.deepEqual(afterReplace.messagesById.m2, replaced);

  const afterAppend = applyTranscriptDelta(afterReplace, {
    workspaceId: "w1",
    sessionId: "s1",
    messageId: "m2",
    textDelta: "!",
  });
  assert.equal(afterAppend.messageIds, afterReplace.messageIds);
  assert.equal(afterAppend.messagesById.m1, first);
  assert.equal(afterAppend.messagesById.m2?.kind, "message");
  assert.equal(afterAppend.messagesById.m2?.kind === "message" ? afterAppend.messagesById.m2.text : "", "replaced!");

  const older = message("m0", "older");
  const merged = mergeTranscriptRecordIntoView(afterAppend, {
    workspaceId: "w1",
    sessionId: "s1",
    transcript: [older, first],
    startIndex: 6,
    totalCount: 10,
  });
  assert.deepEqual(merged.messageIds, ["m0", "m1", "m2"]);
  assert.equal(merged.startIndex, 6);
  assert.equal(merged.totalCount, 10);

  const third = message("m3", "new");
  const afterNewMessage = applyTranscriptDelta(afterAppend, {
    workspaceId: "w1",
    sessionId: "s1",
    messageId: "m3",
    replaceMessage: third,
  });
  assert.deepEqual(afterNewMessage.messageIds, ["m1", "m2", "m3"]);
  assert.deepEqual(orderedMessagesFromView(afterNewMessage), [first, afterNewMessage.messagesById.m2, third]);

  // replaceView: true should replace the entire view instead of merging
  {
    const root = message("root", "root msg");
    const beta = message("beta", "beta msg");
    const alpha = message("alpha", "alpha msg");

    const currentView = transcriptViewFromRecord({
      workspaceId: "w1",
      sessionId: "s1",
      transcript: [root, beta],
      startIndex: 0,
      totalCount: 2,
    });

    const replaced = mergeTranscriptRecordIntoView(currentView, {
      workspaceId: "w1",
      sessionId: "s1",
      transcript: [root, alpha],
      startIndex: 0,
      totalCount: 2,
      replaceView: true,
    });

    assert.deepEqual(replaced.messageIds, ["root", "alpha"], "replaceView should replace messageIds");
    assert.equal(replaced.messagesById["beta"], undefined, "replaceView should remove beta from messagesById");
    assert.equal(replaced.messagesById["root"], root);
    assert.equal(replaced.messagesById["alpha"], alpha);
  }
}

runTests();
console.log("transcript-view tests passed");
