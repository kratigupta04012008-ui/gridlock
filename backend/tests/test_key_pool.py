"""
Tests for GeminiKeyPool Rotation, Cooldown, and Thread-Safety
"""

import threading
import time
import pytest
from backend.services.llm.provider import GeminiKeyPool, LLMProviderError


def test_key_pool_round_robin():
    keys = ["key-A", "key-B", "key-C"]
    pool = GeminiKeyPool(keys)
    assert pool.total_keys == 3

    # Consecutive calls should cycle round-robin
    assert pool.get_next_key() == "key-A"
    assert pool.get_next_key() == "key-B"
    assert pool.get_next_key() == "key-C"
    assert pool.get_next_key() == "key-A"
    assert pool.get_next_key() == "key-B"


def test_key_pool_rate_limit_cooldown():
    keys = ["key-1", "key-2", "key-3"]
    pool = GeminiKeyPool(keys)

    # Key-1 hits 429
    pool.mark_rate_limited("key-1", cooldown_seconds=10.0)

    # The pool should skip key-1 and cycle key-2 and key-3
    seen = set()
    for _ in range(6):
        k = pool.get_next_key()
        assert k != "key-1"
        seen.add(k)

    assert seen == {"key-2", "key-3"}


def test_key_pool_all_in_cooldown_fallback():
    keys = ["key-X", "key-Y"]
    pool = GeminiKeyPool(keys)

    # Mark both in cooldown
    pool.mark_rate_limited("key-X", cooldown_seconds=100.0)
    pool.mark_rate_limited("key-Y", cooldown_seconds=5.0)  # expires sooner

    # Should fallback to the one with earliest expiry (key-Y)
    assert pool.get_next_key() == "key-Y"


def test_key_pool_thread_safety():
    keys = [f"key-{i}" for i in range(8)]
    pool = GeminiKeyPool(keys)

    results = []
    lock = threading.Lock()

    def worker():
        for _ in range(50):
            k = pool.get_next_key()
            with lock:
                results.append(k)

    threads = [threading.Thread(target=worker) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(results) == 200
    for k in keys:
        assert k in results
