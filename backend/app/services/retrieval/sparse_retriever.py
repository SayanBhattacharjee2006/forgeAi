import math
import re
from typing import Optional, Any
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_qdrant
from app.models.memory import MemoryItem
from app.core.retrieval_config import RetrievalConfig, retrieval_config


class BM25Scorer:
    """BM25 Okapi scoring implementation for exact token and term matching."""

    def __init__(self, corpus: list[str], k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.corpus_size = len(corpus)
        self.doc_lengths = [len(self._tokenize(doc)) for doc in corpus]
        self.avg_doc_len = sum(self.doc_lengths) / max(1, self.corpus_size)
        self.doc_freqs: dict[str, int] = {}
        self.doc_tokens: list[list[str]] = []

        for doc in corpus:
            tokens = self._tokenize(doc)
            self.doc_tokens.append(tokens)
            for token in set(tokens):
                self.doc_freqs[token] = self.doc_freqs.get(token, 0) + 1

    @staticmethod
    def _tokenize(text: str) -> list[str]:
        """Tokenize preserving technical words, camelCase, snake_case, and dots."""
        # Split on non-alphanumeric except dots/underscores/slashes
        tokens = re.findall(r"[a-zA-Z0-9_\-\.\/]+", text.lower())
        return tokens

    def score(self, query: str, doc_idx: int) -> float:
        """Calculate BM25 score for a specific document against query tokens."""
        if self.corpus_size == 0 or doc_idx >= len(self.doc_tokens):
            return 0.0

        query_tokens = self._tokenize(query)
        doc_tokens = self.doc_tokens[doc_idx]
        doc_len = self.doc_lengths[doc_idx]

        score = 0.0
        for token in query_tokens:
            if token not in self.doc_freqs:
                continue

            df = self.doc_freqs[token]
            # Standard BM25 IDF formula
            idf = math.log(1.0 + (self.corpus_size - df + 0.5) / (df + 0.5))

            # Term frequency in document
            tf = doc_tokens.count(token)
            denom = tf + self.k1 * (1.0 - self.b + self.b * (doc_len / max(1.0, self.avg_doc_len)))
            score += idf * ((tf * (self.k1 + 1.0)) / max(1e-5, denom))

        return score


class SparseRetriever:
    """Performs sparse / BM25 lexical retrieval and exact code symbol matching with project isolation."""

    def __init__(self, config: Optional[RetrievalConfig] = None):
        self.config = config or retrieval_config

    async def retrieve(
        self,
        project_id: str,
        collection_name: str,
        query: str,
        exact_terms: list[str],
        candidate_pool: Optional[list[MemoryItem]] = None,
        source_types: Optional[list[str]] = None,
        top_k: Optional[int] = None,
    ) -> list[MemoryItem]:
        """Perform BM25 and exact symbol ranking over project memory chunks."""
        limit = top_k or self.config.sparse_top_k
        items = candidate_pool or []

        # If no candidate pool provided, scroll/fetch from Qdrant with project filter
        if not items:
            items = await self._fetch_project_points(project_id, collection_name, source_types)

        if not items:
            return []

        # Build corpus of chunk contents and metadata representations
        corpus = []
        for it in items:
            text = f"{it.source_id} {it.metadata.get('file_path', '')} {it.metadata.get('author', '')} {it.content}"
            corpus.append(text)

        scorer = BM25Scorer(corpus)

        scored_items: list[tuple[MemoryItem, float]] = []
        for i, item in enumerate(items):
            base_bm25 = scorer.score(query, i)

            # Exact symbol boost
            boost = 1.0
            item_text = f"{item.source_id} {item.content}".lower()
            for term in exact_terms:
                t_low = term.lower()
                if t_low in item_text:
                    boost += self.config.exact_match_boost
                if t_low in item.source_id.lower() or t_low in str(item.metadata.get("file_path", "")).lower():
                    boost += self.config.exact_match_boost * 1.5

            total_score = base_bm25 * boost
            if total_score > 0.0 or any(t.lower() in item_text for t in exact_terms):
                item_copy = item.model_copy()
                item_copy.relevance_score = round(total_score, 4)
                scored_items.append((item_copy, total_score))

        # Sort by sparse score descending
        scored_items.sort(key=lambda x: x[1], reverse=True)
        return [it[0] for it in scored_items[:limit]]

    async def _fetch_project_points(
        self,
        project_id: str,
        collection_name: str,
        source_types: Optional[list[str]] = None,
    ) -> list[MemoryItem]:
        """Fetch project-scoped points from Qdrant for sparse indexing."""
        if not collection_name:
            return []
        try:
            qdrant = get_qdrant()
            from qdrant_client.models import Filter, FieldCondition, MatchValue

            must_conditions = [
                FieldCondition(key="project_id", match=MatchValue(value=project_id))
            ]
            should_conditions = []
            if source_types:
                for st in source_types:
                    should_conditions.append(FieldCondition(key="source_type", match=MatchValue(value=st)))

            q_filter = Filter(
                must=must_conditions,
                should=should_conditions if should_conditions else None,
            )

            # Scroll up to 100 recent points
            try:
                res, _ = await qdrant.scroll(
                    collection_name=collection_name,
                    scroll_filter=q_filter,
                    limit=100,
                    with_payload=True,
                    with_vectors=False,
                )
            except Exception:
                # If payload index is not present, scroll directly and filter in Python
                res, _ = await qdrant.scroll(
                    collection_name=collection_name,
                    limit=100,
                    with_payload=True,
                    with_vectors=False,
                )

            items = []
            for hit in res:
                payload = hit.payload or {}
                if payload.get("project_id") and payload.get("project_id") != project_id:
                    continue

                items.append(
                    MemoryItem(
                        memory_id=str(hit.id),
                        project_id=project_id,
                        source_type=payload.get("source_type", "unknown"),
                        source_id=payload.get("source_id", ""),
                        content=payload.get("content", ""),
                        metadata=payload,
                        relevance_score=0.0,
                    )
                )
            return items
        except Exception:
            return []
