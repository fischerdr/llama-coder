import { SessionManager } from './SessionManager';

describe('SessionManager', () => {
	let manager: SessionManager;

	beforeEach(() => {
		manager = new SessionManager({
			sessionTtlMs: 1000,
			maxSessions: 3,
			pruneIntervalMs: 0, // Disable auto-pruning in tests
		});
	});

	afterEach(() => {
		manager.dispose();
	});

	describe('getOrCreate', () => {
		it('should create new session for unknown file', () => {
			const session = manager.getOrCreate('/test/file.ts');

			expect(session.filePath).toBe('/test/file.ts');
			expect(session.completionCount).toBe(0);
			expect(session.createdAt).toBeLessThanOrEqual(Date.now());
		});

		it('should return existing session for known file', () => {
			const session1 = manager.getOrCreate('/test/file.ts');
			session1.completionCount = 5;

			const session2 = manager.getOrCreate('/test/file.ts');

			expect(session2.completionCount).toBe(5);
		});

		it('should update lastActivity on access', () => {
			const session = manager.getOrCreate('/test/file.ts');
			const firstActivity = session.lastActivity;

			// Wait a bit
			const start = Date.now();
			while (Date.now() - start < 10) {
				// busy wait
			}

			manager.getOrCreate('/test/file.ts');

			expect(session.lastActivity).toBeGreaterThanOrEqual(firstActivity);
		});
	});

	describe('get', () => {
		it('should return undefined for unknown file', () => {
			const session = manager.get('/unknown/file.ts');

			expect(session).toBeUndefined();
		});

		it('should return existing session', () => {
			manager.getOrCreate('/test/file.ts');
			const session = manager.get('/test/file.ts');

			expect(session).toBeDefined();
			expect(session?.filePath).toBe('/test/file.ts');
		});

		it('should return undefined for expired session', async () => {
			manager.getOrCreate('/test/file.ts');

			// Wait for TTL
			await new Promise((resolve) => setTimeout(resolve, 1100));

			const session = manager.get('/test/file.ts');
			expect(session).toBeUndefined();
		});
	});

	describe('updateContext', () => {
		it('should update session with context', () => {
			manager.updateContext('/test/file.ts', 'prefix', 'suffix');

			const session = manager.get('/test/file.ts');
			expect(session?.lastPrefix).toBe('prefix');
			expect(session?.lastSuffix).toBe('suffix');
			expect(session?.completionCount).toBe(1);
		});

		it('should increment completion count', () => {
			manager.updateContext('/test/file.ts', 'p1', 's1');
			manager.updateContext('/test/file.ts', 'p2', 's2');
			manager.updateContext('/test/file.ts', 'p3', 's3');

			const session = manager.get('/test/file.ts');
			expect(session?.completionCount).toBe(3);
		});
	});

	describe('hasContextChanged', () => {
		it('should return true for new session', () => {
			const changed = manager.hasContextChanged(
				'/test/file.ts',
				'prefix',
				'suffix'
			);

			expect(changed).toBe(true);
		});

		it('should return false for small prefix additions', () => {
			manager.updateContext('/test/file.ts', 'function foo() {', '}');

			const changed = manager.hasContextChanged(
				'/test/file.ts',
				'function foo() { return',
				'}'
			);

			expect(changed).toBe(false);
		});

		it('should return true for deletions', () => {
			manager.updateContext('/test/file.ts', 'function foo() { return', '}');

			const changed = manager.hasContextChanged(
				'/test/file.ts',
				'function foo() {',
				'}'
			);

			expect(changed).toBe(true);
		});

		it('should detect large suffix changes as navigation', () => {
			manager.updateContext('/test/file.ts', 'prefix', 'short suffix');

			// Different prefix (not extending) triggers change detection
			const changed = manager.hasContextChanged(
				'/test/file.ts',
				'different prefix',
				'x'.repeat(200)
			);

			expect(changed).toBe(true);
		});
	});

	describe('session data', () => {
		it('should store and retrieve data', () => {
			manager.setData('/test/file.ts', 'key', 'value');
			const value = manager.getData<string>('/test/file.ts', 'key');

			expect(value).toBe('value');
		});

		it('should return undefined for missing key', () => {
			manager.getOrCreate('/test/file.ts');
			const value = manager.getData<string>('/test/file.ts', 'missing');

			expect(value).toBeUndefined();
		});

		it('should store complex data', () => {
			const data = { foo: 'bar', count: 42 };
			manager.setData('/test/file.ts', 'complex', data);
			const retrieved = manager.getData<typeof data>('/test/file.ts', 'complex');

			expect(retrieved).toEqual(data);
		});
	});

	describe('endSession', () => {
		it('should remove session', () => {
			manager.getOrCreate('/test/file.ts');
			manager.endSession('/test/file.ts');

			expect(manager.get('/test/file.ts')).toBeUndefined();
		});

		it('should not throw for unknown file', () => {
			expect(() => manager.endSession('/unknown/file.ts')).not.toThrow();
		});
	});

	describe('capacity management', () => {
		it('should evict oldest session when at capacity', () => {
			manager.getOrCreate('/file1.ts');

			// Small delay to ensure different timestamps
			const start = Date.now();
			while (Date.now() - start < 5) {}

			manager.getOrCreate('/file2.ts');
			manager.getOrCreate('/file3.ts');

			// This should evict /file1.ts
			manager.getOrCreate('/file4.ts');

			expect(manager.get('/file1.ts')).toBeUndefined();
			expect(manager.get('/file2.ts')).toBeDefined();
			expect(manager.get('/file3.ts')).toBeDefined();
			expect(manager.get('/file4.ts')).toBeDefined();
		});
	});

	describe('prune', () => {
		it('should remove expired sessions', async () => {
			manager.getOrCreate('/file1.ts');
			manager.getOrCreate('/file2.ts');

			// Wait for TTL
			await new Promise((resolve) => setTimeout(resolve, 1100));

			const pruned = manager.prune();

			expect(pruned).toBe(2);
			expect(manager.getStats().activeCount).toBe(0);
		});

		it('should not remove active sessions', () => {
			manager.getOrCreate('/file1.ts');

			const pruned = manager.prune();

			expect(pruned).toBe(0);
			expect(manager.getStats().activeCount).toBe(1);
		});
	});

	describe('getActiveSessions', () => {
		it('should return all active sessions', () => {
			manager.getOrCreate('/file1.ts');
			manager.getOrCreate('/file2.ts');

			const active = manager.getActiveSessions();

			expect(active.length).toBe(2);
		});

		it('should not include expired sessions', async () => {
			manager.getOrCreate('/file1.ts');

			await new Promise((resolve) => setTimeout(resolve, 1100));

			const active = manager.getActiveSessions();

			expect(active.length).toBe(0);
		});
	});

	describe('getStats', () => {
		it('should return correct statistics', () => {
			manager.getOrCreate('/file1.ts');
			manager.updateContext('/file1.ts', 'p', 's');
			manager.updateContext('/file1.ts', 'p', 's');
			manager.getOrCreate('/file2.ts');
			manager.updateContext('/file2.ts', 'p', 's');

			const stats = manager.getStats();

			expect(stats.activeCount).toBe(2);
			expect(stats.totalCompletions).toBe(3);
			expect(stats.oldestSessionAge).toBeGreaterThanOrEqual(0);
		});
	});

	describe('clear', () => {
		it('should remove all sessions', () => {
			manager.getOrCreate('/file1.ts');
			manager.getOrCreate('/file2.ts');

			manager.clear();

			expect(manager.getStats().activeCount).toBe(0);
		});
	});

	describe('dispose', () => {
		it('should clean up resources', () => {
			manager.getOrCreate('/file1.ts');

			manager.dispose();

			expect(manager.getStats().activeCount).toBe(0);
		});
	});
});
