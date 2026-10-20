import { parseShareInvitation, shareInvitationLink } from './invitation-link';

describe('share invitation input', () => {
  const code = 'A'.repeat(43);
  it('accepts the generated portable link or original proof with outer whitespace', () => {
    expect(shareInvitationLink(code)).toBe('diandeng://share/' + code);
    expect(parseShareInvitation('  ' + shareInvitationLink(code) + '\n')).toBe(code);
    expect(parseShareInvitation(code)).toBe(code);
  });
  it('rejects arbitrary URLs, ambiguous link syntax and noncanonical proof', () => {
    for (const value of [null, {}, 'https://evil.example/' + code, 'diandeng://share.evil/' + code,
      'diandeng://user@share/' + code, 'diandeng://share/' + code + '?x=1',
      'diandeng://share/' + code + '#x', 'diandeng://share//' + code,
      code + '/', 'A'.repeat(42) + 'B', 'A'.repeat(257), '点击链接 ' + shareInvitationLink(code)]) {
      expect(parseShareInvitation(value)).toBeNull();
    }
    expect(() => shareInvitationLink('A'.repeat(42) + 'B')).toThrow();
  });
});
