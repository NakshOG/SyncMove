/**
 * FRONTEND BREAKING TESTS
 *
 * Static checks that the frontend code is structured correctly and will not
 * break in production. Assumes this file lives in <repo>/tests/.
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..');
const componentsDir = path.join(repoRoot, 'components');
const callRoomPath = path.join(componentsDir, 'chat', 'call-room.tsx');
const sfuServerPath = path.join(repoRoot, 'server', 'mediasoup-server.ts');

// readdirSync({ recursive: true }) returns paths RELATIVE TO THE DIRECTORY YOU PASSED,
// so they must be joined with that directory (not repoRoot).
function listTsx(dir: string): string[] {
  return (fs.readdirSync(dir, { recursive: true }) as string[])
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => path.join(dir, file));
}

const read = (file: string) => fs.readFileSync(file, 'utf8');
const rel = (file: string) => path.relative(repoRoot, file).split(path.sep).join('/');
const hasUseClient = (content: string) => /^\s*(['"])use client\1/.test(content);

const componentFiles = listTsx(componentsDir);

describe('Frontend Code Quality', () => {
  describe('Component Structure', () => {
    it('finds component files to check', () => {
      expect(componentFiles.length).toBeGreaterThan(0);
    });

    it('components that use React hooks have the "use client" directive', () => {
      const hookPattern = /\buse(State|Effect|Callback|Ref|Memo|Reducer|Context)\b/;
      const offenders = componentFiles
        .filter((file) => {
          const content = read(file);
          return hookPattern.test(content) && !hasUseClient(content);
        })
        .map(rel);

      expect(offenders).toEqual([]);
    });

    it('server components do not use browser globals (SSR-safe)', () => {
      const offenders = componentFiles
        .filter((file) => {
          const content = read(file);
          return !hasUseClient(content) && /\b(window|document|navigator|localStorage)\./.test(content);
        })
        .map(rel);

      expect(offenders).toEqual([]);
    });
  });

  describe('Import Security', () => {
    it('components do not import server-only code', () => {
      const serverImport =
        /from\s+['"](express|socket\.io|mediasoup)['"]|from\s+['"][^'"]*\/server\/[^'"]*['"]/;
      const offenders = componentFiles.filter((file) => serverImport.test(read(file))).map(rel);

      expect(offenders).toEqual([]);
    });
  });

  describe('TypeScript Safety', () => {
    it('components do not disable type checking', () => {
      const offenders = componentFiles
        .filter((file) => /@ts-ignore|@ts-nocheck/.test(read(file)))
        .map(rel);

      expect(offenders).toEqual([]);
    });
  });
});

describe('Frontend Integration', () => {
  const callRoom = read(callRoomPath);

  describe('Mediasoup Client Integration', () => {
    it('call-room.tsx initializes the Device with real router capabilities', () => {
      expect(callRoom).toContain('new Device()');
      expect(callRoom).toContain('device.load(');
      expect(callRoom).toContain('routerRtpCapabilities: joined.routerRtpCapabilities');
      // Regression: loading with empty capabilities can never work.
      expect(callRoom).not.toMatch(/routerRtpCapabilities:\s*\{\}/);
    });

    it('call-room.tsx creates both a send and a receive transport', () => {
      expect(callRoom).toContain('createSendTransport(');
      expect(callRoom).toContain('createRecvTransport(');
    });

    it('call-room.tsx requests microphone (and optional camera) access', () => {
      expect(callRoom).toContain('getUserMedia');
      expect(callRoom).toMatch(/audio:\s*\{/);
      expect(callRoom).toMatch(/video:\s*video/);
    });

    it('call-room.tsx does not tear the call down on every state change', () => {
      // Regression: this cleanup depended on a callback that changed with state.
      expect(callRoom).not.toContain('useEffect(() => () => stop(), [stop])');
    });

    it('call-room.tsx avoids `any`', () => {
      expect(callRoom).not.toMatch(/:\s*any\b|<any>|\bas any\b/);
    });
  });

  describe('Signaling Integration', () => {
    const expectedEvents = [
      'call:join',
      'call:create-transport',
      'call:connect-transport',
      'call:produce',
      'call:consume',
      'call:resume-consumer',
    ];

    it('call-room.tsx uses the expected socket events', () => {
      expectedEvents.forEach((event) => expect(callRoom).toContain(`"${event}"`));
    });

    it('every call:* event the client emits is handled by the SFU server', () => {
      const server = read(sfuServerPath);
      const clientEvents = new Set(callRoom.match(/"call:[a-z-]+"/g) ?? []);

      expect(clientEvents.size).toBeGreaterThan(0);
      clientEvents.forEach((event) => expect(server).toContain(event));
    });
  });
});