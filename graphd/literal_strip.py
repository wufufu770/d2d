"""
graphd/literal_strip.py — P0 security hardening

Strips Cypher string literals, comments, and parameter substitutions so
mutation-keyword regex checks cannot be bypassed by placing the keyword
inside a string literal or comment.

Usage:
    from literal_strip import strip_literals_and_comments
    safe = strip_literals_and_comments("MATCH (n) WHERE n.foo = 'DELETE' RETURN n")
    # safe == "MATCH (n) WHERE n.foo =  RETURN n"
"""
import re

# Replace 'string' literals (with support for '' escape), "string" literals,
# Cypher backtick `name` identifiers, /* block comments */, // line comments.
# Parameter placeholders ($name and {name}) are kept (they're not literals).
#
# Strategy: walk character-by-character, track state. When we hit a literal
# or comment start, replace its content with spaces (preserve length for
# accurate line/column reporting, but only spaces are needed for regex).
def strip_literals_and_comments(query: str) -> str:
    if not query:
        return query
    out = list(query)
    i = 0
    n = len(query)
    while i < n:
        c = query[i]
        # Line comment: // to end of line
        if c == "/" and i + 1 < n and query[i + 1] == "/":
            j = query.find("\n", i)
            if j == -1:
                j = n
            for k in range(i, j):
                out[k] = " "
            i = j
            continue
        # Block comment: /* ... */
        if c == "/" and i + 1 < n and query[i + 1] == "*":
            j = query.find("*/", i + 2)
            if j == -1:
                j = n
            else:
                j += 2
            for k in range(i, j):
                out[k] = " "
            i = j
            continue
        # String literal: ' or "
        if c in ("'", '"'):
            quote = c
            j = i + 1
            while j < n:
                if query[j] == "\\" and j + 1 < n:
                    out[j] = " "
                    out[j + 1] = " "
                    j += 2
                    continue
                if query[j] == quote:
                    j += 1
                    break
                out[j] = " "
                j += 1
            out[i] = " "  # also replace the opening quote
            i = j
            continue
        # Backtick identifier: `name`
        if c == "`":
            j = i + 1
            while j < n and query[j] != "`":
                out[j] = " "
                j += 1
            if j < n:
                out[j] = " "
                j += 1
            out[i] = " "
            i = j
            continue
        i += 1
    return "".join(out)


def strip_and_normalize(query: str) -> str:
    """Strip literals+comments, then trim, return ready-for-keyword-check string."""
    return strip_literals_and_comments(query or "").strip()
