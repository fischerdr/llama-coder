import { info } from '../modules/log';

/**
 * Document session state
 */
export interface DocumentSession {
	/** Document file path */
	filePath: string;
	/** Session creation timestamp */
	createdAt: number;
	/** Last activity timestamp */
	lastActivity: number;
	/** Number of completions requested */
	completionCount: number;
	/** Last prefix used (for incremental updates) */
	lastPrefix?: string;
	/** Last suffix used */
	lastSuffix?: string;
	/** Custom session data */
	data: Map<string, any>;
}

/**
 * Session manager configuration
 */
export interface SessionManagerConfig {
	/** Session TTL in milliseconds (default: 5 minutes) */
	sessionTtlMs?: number;
	/** Maximum concurrent sessions (default: 10) */
	maxSessions?: number;
	/** Prune interval in milliseconds (default: 1 minute) */
	pruneIntervalMs?: number;
}

/**
 * Session manager for document-level state
 *
 * Manages per-document sessions to support:
 * - KV cache reuse hints
 * - Incremental context updates
 * - Session-scoped completion history
 * - Resource cleanup on document close
 */
export class SessionManager {
	private sessions: Map<string, DocumentSession> = new Map();
	private readonly sessionTtlMs: number;
	private readonly maxSessions: number;
	private pruneTimer: ReturnType<typeof setInterval> | null = null;

	constructor(config: SessionManagerConfig = {}) {
		this.sessionTtlMs = config.sessionTtlMs ?? 5 * 60 * 1000;
		this.maxSessions = config.maxSessions ?? 10;

		// Start periodic pruning
		const pruneInterval = config.pruneIntervalMs ?? 60 * 1000;
		if (pruneInterval > 0) {
			this.pruneTimer = setInterval(() => this.prune(), pruneInterval);
		}
	}

	/**
	 * Get or create a session for a document
	 * @param filePath Document file path
	 * @returns Document session
	 */
	getOrCreate(filePath: string): DocumentSession {
		let session = this.sessions.get(filePath);

		if (session) {
			// Update last activity
			session.lastActivity = Date.now();
			return session;
		}

		// Create new session
		session = this.createSession(filePath);

		// Evict oldest if at capacity
		if (this.sessions.size >= this.maxSessions) {
			this.evictOldest();
		}

		this.sessions.set(filePath, session);
		info(`Created session for ${filePath}`);

		return session;
	}

	/**
	 * Get existing session (without creating)
	 * @param filePath Document file path
	 * @returns Document session or undefined
	 */
	get(filePath: string): DocumentSession | undefined {
		const session = this.sessions.get(filePath);

		if (session) {
			// Check if expired
			if (Date.now() - session.lastActivity > this.sessionTtlMs) {
				this.sessions.delete(filePath);
				info(`Session expired for ${filePath}`);
				return undefined;
			}

			session.lastActivity = Date.now();
		}

		return session;
	}

	/**
	 * Update session with completion context
	 * @param filePath Document file path
	 * @param prefix Current prefix
	 * @param suffix Current suffix
	 */
	updateContext(filePath: string, prefix: string, suffix: string): void {
		const session = this.getOrCreate(filePath);
		session.lastPrefix = prefix;
		session.lastSuffix = suffix;
		session.completionCount++;
	}

	/**
	 * Check if context has changed significantly
	 *
	 * Used to determine if cached completions might still be valid
	 * or if new inference is needed.
	 *
	 * @param filePath Document file path
	 * @param prefix Current prefix
	 * @param suffix Current suffix
	 * @returns True if context changed significantly
	 */
	hasContextChanged(
		filePath: string,
		prefix: string,
		suffix: string
	): boolean {
		const session = this.sessions.get(filePath);

		if (!session || !session.lastPrefix) {
			return true; // No previous context
		}

		// Check if user is typing forward (extending prefix)
		if (prefix.startsWith(session.lastPrefix)) {
			const added = prefix.slice(session.lastPrefix.length);
			// Small additions (< 50 chars) may still use cached completion
			if (added.length < 50) {
				return false;
			}
		}

		// Check if user deleted text
		if (session.lastPrefix.startsWith(prefix)) {
			return true; // Deletion always invalidates
		}

		// Suffix changes matter less for FIM
		// But significant changes indicate navigation
		if (suffix !== session.lastSuffix) {
			const suffixDiff = Math.abs(suffix.length - (session.lastSuffix?.length ?? 0));
			if (suffixDiff > 100) {
				return true; // Large suffix change = navigation
			}
		}

		return true; // Default to changed
	}

	/**
	 * Store session data
	 * @param filePath Document file path
	 * @param key Data key
	 * @param value Data value
	 */
	setData(filePath: string, key: string, value: any): void {
		const session = this.getOrCreate(filePath);
		session.data.set(key, value);
	}

	/**
	 * Get session data
	 * @param filePath Document file path
	 * @param key Data key
	 * @returns Data value or undefined
	 */
	getData<T>(filePath: string, key: string): T | undefined {
		const session = this.sessions.get(filePath);
		return session?.data.get(key);
	}

	/**
	 * End a document session
	 * @param filePath Document file path
	 */
	endSession(filePath: string): void {
		if (this.sessions.delete(filePath)) {
			info(`Ended session for ${filePath}`);
		}
	}

	/**
	 * Get all active sessions
	 * @returns Array of active sessions
	 */
	getActiveSessions(): DocumentSession[] {
		const now = Date.now();
		const active: DocumentSession[] = [];

		for (const session of this.sessions.values()) {
			if (now - session.lastActivity <= this.sessionTtlMs) {
				active.push(session);
			}
		}

		return active;
	}

	/**
	 * Get session statistics
	 */
	getStats(): {
		activeCount: number;
		totalCompletions: number;
		oldestSessionAge: number;
	} {
		const now = Date.now();
		let totalCompletions = 0;
		let oldestAge = 0;

		for (const session of this.sessions.values()) {
			totalCompletions += session.completionCount;
			const age = now - session.createdAt;
			if (age > oldestAge) {
				oldestAge = age;
			}
		}

		return {
			activeCount: this.sessions.size,
			totalCompletions,
			oldestSessionAge: oldestAge,
		};
	}

	/**
	 * Clear all sessions
	 */
	clear(): void {
		this.sessions.clear();
		info('All sessions cleared');
	}

	/**
	 * Dispose session manager
	 */
	dispose(): void {
		if (this.pruneTimer) {
			clearInterval(this.pruneTimer);
			this.pruneTimer = null;
		}
		this.sessions.clear();
		info('SessionManager disposed');
	}

	/**
	 * Prune expired sessions
	 * @returns Number of sessions pruned
	 */
	prune(): number {
		const now = Date.now();
		const expired: string[] = [];

		for (const [filePath, session] of this.sessions.entries()) {
			if (now - session.lastActivity > this.sessionTtlMs) {
				expired.push(filePath);
			}
		}

		for (const filePath of expired) {
			this.sessions.delete(filePath);
		}

		if (expired.length > 0) {
			info(`Pruned ${expired.length} expired sessions`);
		}

		return expired.length;
	}

	/**
	 * Create a new session
	 */
	private createSession(filePath: string): DocumentSession {
		const now = Date.now();
		return {
			filePath,
			createdAt: now,
			lastActivity: now,
			completionCount: 0,
			data: new Map(),
		};
	}

	/**
	 * Evict the oldest session
	 */
	private evictOldest(): void {
		let oldestPath: string | null = null;
		let oldestActivity = Infinity;

		for (const [filePath, session] of this.sessions.entries()) {
			if (session.lastActivity < oldestActivity) {
				oldestActivity = session.lastActivity;
				oldestPath = filePath;
			}
		}

		if (oldestPath) {
			this.sessions.delete(oldestPath);
			info(`Evicted oldest session: ${oldestPath}`);
		}
	}
}
