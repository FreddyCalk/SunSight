import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classifyBlastError } from './errors.ts';

function edgeError(message: string, code: string) {
  return { name: 'EdgeInvokeError', message, code };
}

describe('classifyBlastError', () => {
  it('marks BLAST_RATE_LIMITED as shared cooldown', () => {
    const result = classifyBlastError(
      edgeError('Please wait before sending another sunset alert.', 'BLAST_RATE_LIMITED'),
    );
    assert.equal(result.kind, 'cooldown');
    assert.equal(result.code, 'BLAST_RATE_LIMITED');
  });

  it('marks validation and auth failures as terminal', () => {
    assert.equal(classifyBlastError(edgeError('bad', 'INVALID_REQUEST')).kind, 'terminal');
    assert.equal(classifyBlastError(edgeError('auth', 'AUTH_REQUIRED')).kind, 'terminal');
  });

  it('marks invoke failures as retryable', () => {
    assert.equal(
      classifyBlastError(edgeError('down', 'EDGE_INVOKE_FAILED')).kind,
      'retryable',
    );
  });

  it('marks MEDIA_PROCESSOR_UNAVAILABLE as terminal', () => {
    const result = classifyBlastError(
      edgeError('Photo processing is temporarily unavailable.', 'MEDIA_PROCESSOR_UNAVAILABLE'),
    );
    assert.equal(result.kind, 'terminal');
    assert.equal(result.code, 'MEDIA_PROCESSOR_UNAVAILABLE');
  });
});
