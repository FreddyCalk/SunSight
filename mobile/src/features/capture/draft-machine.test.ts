import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  initialCaptureMachineState,
  reduceCaptureMachine,
  resolveIdempotencyKeyForConfirm,
} from './draft-machine.ts';

describe('resolveIdempotencyKeyForConfirm', () => {
  it('reuses an existing key on retry', () => {
    const existing = '11111111-1111-4111-8111-111111111111';
    assert.equal(
      resolveIdempotencyKeyForConfirm(existing, () => 'new-key'),
      existing,
    );
  });

  it('mints a key when the draft has none', () => {
    assert.equal(
      resolveIdempotencyKeyForConfirm(null, () => 'minted-key'),
      'minted-key',
    );
    assert.equal(
      resolveIdempotencyKeyForConfirm('', () => 'minted-key'),
      'minted-key',
    );
  });
});

describe('reduceCaptureMachine', () => {
  it('routes capture → review → confirm without gallery import', () => {
    let state = initialCaptureMachineState();
    state = reduceCaptureMachine(state, { type: 'permission_granted' });
    assert.equal(state.phase, 'camera');

    state = reduceCaptureMachine(state, {
      type: 'captured',
      uri: 'file:///tmp/sunset.jpg',
    });
    assert.equal(state.phase, 'review');
    assert.equal(state.draft.rawUri, 'file:///tmp/sunset.jpg');
    assert.equal(state.draft.idempotencyKey, null);

    state = reduceCaptureMachine(state, {
      type: 'confirm_send',
      idempotencyKey: 'aaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    });
    assert.equal(state.phase, 'sending');
    assert.equal(state.draft.idempotencyKey, 'aaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    assert.equal(state.sendStep, 'preparing');
  });

  it('clears draft keys on retake so the next confirm mints a new key', () => {
    let state = initialCaptureMachineState();
    state = reduceCaptureMachine(state, { type: 'permission_granted' });
    state = reduceCaptureMachine(state, {
      type: 'captured',
      uri: 'file:///tmp/one.jpg',
    });
    state = reduceCaptureMachine(state, {
      type: 'confirm_send',
      idempotencyKey: 'key-1',
    });
    state = reduceCaptureMachine(state, {
      type: 'send_failed',
      kind: 'retryable',
      message: 'network',
      code: 'EDGE_INVOKE_FAILED',
      draft: {
        idempotencyKey: 'key-1',
        blastId: 'blast-1',
        uploaded: false,
      },
    });
    assert.equal(state.draft.idempotencyKey, 'key-1');

    state = reduceCaptureMachine(state, { type: 'retake' });
    assert.equal(state.phase, 'camera');
    assert.equal(state.draft.rawUri, null);
    assert.equal(state.draft.idempotencyKey, null);
    assert.equal(state.draft.blastId, null);
  });

  it('clears the draft on success', () => {
    let state = initialCaptureMachineState();
    state = reduceCaptureMachine(state, {
      type: 'captured',
      uri: 'file:///tmp/sunset.jpg',
    });
    state = reduceCaptureMachine(state, {
      type: 'confirm_send',
      idempotencyKey: 'key-1',
    });
    state = reduceCaptureMachine(state, {
      type: 'send_succeeded',
      blastId: 'blast-1',
    });
    assert.equal(state.phase, 'success');
    assert.equal(state.draft.rawUri, null);
    assert.equal(state.draft.idempotencyKey, null);
  });

  it('keeps Look-up-compatible messaging when camera is blocked', () => {
    const state = reduceCaptureMachine(initialCaptureMachineState(), {
      type: 'permission_blocked',
    });
    assert.equal(state.phase, 'permission_blocked');
    assert.match(state.message ?? '', /Look up still works/);
  });

  it('marks MEDIA_PROCESSOR_UNAVAILABLE failures as terminal while preserving draft', () => {
    let state = initialCaptureMachineState();
    state = reduceCaptureMachine(state, {
      type: 'captured',
      uri: 'file:///tmp/sunset.jpg',
    });
    state = reduceCaptureMachine(state, {
      type: 'confirm_send',
      idempotencyKey: 'key-1',
    });
    state = reduceCaptureMachine(state, {
      type: 'send_failed',
      kind: 'terminal',
      message: 'Photo processing is temporarily unavailable.',
      code: 'MEDIA_PROCESSOR_UNAVAILABLE',
      draft: {
        idempotencyKey: 'key-1',
        blastId: 'blast-1',
        uploadPath: 'user/blast/original.jpg',
        uploaded: true,
        preparedUri: 'file:///tmp/prepared.jpg',
      },
    });
    assert.equal(state.phase, 'terminal_error');
    assert.equal(state.code, 'MEDIA_PROCESSOR_UNAVAILABLE');
    assert.equal(state.draft.uploaded, true);
    assert.equal(state.draft.idempotencyKey, 'key-1');
  });
});
