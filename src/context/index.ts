/**
 * Context Management Module
 *
 * Provides token-aware context building, caching, and session management
 * for efficient FIM prompt construction.
 */

// Tokenization and budget management
export {
	ITokenizer,
	TokenEstimate,
	TokenBudget,
	EstimationTokenizer,
	LineAwareTokenizer,
	TokenizerFactory,
	createTokenBudget,
} from './Tokenizer';

// Context building
export {
	ContextBuilder,
	ContextBuilderConfig,
	ContextPiece,
	ContextSourceType,
	BuiltContext,
} from './ContextBuilder';

// Scope detection
export { ScopeDetector, ScopeType, ScopeInfo } from './ScopeDetector';

// Completion caching
export {
	SemanticCache,
	CacheConfig,
	CacheKey,
	CacheEntry,
	CacheStats,
} from './SemanticCache';

// Session management
export {
	SessionManager,
	SessionManagerConfig,
	DocumentSession,
} from './SessionManager';
