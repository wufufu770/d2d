"""gd — graphd/app.py 巨型文件拆分出的子包(纯代码搬移, 逻辑零改动)。
schema: SCHEMA/init_schema/迁移+W5 归属; auth: token 认证; gates: 写门/去重/denylist;
queries: 只读查询封装。app.py 侧 re-export 保持 `from graphd.app import X` 既有导入路径不变。
此处用相对导入聚合 —— 以 `graphd.gd`(pytest/调度器侧)或 `gd`(cd graphd && python3 app.py)
两种形态导入时均成立。"""
from .auth import _safe_token_path, auth_check, legacy_token_ok  # noqa: F401
from .gates import (CONFIG_ADVICE_RE, DENYLIST, FINDING_STATES, FINDING_TRANSITIONS,  # noqa: F401
                    JUNK_PATTERNS, L1_DENY_REASON, MAX_BODY_BYTES, _URL_RE,
                    _read_denylist_file, candidate_watermark_reject, canonical_cat,
                    config_reject, content_length_gate, cvss_or_default,
                    endpoint_sig_duplicate, engagement_cap_gate, finding_gates, hostport_of,
                    is_engagement_create, l1_gate, normalize_title, prose_denylist_hit,
                    redact_pii, repro_gate, title_tokens, titles_duplicate, transition_gate,
                    url_sig, worker_query_allowed)
from .queries import MAX_QUERY_ROWS, _jsonify, bounded_rows  # noqa: F401
from .schema import (SCHEMA, _backfill_eng, attribute_by_time, eng_time_windows,  # noqa: F401
                     host_in_scope, init_schema, parse_scope_allows, pick_write_eng)
